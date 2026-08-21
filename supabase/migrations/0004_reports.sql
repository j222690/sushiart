-- =============================================================================
-- Relatórios do painel admin.
-- Todas conferem is_staff() — um cliente autenticado que chamar a RPC direto
-- recebe 42501, não os números do restaurante.
-- Convenção: só entra no faturamento o pedido que não foi cancelado e que não
-- ficou parado em 'aguardando_pagamento' (Pix abandonado não é venda).
-- =============================================================================

create or replace function assert_staff()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then
    raise exception 'Acesso restrito à equipe.' using errcode = '42501';
  end if;
end;
$$;
grant execute on function assert_staff() to authenticated;

-- ---------------------------------------------------------------------------
-- Visão geral do período
-- ---------------------------------------------------------------------------
create or replace function report_summary(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_result jsonb;
begin
  perform assert_staff();

  select jsonb_build_object(
    'orders_count',      count(*),
    'revenue_cents',     coalesce(sum(total_cents), 0),
    'avg_ticket_cents',  coalesce(round(avg(total_cents))::integer, 0),
    'subtotal_cents',    coalesce(sum(subtotal_cents), 0),
    'delivery_cents',    coalesce(sum(delivery_fee_cents), 0),
    'discount_cents',    coalesce(sum(discount_cents), 0),
    'delivery_orders',   count(*) filter (where fulfillment = 'entrega'),
    'pickup_orders',     count(*) filter (where fulfillment = 'retirada'),
    'canceled_orders', (
      select count(*) from orders
      where created_at between p_from and p_to and status = 'cancelado'
    ),
    'pending_payment', (
      select count(*) from orders
      where created_at between p_from and p_to and status = 'aguardando_pagamento'
    )
  )
  into v_result
  from orders
  where created_at between p_from and p_to
    and status not in ('cancelado', 'aguardando_pagamento');

  return v_result;
end;
$$;
grant execute on function report_summary(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Faturamento por forma de pagamento.
-- `cash_cents` é o que o entregador tem que devolver em caixa.
-- ---------------------------------------------------------------------------
create or replace function report_by_payment(p_from timestamptz, p_to timestamptz)
returns table (
  method           payment_method,
  on_delivery_kind on_delivery_kind,
  provider         text,
  orders_count     bigint,
  revenue_cents    bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform assert_staff();

  -- Quebra também por forma na entrega: "na entrega" somado num bloco só
  -- esconderia quanto foi dinheiro vivo e quanto foi maquininha.
  return query
  select o.payment_method,
         o.on_delivery_kind,
         coalesce(o.payment_provider, 'manual'),
         count(*),
         coalesce(sum(o.total_cents), 0)
  from orders o
  where o.created_at between p_from and p_to
    and o.status not in ('cancelado', 'aguardando_pagamento')
  group by o.payment_method, o.on_delivery_kind, coalesce(o.payment_provider, 'manual')
  order by 5 desc;
end;
$$;
grant execute on function report_by_payment(timestamptz, timestamptz) to authenticated;

-- Conferência de caixa com o entregador: SÓ dinheiro vivo, só entregues.
-- Cartão na maquininha do entregador não entra aqui — aquele dinheiro cai na
-- conta do gateway, não na mão de ninguém.
create or replace function report_cash_reconciliation(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform assert_staff();

  select jsonb_build_object(
    'orders_count',   count(*),
    'total_cents',    coalesce(sum(total_cents), 0),
    'needs_change',   count(*) filter (where change_for_cents is not null),
    'change_due_cents', coalesce(sum(greatest(coalesce(change_for_cents, 0) - total_cents, 0)), 0),
    'orders', coalesce(jsonb_agg(jsonb_build_object(
        'code', code, 'total_cents', total_cents,
        'change_for_cents', change_for_cents,
        'created_at', created_at
      ) order by created_at), '[]'::jsonb)
  )
  into v
  from orders
  where created_at between p_from and p_to
    and payment_method = 'na_entrega'
    and on_delivery_kind = 'dinheiro'
    and status = 'entregue';

  return v;
end;
$$;
grant execute on function report_cash_reconciliation(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Produtos mais vendidos
-- ---------------------------------------------------------------------------
create or replace function report_top_products(
  p_from timestamptz, p_to timestamptz, p_limit integer default 15
)
returns table (
  product_id    uuid,
  product_name  text,
  product_image text,
  units         bigint,
  revenue_cents bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform assert_staff();

  return query
  select oi.product_id, oi.product_name, max(oi.product_image),
         sum(oi.quantity)::bigint, sum(oi.total_cents)::bigint
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.created_at between p_from and p_to
    and o.status not in ('cancelado', 'aguardando_pagamento')
  group by oi.product_id, oi.product_name
  order by 4 desc
  limit p_limit;
end;
$$;
grant execute on function report_top_products(timestamptz, timestamptz, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Faturamento dia a dia (gráfico do dashboard)
-- ---------------------------------------------------------------------------
create or replace function report_daily_revenue(p_from timestamptz, p_to timestamptz)
returns table (day date, orders_count bigint, revenue_cents bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform assert_staff();

  -- generate_series garante um ponto por dia mesmo nos dias sem venda,
  -- senão o gráfico "pula" as segundas-feiras fechadas.
  return query
  select gs::date as day,
         count(o.id)::bigint,
         coalesce(sum(o.total_cents), 0)::bigint
  from generate_series(p_from::date, p_to::date, interval '1 day') gs
  left join orders o
    on (o.created_at at time zone 'America/Sao_Paulo')::date = gs::date
   and o.status not in ('cancelado', 'aguardando_pagamento')
  group by gs
  order by gs;
end;
$$;
grant execute on function report_daily_revenue(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Impacto das promoções: roleta, cupons e ticket médio com/sem desconto
-- ---------------------------------------------------------------------------
create or replace function report_promotions(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_spins        bigint;
  v_spin_users   bigint;
  v_won          bigint;
  v_redeemed     bigint;
  v_ticket_with  integer;
  v_ticket_without integer;
  v_by_coupon    jsonb;
  v_by_prize     jsonb;
begin
  perform assert_staff();

  select count(*), count(distinct customer_id), count(*) filter (where coupon_id is not null)
    into v_spins, v_spin_users, v_won
  from roulette_spins
  where created_at between p_from and p_to;

  select count(*) into v_redeemed
  from coupon_redemptions
  where created_at between p_from and p_to;

  select coalesce(round(avg(total_cents))::integer, 0) into v_ticket_with
  from orders
  where created_at between p_from and p_to
    and status not in ('cancelado', 'aguardando_pagamento')
    and coupon_id is not null;

  select coalesce(round(avg(total_cents))::integer, 0) into v_ticket_without
  from orders
  where created_at between p_from and p_to
    and status not in ('cancelado', 'aguardando_pagamento')
    and coupon_id is null;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_by_coupon from (
    select c.code, c.source, c.discount_kind,
           count(r.id) as uses,
           coalesce(sum(r.discount_cents), 0) as discount_cents
    from coupon_redemptions r
    join coupons c on c.id = r.coupon_id
    where r.created_at between p_from and p_to
    group by c.code, c.source, c.discount_kind
    order by uses desc
    limit 20
  ) t;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_by_prize from (
    select p.label, count(s.id) as times
    from roulette_spins s
    join roulette_prizes p on p.id = s.prize_id
    where s.created_at between p_from and p_to
    group by p.label
    order by times desc
  ) t;

  return jsonb_build_object(
    'spins', coalesce(v_spins, 0),
    'unique_spinners', coalesce(v_spin_users, 0),
    'prizes_won', coalesce(v_won, 0),
    'coupons_redeemed', coalesce(v_redeemed, 0),
    -- Conversão: dos cupons ganhos na roleta, quantos viraram pedido.
    'avg_ticket_with_coupon_cents', v_ticket_with,
    'avg_ticket_without_coupon_cents', v_ticket_without,
    'by_coupon', v_by_coupon,
    'by_prize', v_by_prize
  );
end;
$$;
grant execute on function report_promotions(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Clientes novos vs recorrentes no período
-- ---------------------------------------------------------------------------
create or replace function report_customers(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform assert_staff();

  with pedidos as (
    select o.customer_id,
           count(*) as pedidos_periodo,
           sum(o.total_cents) as gasto,
           min(o.created_at) as primeiro_no_periodo
    from orders o
    where o.created_at between p_from and p_to
      and o.status not in ('cancelado', 'aguardando_pagamento')
    group by o.customer_id
  ),
  classificado as (
    select p.*,
           (select min(o2.created_at) from orders o2
             where o2.customer_id = p.customer_id
               and o2.status not in ('cancelado', 'aguardando_pagamento')) as primeiro_de_todos
    from pedidos p
  )
  select jsonb_build_object(
    'total_customers',     count(*),
    'new_customers',       count(*) filter (where primeiro_de_todos >= p_from),
    'returning_customers', count(*) filter (where primeiro_de_todos < p_from),
    'avg_orders_per_customer', coalesce(round(avg(pedidos_periodo), 2), 0),
    'top_customers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', coalesce(nullif(cu.name, ''), 'Cliente'),
        'phone', cu.phone,
        'orders', c2.pedidos_periodo,
        'spent_cents', c2.gasto
      ) order by c2.gasto desc)
      from (select * from classificado order by gasto desc limit 10) c2
      join customers cu on cu.id = c2.customer_id
    ), '[]'::jsonb)
  )
  into v
  from classificado;

  return v;
end;
$$;
grant execute on function report_customers(timestamptz, timestamptz) to authenticated;
