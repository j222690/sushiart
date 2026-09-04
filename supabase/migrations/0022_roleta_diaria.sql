-- =============================================================================
-- O aviso da roleta, todo dia, sozinho
--
-- A roleta é um giro por dia. Só que ninguém abre o app para lembrar disso — o
-- recurso existe e fica parado. Um empurrãozinho de manhã resolve, e é o tipo
-- de coisa que só funciona se acontecer sem ninguém precisar lembrar.
--
-- Roda pelo pg_cron, dentro do próprio banco. Poderia ser um serviço externo,
-- mas tudo que este aviso precisa saber já está aqui: se a roleta está ligada,
-- se a casa abre hoje, e qual texto usar.
--
-- TRÊS TRAVAS, e cada uma evita um jeito de irritar o cliente
--
--   1. Roleta desligada no painel → não manda. Convidar para girar uma roleta
--      que não existe é a definição de propaganda inútil.
--   2. Casa fechada hoje → não manda. O prêmio da roleta é um cupom com
--      validade curta; ganhar num dia que não dá para pedir é frustração.
--   3. Já mandou hoje → não manda. Protege contra o agendador rodar duas
--      vezes, que acontece.
-- =============================================================================

create extension if not exists pg_cron;

create or replace function campanha_diaria_roleta()
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_hoje    date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ativa   boolean;
  v_fechado boolean;
  v_titulo  text;
  v_corpo   text;
  v_link    text;
begin
  select active into v_ativa from roulette_config where id = 1;
  if not coalesce(v_ativa, false) then
    return 'roleta desligada no painel — nada enviado';
  end if;

  select exists (
    select 1 from business_exceptions where date = v_hoje and closed
  ) into v_fechado;
  if v_fechado then
    return 'a casa não abre hoje — nada enviado';
  end if;

  -- Já saiu um aviso de roleta hoje? O agendador pode disparar duas vezes
  -- depois de uma manutenção, e a base não pode pagar por isso.
  if exists (
    select 1 from notifications
    where kind = 'marketing'
      and customer_id is null
      and data->>'origem' = 'roleta_diaria'
      and (created_at at time zone 'America/Sao_Paulo')::date = v_hoje
  ) then
    return 'já enviado hoje';
  end if;

  -- Alterna entre as duas mensagens de roleta pelo dia do mês. Texto idêntico
  -- todo santo dia é o caminho mais curto para a pessoa parar de ler.
  select preencher_marcadores(t.titulo), preencher_marcadores(t.corpo), t.link
    into v_titulo, v_corpo, v_link
  from notification_templates t
  where t.ativo and t.categoria = 'Roleta'
  order by t.sort_order
  offset (extract(day from v_hoje)::int % greatest(1, (
    select count(*) from notification_templates where ativo and categoria = 'Roleta'
  )))
  limit 1;

  if v_titulo is null then
    return 'nenhuma mensagem de roleta cadastrada';
  end if;

  insert into notifications (customer_id, audience, kind, title, body, data)
  values (
    null, 'cliente', 'marketing', v_titulo, v_corpo,
    -- `origem` é o que a trava de "já enviado hoje" procura. Sem essa marca
    -- não daria para distinguir o envio automático de um disparo manual que o
    -- restaurante tenha feito com o mesmo texto.
    jsonb_build_object('link', coalesce(v_link, '/ofertas#roleta'), 'origem', 'roleta_diaria')
  );

  return 'enviado: ' || v_titulo;
end;
$$;

revoke all on function campanha_diaria_roleta() from public, anon;

-- ---------------------------------------------------------------------------
-- O agendamento
--
-- 13:00 UTC = 10:00 em Brasília. De manhã, e não à noite: a ideia é a pessoa
-- girar cedo, ver o desconto que ganhou e já decidir que o jantar sai daqui.
-- Um aviso às 20h chega quando ela já pediu em outro lugar.
--
-- O pg_cron trabalha em UTC. Nos meses de horário de verão isso escorrega uma
-- hora — para um convite de manhã, escorregar de 10h para 9h não muda nada, e
-- não vale a complexidade de corrigir.
-- ---------------------------------------------------------------------------
select cron.unschedule('roleta-diaria')
where exists (select 1 from cron.job where jobname = 'roleta-diaria');

select cron.schedule(
  'roleta-diaria',
  '0 13 * * *',
  $$ select campanha_diaria_roleta(); $$
);
