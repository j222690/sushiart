-- =============================================================================
-- "Abrimos agora", quando a casa realmente abre
--
-- E uma correção: a sugestão de campanha oferecia promoção na TERÇA, que é
-- justamente o dia em que o restaurante não abre.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A casa abre hoje?
--
-- Duas coisas, e faltava uma. `business_exceptions` cobre o feriado e a folga
-- avulsa; `business_hours` cobre o dia da semana em que a casa nunca abre — e
-- ali a ausência de linha (ou `active = false`) é o que significa "fechado".
--
-- Esta função existe porque a resposta estava espalhada: quem só olhava as
-- exceções concluía que terça é um dia normal. Foi assim que a sugestão de
-- campanha passou a oferecer promoção no dia em que a cozinha está apagada.
-- ---------------------------------------------------------------------------
create or replace function abre_hoje()
returns boolean
language sql stable security definer set search_path = public as $$
  select
    not exists (
      select 1 from business_exceptions
      where date = (now() at time zone 'America/Sao_Paulo')::date and closed
    )
    and exists (
      select 1 from business_hours
      where weekday = extract(dow from (now() at time zone 'America/Sao_Paulo'))::int
        and active
    );
$$;

revoke all on function abre_hoje() from public, anon;
grant execute on function abre_hoje() to authenticated;

-- ---------------------------------------------------------------------------
-- O aviso de abertura
--
-- Roda a cada 15 minutos e só age na janela logo depois de a casa abrir. Podia
-- ser um horário fixo às 18h30, mas aí mudar o horário no painel deixaria o
-- aviso saindo na hora errada, calado sobre o próprio erro. Assim ele segue o
-- que está cadastrado, qualquer que seja.
-- ---------------------------------------------------------------------------
create or replace function campanha_abrimos_agora()
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_hoje    date := (now() at time zone 'America/Sao_Paulo')::date;
  v_agora   time := (now() at time zone 'America/Sao_Paulo')::time;
  v_abre    time;
  v_titulo  text;
  v_corpo   text;
  v_link    text;
begin
  if not abre_hoje() then
    return 'a casa não abre hoje — nada enviado';
  end if;

  -- O horário de hoje: o da exceção, se houver, senão o do dia da semana.
  select coalesce(
    (select e.opens_at from business_exceptions e where e.date = v_hoje and not e.closed),
    (select h.opens_at from business_hours h
      where h.weekday = extract(dow from v_hoje)::int and h.active limit 1)
  ) into v_abre;

  if v_abre is null then
    return 'sem horário de abertura cadastrado';
  end if;

  -- A janela: dos 20 minutos seguintes à abertura. O agendador roda a cada 15,
  -- então 20 dá folga para um atraso sem correr o risco de pular o dia.
  if v_agora < v_abre or v_agora > v_abre + interval '20 minutes' then
    return 'fora da janela de abertura (abre às ' || to_char(v_abre, 'HH24:MI') || ')';
  end if;

  if exists (
    select 1 from notifications
    where kind = 'marketing' and customer_id is null
      and data->>'origem' = 'abertura'
      and (created_at at time zone 'America/Sao_Paulo')::date = v_hoje
  ) then
    return 'já enviado hoje';
  end if;

  -- Alterna entre as mensagens de abertura pelo dia do mês, pelo mesmo motivo
  -- da roleta: texto igual todo dia deixa de ser lido.
  select preencher_marcadores(t.titulo), preencher_marcadores(t.corpo), t.link
    into v_titulo, v_corpo, v_link
  from notification_templates t
  where t.ativo and t.categoria = 'Abertura'
  order by t.sort_order
  offset (extract(day from v_hoje)::int % greatest(1, (
    select count(*) from notification_templates where ativo and categoria = 'Abertura'
  )))
  limit 1;

  if v_titulo is null then
    return 'nenhuma mensagem de abertura cadastrada';
  end if;

  insert into notifications (customer_id, audience, kind, title, body, data)
  values (
    null, 'cliente', 'marketing', v_titulo, v_corpo,
    jsonb_build_object('link', coalesce(v_link, '/cardapio'), 'origem', 'abertura')
  );

  return 'enviado: ' || v_titulo;
end;
$$;

revoke all on function campanha_abrimos_agora() from public, anon;

select cron.unschedule('abrimos-agora')
where exists (select 1 from cron.job where jobname = 'abrimos-agora');

-- A cada 15 minutos, mas a função só age na janela certa. Rodar sempre e
-- decidir dentro é mais simples — e mais correto — do que agendar num horário
-- fixo que pode divergir do que está no painel.
select cron.schedule(
  'abrimos-agora',
  '*/15 * * * *',
  $$ select campanha_abrimos_agora(); $$
);

-- ---------------------------------------------------------------------------
-- A correção na sugestão de campanha
--
-- A regra "terça costuma ser o dia mais parado" oferecia promoção justamente
-- no dia em que a casa não abre. E a checagem de fechado só olhava as
-- exceções, o que deixava o dia fixo de folga passar despercebido.
-- ---------------------------------------------------------------------------
create or replace function sugerir_campanha()
returns table (
  id uuid, categoria text, titulo text, corpo text, link text, motivo text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_hora       int := extract(hour from (now() at time zone 'America/Sao_Paulo'));
  v_dia        int := extract(dow from (now() at time zone 'America/Sao_Paulo'));
  v_tem_oferta boolean;
  v_cupom_novo boolean;
  v_cat        text;
  v_motivo     text;
begin
  if not is_admin() then
    raise exception 'Apenas administradores.' using errcode = '42501';
  end if;

  select exists (
    select 1 from offers o
    where o.active
      and (o.starts_at is null or o.starts_at <= now())
      and (o.ends_at is null or o.ends_at >= now())
  ) into v_tem_oferta;

  select exists (
    select 1 from coupons
    where active and is_public and customer_id is null
      and created_at > now() - interval '3 days'
  ) into v_cupom_novo;

  if not abre_hoje() then
    v_cat := 'Operação';
    v_motivo := 'a casa não abre hoje — avisar evita pedido perdido e cliente irritado';

  elsif v_cupom_novo then
    v_cat := 'Cupom';
    v_motivo := 'entrou cupom público nos últimos dias e a base ainda não soube';

  elsif v_tem_oferta and v_hora between 16 and 20 then
    v_cat := 'Ofertas';
    v_motivo := 'tem oferta no ar e é a hora em que se decide o jantar';

  elsif v_hora between 16 and 19 and v_dia in (5, 6) then
    v_cat := 'Abertura';
    v_motivo := 'fim de semana começando, na hora de decidir o jantar';

  elsif v_hora between 9 and 12 then
    v_cat := 'Roleta';
    v_motivo := 'manhã: girar a roleta cedo faz a pessoa já pensar no jantar aqui';

  elsif v_hora >= 21 then
    v_cat := 'Carrinho';
    v_motivo := 'fim da noite: quem montou carrinho e não fechou ainda dá tempo';

  else
    v_cat := 'Abertura';
    v_motivo := 'sem nada específico agora — um convite simples para o cardápio';
  end if;

  return query
  select t.id, t.categoria, preencher_marcadores(t.titulo),
         preencher_marcadores(t.corpo), t.link, v_motivo
  from notification_templates t
  where t.ativo and t.categoria = v_cat
    and not exists (
      select 1 from notifications n
      where n.created_at > now() - interval '7 days'
        and n.title = preencher_marcadores(t.titulo)
    )
  order by t.sort_order
  limit 1;

  if not found then
    return query
    select t.id, t.categoria, preencher_marcadores(t.titulo),
           preencher_marcadores(t.corpo), t.link,
           v_motivo || ' (as desta categoria já saíram esta semana)'
    from notification_templates t
    where t.ativo
      and not exists (
        select 1 from notifications n
        where n.created_at > now() - interval '7 days'
          and n.title = preencher_marcadores(t.titulo)
      )
    order by random()
    limit 1;
  end if;
end;
$$;

-- A mesma correção no aviso diário da roleta: ele conferia só as exceções.
create or replace function campanha_diaria_roleta()
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_hoje   date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ativa  boolean;
  v_titulo text;
  v_corpo  text;
  v_link   text;
begin
  select active into v_ativa from roulette_config where id = 1;
  if not coalesce(v_ativa, false) then
    return 'roleta desligada no painel — nada enviado';
  end if;

  if not abre_hoje() then
    return 'a casa não abre hoje — nada enviado';
  end if;

  if exists (
    select 1 from notifications
    where kind = 'marketing' and customer_id is null
      and data->>'origem' = 'roleta_diaria'
      and (created_at at time zone 'America/Sao_Paulo')::date = v_hoje
  ) then
    return 'já enviado hoje';
  end if;

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
    jsonb_build_object('link', coalesce(v_link, '/ofertas#roleta'), 'origem', 'roleta_diaria')
  );

  return 'enviado: ' || v_titulo;
end;
$$;
