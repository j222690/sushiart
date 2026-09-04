-- =============================================================================
-- Escolher a mensagem sozinho, quando ninguém escolher
--
-- A biblioteca tem 25 mensagens (0018), mas escolher uma dá trabalho e no meio
-- do serviço ninguém para para pensar em marketing. O resultado previsível é a
-- campanha nunca sair — ou sair sempre a mesma, porque é a primeira da lista.
--
-- Esta função olha a hora, o dia, se a loja abre hoje e o que existe de oferta
-- e cupom no ar, e devolve a mensagem que faz sentido AGORA. O painel mostra
-- qual escolheu e deixa trocar: a automação sugere, ela não decide sozinha.
--
-- Também não repete: o que saiu nos últimos 7 dias fica de fora. Base que
-- recebe o mesmo aviso toda semana aprende a ignorar — ou desinstala.
-- =============================================================================

/**
 * Troca os marcadores da mensagem por dados de verdade.
 *
 * O texto guarda `{oferta}`, `{cupom}`, `{desconto}`. Sem isso o cliente
 * receberia literalmente "Use {cupom} e ganhe {desconto}", que é pior que não
 * mandar nada.
 */
create or replace function preencher_marcadores(p_texto text)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_txt     text := p_texto;
  v_oferta  text;
  v_cupom   coupons;
  v_desc    text;
  v_produto text;
begin
  -- A oferta que está no ar agora.
  select o.title into v_oferta
  from offers o
  where o.active
    and (o.starts_at is null or o.starts_at <= now())
    and (o.ends_at is null or o.ends_at >= now())
  order by o.sort_order
  limit 1;

  -- O cupom público mais recente que ainda vale.
  select * into v_cupom
  from coupons
  where active and is_public and customer_id is null
    and (valid_until is null or valid_until > now())
  order by created_at desc
  limit 1;

  if v_cupom.id is not null then
    v_desc := case v_cupom.discount_kind
      when 'percentual'   then v_cupom.discount_percent::text || '% de desconto'
      when 'fixo'         then 'R$ ' || to_char(v_cupom.discount_cents / 100.0, 'FM999990D00') || ' de desconto'
      when 'frete_gratis' then 'frete grátis'
      else 'um brinde'
    end;
  end if;

  select p.name into v_produto
  from products p
  where p.active and not p.sold_out
  order by p.is_new desc nulls last, p.sort_order
  limit 1;

  -- Sem dado real, o marcador vira um texto genérico que ainda faz sentido na
  -- frase. Nunca fica o `{marcador}` cru.
  v_txt := replace(v_txt, '{oferta}',   coalesce(v_oferta,  'A oferta do dia'));
  v_txt := replace(v_txt, '{produto}',  coalesce(v_produto, 'nosso combinado'));
  v_txt := replace(v_txt, '{cupom}',    coalesce(v_cupom.code, 'o cupom do app'));
  v_txt := replace(v_txt, '{desconto}', coalesce(v_desc, 'um desconto'));
  v_txt := replace(v_txt, '{valor}',    'R$ 90,00');
  v_txt := replace(v_txt, '{faltam}',   'poucos pedidos');
  v_txt := replace(v_txt, '{pontos}',   'seus pontos');
  v_txt := replace(v_txt, '{tempo}',    'o normal');

  return v_txt;
end;
$$;

/**
 * A mensagem que faz sentido agora.
 *
 * A ordem das regras é a ordem de urgência: avisar que a casa não abre hoje
 * importa mais que anunciar promoção, e anunciar a promoção que está no ar
 * importa mais que uma mensagem genérica de sexta.
 */
create or replace function sugerir_campanha()
returns table (
  id        uuid,
  categoria text,
  titulo    text,
  corpo     text,
  link      text,
  motivo    text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_agora     timestamptz := now() at time zone 'UTC' at time zone 'America/Sao_Paulo';
  v_hora      int := extract(hour from (now() at time zone 'America/Sao_Paulo'));
  v_dia       int := extract(dow from (now() at time zone 'America/Sao_Paulo'));
  v_fechado   boolean;
  v_tem_oferta boolean;
  v_cupom_novo boolean;
  v_cat       text;
  v_motivo    text;
begin
  if not is_admin() then
    raise exception 'Apenas administradores.' using errcode = '42501';
  end if;

  select exists (
    select 1 from business_exceptions
    where date = (now() at time zone 'America/Sao_Paulo')::date and closed
  ) into v_fechado;

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

  -- ------------------------------------------------------------------
  -- As regras, da mais urgente para a mais genérica.
  -- ------------------------------------------------------------------
  if v_fechado then
    v_cat := 'Operação';
    v_motivo := 'a loja não abre hoje — avisar evita pedido perdido e cliente irritado';

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

  elsif v_dia = 2 then
    v_cat := 'Ofertas';
    v_motivo := 'terça costuma ser o dia mais parado da semana';

  else
    v_cat := 'Abertura';
    v_motivo := 'sem nada específico agora — um convite simples para o cardápio';
  end if;

  return query
  select
    t.id,
    t.categoria,
    preencher_marcadores(t.titulo),
    preencher_marcadores(t.corpo),
    t.link,
    v_motivo
  from notification_templates t
  where t.ativo
    and t.categoria = v_cat
    -- Não repete o que já saiu na última semana.
    and not exists (
      select 1 from notifications n
      where n.created_at > now() - interval '7 days'
        and n.title = preencher_marcadores(t.titulo)
    )
  order by t.sort_order
  limit 1;

  -- Se todas da categoria já saíram nesta semana, cai para qualquer uma que
  -- não tenha saído. Melhor mandar algo fora do tema do que não mandar.
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

revoke all on function sugerir_campanha() from public, anon;
revoke all on function preencher_marcadores(text) from public, anon;
grant execute on function sugerir_campanha() to authenticated;
grant execute on function preencher_marcadores(text) to authenticated;

/** A biblioteca inteira, com os marcadores já preenchidos, para o painel. */
create or replace function listar_modelos()
returns table (
  id uuid, categoria text, titulo text, corpo text, link text, dica_horario text
)
language sql stable security definer set search_path = public as $$
  select t.id, t.categoria,
         preencher_marcadores(t.titulo), preencher_marcadores(t.corpo),
         t.link, t.dica_horario
  from notification_templates t
  where t.ativo
  order by t.categoria, t.sort_order;
$$;

revoke all on function listar_modelos() from public, anon;
grant execute on function listar_modelos() to authenticated;
