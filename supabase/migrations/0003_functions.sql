-- =============================================================================
-- Regras de negócio no banco.
--
-- Por que SECURITY DEFINER: o app cliente nunca insere pedido/cupom/giro
-- diretamente. Ele chama estas funções, que recalculam TODOS os valores a
-- partir das tabelas. Assim o preço enviado pelo navegador é irrelevante —
-- adulterar o payload no DevTools não muda um centavo do total cobrado.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Cadastro: toda conta nova do Auth vira um `customers`.
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into customers (id, name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'phone', new.phone)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- O restaurante está aberto agora?
-- Considera a chave-geral + a grade de horários (fuso de Chapecó).
-- ---------------------------------------------------------------------------
create or replace function is_restaurant_open()
returns boolean language sql stable set search_path = public as $$
  with agora as (
    select (now() at time zone 'America/Sao_Paulo') as ts
  )
  select
    (select accepting_orders from restaurant_settings where id = 1)
    and exists (
      select 1 from business_hours h, agora a
      where h.active
        and h.weekday = extract(dow from a.ts)::smallint
        and a.ts::time between h.opens_at and h.closes_at
    );
$$;

-- ---------------------------------------------------------------------------
-- Preço promocional vigente de um produto (null se não houver oferta ativa).
-- ---------------------------------------------------------------------------
create or replace function current_offer_price(p_product_id uuid)
returns integer language sql stable set search_path = public as $$
  select o.offer_price_cents
  from offers o
  where o.product_id = p_product_id
    and o.active
    and o.starts_at <= now()
    and (o.ends_at is null or o.ends_at > now())
  order by o.offer_price_cents asc
  limit 1;
$$;

-- Cardápio já com preço efetivo resolvido — é o que o app lê.
create or replace view products_public
with (security_invoker = true) as
select
  p.*,
  c.name as category_name,
  c.slug as category_slug,
  coalesce(current_offer_price(p.id), p.price_cents) as effective_price_cents,
  current_offer_price(p.id) is not null as has_offer
from products p
join categories c on c.id = p.category_id;

grant select on products_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Comparação de bairro tolerante a acento. A extensão `unaccent` nem sempre
-- está habilitada no projeto, então normalizamos de forma previsível.
-- ---------------------------------------------------------------------------
create or replace function unaccent_safe(t text)
returns text language sql immutable as $$
  select translate(
    coalesce(t, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
  );
$$;

-- ---------------------------------------------------------------------------
-- Validação de cupom. Retorna jsonb para o checkout mostrar o motivo exato
-- da recusa em vez de um "cupom inválido" genérico.
-- ---------------------------------------------------------------------------
create or replace function validate_coupon(
  p_code text,
  p_subtotal_cents integer,
  p_delivery_fee_cents integer default 0
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_c        coupons%rowtype;
  v_uses     integer;
  v_discount integer := 0;
  v_free_ship boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object('valid', false, 'reason', 'Faça login para usar cupons.');
  end if;

  select * into v_c from coupons
  where upper(code) = upper(trim(p_code)) and active
  limit 1;

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'Cupom não encontrado.');
  end if;

  if v_c.customer_id is not null and v_c.customer_id <> auth.uid() then
    return jsonb_build_object('valid', false, 'reason', 'Este cupom não é seu.');
  end if;

  if v_c.valid_from > now() then
    return jsonb_build_object('valid', false, 'reason', 'Este cupom ainda não começou a valer.');
  end if;

  if v_c.valid_until is not null and v_c.valid_until < now() then
    return jsonb_build_object('valid', false, 'reason', 'Este cupom expirou.');
  end if;

  if p_subtotal_cents < v_c.min_order_cents then
    return jsonb_build_object(
      'valid', false,
      'reason', format('Pedido mínimo de R$ %s para este cupom.',
                       to_char(v_c.min_order_cents / 100.0, 'FM999G990D00')),
      'min_order_cents', v_c.min_order_cents
    );
  end if;

  if v_c.usage_limit is not null and v_c.used_count >= v_c.usage_limit then
    return jsonb_build_object('valid', false, 'reason', 'Este cupom esgotou.');
  end if;

  select count(*) into v_uses from coupon_redemptions
  where coupon_id = v_c.id and customer_id = auth.uid();

  if v_uses >= v_c.usage_limit_per_customer then
    return jsonb_build_object('valid', false, 'reason', 'Você já usou este cupom.');
  end if;

  case v_c.discount_kind
    when 'percentual' then
      v_discount := floor(p_subtotal_cents * v_c.discount_percent / 100.0)::integer;
      if v_c.max_discount_cents is not null then
        v_discount := least(v_discount, v_c.max_discount_cents);
      end if;
    when 'fixo' then
      v_discount := least(v_c.discount_cents, p_subtotal_cents);
    when 'frete_gratis' then
      v_discount := p_delivery_fee_cents;
      v_free_ship := true;
    when 'brinde' then
      v_discount := 0;
  end case;

  return jsonb_build_object(
    'valid', true,
    'coupon_id', v_c.id,
    'code', v_c.code,
    'kind', v_c.discount_kind,
    'description', v_c.description,
    'discount_cents', v_discount,
    'free_shipping', v_free_ship
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Saldo de pontos de fidelidade do cliente logado.
-- ---------------------------------------------------------------------------
create or replace function loyalty_balance()
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(points), 0)::integer
  from loyalty_transactions
  where customer_id = auth.uid()
    and (expires_at is null or expires_at > now());
$$;

-- =============================================================================
-- CRIAÇÃO DE PEDIDO — coração do sistema
-- =============================================================================
create or replace function create_order(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_customer   uuid := auth.uid();
  v_settings   restaurant_settings%rowtype;
  v_fulfill    fulfillment_type := coalesce(p_payload ->> 'fulfillment', 'entrega')::fulfillment_type;
  v_method     payment_method := (p_payload ->> 'payment_method')::payment_method;
  v_pay_cfg    payment_config%rowtype;
  v_addr       addresses%rowtype;
  v_zone       delivery_zones%rowtype;
  v_item       jsonb;
  v_product    products%rowtype;
  v_unit       integer;
  v_addons     jsonb;
  v_addons_sum integer;
  v_qty        integer;
  v_subtotal   integer := 0;
  v_fee        integer := 0;
  v_discount   integer := 0;
  v_coupon     jsonb;
  v_coupon_id  uuid;
  v_gift       text;
  v_loyalty    jsonb;
  v_redeemed   integer := 0;
  v_order      orders%rowtype;
  v_status     order_status;
  v_pay_status payment_status;
  v_addon_row  record;
  v_lines      jsonb := '[]'::jsonb;   -- itens já com preço resolvido no servidor
  v_on_delivery on_delivery_kind;
  v_change     integer;
begin
  if v_customer is null then
    raise exception 'Sessão expirada. Faça login novamente.' using errcode = 'P0001';
  end if;

  select * into v_settings from restaurant_settings where id = 1;

  if not is_restaurant_open() then
    raise exception 'O restaurante está fechado no momento.' using errcode = 'P0001';
  end if;

  -- Método de pagamento precisa estar ativo no roteador.
  select * into v_pay_cfg from payment_config where method = v_method and is_active;
  if not found then
    raise exception 'Forma de pagamento indisponível.' using errcode = 'P0001';
  end if;

  if v_fulfill = 'entrega' and not v_settings.delivery_enabled then
    raise exception 'Entrega indisponível no momento.' using errcode = 'P0001';
  end if;
  if v_fulfill = 'retirada' and not v_settings.pickup_enabled then
    raise exception 'Retirada indisponível no momento.' using errcode = 'P0001';
  end if;

  -- -------------------------------------------------------------------------
  -- 1. Itens: preço SEMPRE relido do banco (com oferta vigente aplicada).
  -- -------------------------------------------------------------------------
  if jsonb_array_length(coalesce(p_payload -> 'items', '[]'::jsonb)) = 0 then
    raise exception 'Carrinho vazio.' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(p_payload -> 'items') loop
    select * into v_product from products
    where id = (v_item ->> 'product_id')::uuid;

    if not found then
      raise exception 'Produto não encontrado no cardápio.' using errcode = 'P0001';
    end if;
    if not v_product.active then
      raise exception '% saiu do cardápio.', v_product.name using errcode = 'P0001';
    end if;
    if v_product.sold_out then
      raise exception '% está esgotado hoje.', v_product.name using errcode = 'P0001';
    end if;

    -- Teto de 99 por linha: o mesmo limite do seletor no app. Sem ele, um
    -- payload adulterado poderia pedir 999999 unidades e travar a cozinha.
    v_qty := least(99, greatest(1, coalesce((v_item ->> 'quantity')::integer, 1)));
    v_unit := coalesce(current_offer_price(v_product.id), v_product.price_cents);

    -- Adicionais: só valem os que pertencem a este produto e estão ativos.
    v_addons := '[]'::jsonb;
    v_addons_sum := 0;

    for v_addon_row in
      select a.id, a.name, a.price_cents
      from product_addons a
      join addon_groups g on g.id = a.group_id
      where g.product_id = v_product.id
        and a.active
        and a.id in (
          select el::uuid
          from jsonb_array_elements_text(coalesce(v_item -> 'addon_ids', '[]'::jsonb)) as el
        )
      order by g.sort_order, a.sort_order
    loop
      v_addons := v_addons || jsonb_build_array(jsonb_build_object(
        'id', v_addon_row.id, 'name', v_addon_row.name, 'price_cents', v_addon_row.price_cents
      ));
      v_addons_sum := v_addons_sum + v_addon_row.price_cents;
    end loop;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id',       v_product.id,
      'product_name',     v_product.name,
      'product_image',    v_product.image_url,
      'unit_price_cents', v_unit,
      'quantity',         v_qty,
      'addons',           v_addons,
      'addons_cents',     v_addons_sum,
      'notes',            nullif(trim(coalesce(v_item ->> 'notes', '')), ''),
      'total_cents',      (v_unit + v_addons_sum) * v_qty
    ));

    v_subtotal := v_subtotal + (v_unit + v_addons_sum) * v_qty;
  end loop;

  if v_subtotal < v_settings.min_order_cents then
    raise exception 'Pedido mínimo de R$ %.',
      to_char(v_settings.min_order_cents / 100.0, 'FM999G990D00') using errcode = 'P0001';
  end if;

  -- -------------------------------------------------------------------------
  -- 2. Entrega
  -- -------------------------------------------------------------------------
  if v_fulfill = 'entrega' then
    select * into v_addr from addresses
    where id = (p_payload ->> 'address_id')::uuid and customer_id = v_customer;

    if not found then
      raise exception 'Endereço de entrega inválido.' using errcode = 'P0001';
    end if;

    select * into v_zone from delivery_zones
    where active and unaccent_safe(lower(neighborhood)) = unaccent_safe(lower(v_addr.neighborhood))
    limit 1;

    if not found then
      raise exception 'Ainda não entregamos em %.', v_addr.neighborhood using errcode = 'P0001';
    end if;

    if v_subtotal < v_zone.min_order_cents then
      raise exception 'Pedido mínimo de R$ % para %.',
        to_char(v_zone.min_order_cents / 100.0, 'FM999G990D00'), v_addr.neighborhood
        using errcode = 'P0001';
    end if;

    v_fee := v_zone.fee_cents;
  end if;

  -- -------------------------------------------------------------------------
  -- 3. Cupom
  -- -------------------------------------------------------------------------
  if coalesce(trim(p_payload ->> 'coupon_code'), '') <> '' then
    v_coupon := validate_coupon(p_payload ->> 'coupon_code', v_subtotal, v_fee);

    if not (v_coupon ->> 'valid')::boolean then
      raise exception '%', v_coupon ->> 'reason' using errcode = 'P0001';
    end if;

    v_coupon_id := (v_coupon ->> 'coupon_id')::uuid;
    v_discount  := (v_coupon ->> 'discount_cents')::integer;

    if (v_coupon ->> 'kind') = 'brinde' then
      v_gift := v_coupon ->> 'description';
    end if;
  end if;

  -- -------------------------------------------------------------------------
  -- 4. Resgate de pontos de fidelidade (opcional)
  -- -------------------------------------------------------------------------
  if coalesce((p_payload ->> 'redeem_loyalty')::boolean, false) then
    select to_jsonb(l) into v_loyalty from loyalty_config l where id = 1;

    if (v_loyalty ->> 'active')::boolean and loyalty_balance() >= (v_loyalty ->> 'points_to_reward')::integer then
      v_redeemed := (v_loyalty ->> 'points_to_reward')::integer;

      if (v_loyalty ->> 'reward_kind') = 'percentual' and (v_loyalty ->> 'reward_percent') is not null then
        v_discount := v_discount + floor(v_subtotal * (v_loyalty ->> 'reward_percent')::numeric / 100.0)::integer;
      else
        v_discount := v_discount + coalesce((v_loyalty ->> 'reward_cents')::integer, 0);
      end if;
    end if;
  end if;

  -- O desconto nunca ultrapassa o que há para descontar.
  v_discount := least(v_discount, v_subtotal + v_fee);

  -- -------------------------------------------------------------------------
  -- 5. Status inicial
  -- Pagamento na entrega entra direto na fila da cozinha; Pix e cartão online
  -- só entram depois que o webhook do gateway confirmar.
  -- -------------------------------------------------------------------------
  if v_method = 'na_entrega' then
    v_on_delivery := (p_payload ->> 'on_delivery_kind')::on_delivery_kind;

    if v_on_delivery is null then
      raise exception 'Escolha como você vai pagar na entrega.' using errcode = 'P0001';
    end if;

    -- Troco só faz sentido em dinheiro (o constraint da tabela também barra).
    if v_on_delivery = 'dinheiro' then
      v_change := (p_payload ->> 'change_for_cents')::integer;

      if v_change is not null and v_change < v_subtotal + v_fee - v_discount then
        raise exception 'O valor do troco precisa cobrir o total do pedido.'
          using errcode = 'P0001';
      end if;
    end if;

    v_status := 'confirmado_entrega';
    v_pay_status := 'nao_aplicavel';
  else
    v_status := 'aguardando_pagamento';
    v_pay_status := 'pendente';
  end if;

  insert into orders (
    customer_id, status, fulfillment, address_snapshot, delivery_zone_id,
    subtotal_cents, delivery_fee_cents, discount_cents, total_cents,
    coupon_id, coupon_code, gift_description,
    payment_method, payment_status, payment_provider,
    installments, on_delivery_kind, change_for_cents, notes, points_redeemed
  ) values (
    v_customer, v_status, v_fulfill,
    case when v_fulfill = 'entrega' then to_jsonb(v_addr) else null end,
    v_zone.id,
    v_subtotal, v_fee, v_discount, v_subtotal + v_fee - v_discount,
    v_coupon_id, v_coupon ->> 'code', v_gift,
    v_method, v_pay_status, v_pay_cfg.provider,
    -- Limitado ao máximo configurado para o método (padrão 1 fora do crédito).
    least(
      greatest(1, coalesce((v_pay_cfg.options ->> 'max_installments')::integer, 1)),
      greatest(1, coalesce((p_payload ->> 'installments')::integer, 1))
    ),
    v_on_delivery,
    v_change,
    nullif(trim(coalesce(p_payload ->> 'notes', '')), ''),
    v_redeemed
  )
  returning * into v_order;

  insert into order_items (
    order_id, product_id, product_name, product_image,
    unit_price_cents, quantity, addons, addons_cents, notes, total_cents
  )
  select v_order.id, l.product_id, l.product_name, l.product_image,
         l.unit_price_cents, l.quantity, l.addons, l.addons_cents, l.notes, l.total_cents
  from jsonb_to_recordset(v_lines) as l(
    product_id uuid, product_name text, product_image text,
    unit_price_cents integer, quantity integer,
    addons jsonb, addons_cents integer, notes text, total_cents integer
  );

  -- Registra o uso do cupom (o índice único impede uso duplicado no mesmo pedido).
  if v_coupon_id is not null then
    insert into coupon_redemptions (coupon_id, customer_id, order_id, discount_cents)
    values (v_coupon_id, v_customer, v_order.id, (v_coupon ->> 'discount_cents')::integer);

    update coupons set used_count = used_count + 1 where id = v_coupon_id;
  end if;

  -- Debita os pontos resgatados.
  if v_redeemed > 0 then
    insert into loyalty_transactions (customer_id, order_id, points, kind, description)
    values (v_customer, v_order.id, -v_redeemed, 'resgate', 'Desconto aplicado no pedido ' || v_order.code);
  end if;

  return jsonb_build_object(
    'order_id', v_order.id,
    'code', v_order.code,
    'status', v_order.status,
    'total_cents', v_order.total_cents,
    'payment_method', v_order.payment_method,
    'payment_provider', v_order.payment_provider,
    'requires_payment', v_method <> 'na_entrega'
  );
end;
$$;

revoke all on function create_order(jsonb) from public, anon;
grant execute on function create_order(jsonb) to authenticated;

-- =============================================================================
-- ROLETA — sorteio no servidor (o cliente não escolhe o prêmio)
-- =============================================================================
create or replace function can_spin()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_cfg   roulette_config%rowtype;
  v_last  timestamptz;
  v_next  timestamptz;
  v_orders integer;
  v_spins  integer;
begin
  select * into v_cfg from roulette_config where id = 1;

  if not coalesce(v_cfg.active, false) then
    return jsonb_build_object('can_spin', false, 'reason', 'A roleta está desativada.');
  end if;
  if auth.uid() is null then
    return jsonb_build_object('can_spin', false, 'reason', 'Entre na sua conta para girar.');
  end if;

  select max(created_at) into v_last from roulette_spins where customer_id = auth.uid();

  if v_cfg.spin_rule = 'pedido' then
    -- 1 giro por pedido concluído que ainda não foi "gasto".
    select count(*) into v_orders from orders
    where customer_id = auth.uid() and status = 'entregue';
    select count(*) into v_spins from roulette_spins where customer_id = auth.uid();

    if v_spins >= v_orders then
      return jsonb_build_object('can_spin', false,
        'reason', 'Faça um pedido para liberar um novo giro.', 'rule', 'pedido');
    end if;
    return jsonb_build_object('can_spin', true, 'rule', 'pedido');
  end if;

  -- Regra por tempo
  if v_last is null then
    return jsonb_build_object('can_spin', true, 'rule', 'dia');
  end if;

  v_next := v_last + make_interval(hours => v_cfg.cooldown_hours);

  if now() >= v_next then
    return jsonb_build_object('can_spin', true, 'rule', 'dia');
  end if;

  return jsonb_build_object(
    'can_spin', false, 'rule', 'dia',
    'reason', 'Você já girou hoje. Volte em breve!',
    'next_spin_at', v_next
  );
end;
$$;

create or replace function spin_roulette()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_can     jsonb;
  v_cfg     roulette_config%rowtype;
  v_total   integer;
  v_rand    numeric;
  v_prize   roulette_prizes%rowtype;
  v_code    text;
  v_coupon  coupons%rowtype;
  v_index   integer;
begin
  v_can := can_spin();
  if not (v_can ->> 'can_spin')::boolean then
    raise exception '%', coalesce(v_can ->> 'reason', 'Giro indisponível.') using errcode = 'P0001';
  end if;

  select * into v_cfg from roulette_config where id = 1;

  select coalesce(sum(weight), 0) into v_total
  from roulette_prizes where active and weight > 0;

  if v_total = 0 then
    raise exception 'Nenhum prêmio configurado.' using errcode = 'P0001';
  end if;

  -- Sorteio ponderado: sorteia um ponto na régua acumulada dos pesos.
  v_rand := random() * v_total;

  select p.* into v_prize
  from (
    select r.*, sum(r.weight) over (order by r.sort_order, r.id) as cum
    from roulette_prizes r
    where r.active and r.weight > 0
  ) p
  where v_rand < p.cum
  order by p.cum
  limit 1;

  -- Posição na roda, para o front parar a animação no gomo certo.
  select count(*) into v_index
  from roulette_prizes
  where active and (sort_order, id) < (v_prize.sort_order, v_prize.id);

  -- Prêmio "não foi dessa vez": registra o giro e encerra.
  if v_prize.prize_kind is null then
    insert into roulette_spins (customer_id, prize_id) values (auth.uid(), v_prize.id);
    return jsonb_build_object(
      'won', false, 'prize_id', v_prize.id, 'label', v_prize.label, 'index', v_index
    );
  end if;

  -- Gera um cupom pessoal, com validade curta para criar urgência.
  v_code := 'GIRO' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into coupons (
    code, description, discount_kind, discount_percent, discount_cents,
    min_order_cents, valid_until, usage_limit, usage_limit_per_customer,
    is_public, customer_id, source
  ) values (
    v_code,
    coalesce(v_prize.gift_description, v_prize.label),
    v_prize.prize_kind, v_prize.discount_percent, v_prize.discount_cents,
    v_prize.min_order_cents,
    now() + make_interval(hours => v_cfg.prize_validity_hours),
    1, 1, false, auth.uid(), 'roleta'
  )
  returning * into v_coupon;

  insert into roulette_spins (customer_id, prize_id, coupon_id)
  values (auth.uid(), v_prize.id, v_coupon.id);

  return jsonb_build_object(
    'won', true,
    'prize_id', v_prize.id,
    'label', v_prize.label,
    'index', v_index,
    'coupon_code', v_coupon.code,
    'coupon_id', v_coupon.id,
    'valid_until', v_coupon.valid_until,
    'min_order_cents', v_coupon.min_order_cents
  );
end;
$$;

revoke all on function spin_roulette() from public, anon;
grant execute on function spin_roulette() to authenticated;

-- =============================================================================
-- FIDELIDADE — pontos creditados quando o pedido é entregue
-- =============================================================================
create or replace function award_loyalty_points()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cfg    loyalty_config%rowtype;
  v_points integer;
begin
  select * into v_cfg from loyalty_config where id = 1;
  if not coalesce(v_cfg.active, false) then
    return new;
  end if;

  -- Crédito
  if new.status = 'entregue' and old.status is distinct from 'entregue' then
    v_points := floor((new.total_cents / 100.0) * v_cfg.points_per_real)::integer;
    if v_points > 0 then
      insert into loyalty_transactions (customer_id, order_id, points, kind, description, expires_at)
      values (
        new.customer_id, new.id, v_points, 'ganho',
        'Pontos do pedido ' || new.code,
        case when v_cfg.expire_days is not null
             then now() + make_interval(days => v_cfg.expire_days) end
      );
      new.points_earned := v_points;
    end if;
  end if;

  -- Estorno em caso de cancelamento após a entrega
  if new.status = 'cancelado' and old.status is distinct from 'cancelado' then
    delete from loyalty_transactions where order_id = new.id and kind = 'ganho';

    -- Devolve os pontos que o cliente tinha gasto neste pedido.
    if new.points_redeemed > 0 then
      insert into loyalty_transactions (customer_id, order_id, points, kind, description)
      values (new.customer_id, new.id, new.points_redeemed, 'ajuste',
              'Estorno de pontos do pedido cancelado ' || new.code);
    end if;

    -- Libera o cupom para novo uso.
    if new.coupon_id is not null then
      delete from coupon_redemptions where order_id = new.id;
      update coupons set used_count = greatest(0, used_count - 1) where id = new.coupon_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger t_orders_loyalty
  before update of status on orders
  for each row execute function award_loyalty_points();

-- Troca pontos por um cupom pessoal, sem precisar estar no checkout.
create or replace function redeem_loyalty_coupon()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cfg    loyalty_config%rowtype;
  v_bal    integer;
  v_code   text;
  v_coupon coupons%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Faça login para resgatar.' using errcode = 'P0001';
  end if;

  select * into v_cfg from loyalty_config where id = 1;
  if not coalesce(v_cfg.active, false) then
    raise exception 'Programa de fidelidade indisponível.' using errcode = 'P0001';
  end if;

  v_bal := loyalty_balance();
  if v_bal < v_cfg.points_to_reward then
    raise exception 'Você tem % de % pontos necessários.', v_bal, v_cfg.points_to_reward
      using errcode = 'P0001';
  end if;

  v_code := 'FIEL' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into coupons (
    code, description, discount_kind, discount_percent, discount_cents,
    valid_until, usage_limit, usage_limit_per_customer, is_public, customer_id, source
  ) values (
    v_code, 'Recompensa de fidelidade',
    v_cfg.reward_kind, v_cfg.reward_percent, v_cfg.reward_cents,
    now() + interval '30 days', 1, 1, false, auth.uid(), 'fidelidade'
  )
  returning * into v_coupon;

  insert into loyalty_transactions (customer_id, points, kind, description)
  values (auth.uid(), -v_cfg.points_to_reward, 'resgate', 'Resgate do cupom ' || v_code);

  return jsonb_build_object('coupon_code', v_coupon.code, 'valid_until', v_coupon.valid_until);
end;
$$;

revoke all on function redeem_loyalty_coupon() from public, anon;
grant execute on function redeem_loyalty_coupon() to authenticated;

-- =============================================================================
-- PAGAMENTO — chamado pelas Edge Functions (service role) ao receber webhook
-- =============================================================================
create or replace function mark_order_paid(
  p_order_id uuid,
  p_provider text,
  p_reference text,
  p_payload jsonb default '{}'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order orders%rowtype;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;

  -- Idempotência: webhook pode chegar mais de uma vez pelo mesmo evento.
  if v_order.payment_status = 'pago' then
    return jsonb_build_object('order_id', v_order.id, 'status', v_order.status, 'already_paid', true);
  end if;

  update orders set
    payment_status   = 'pago',
    status           = case when status = 'aguardando_pagamento' then 'pago' else status end,
    payment_provider = coalesce(p_provider, payment_provider),
    payment_ref      = coalesce(p_reference, payment_ref),
    payment_payload  = payment_payload || p_payload,
    paid_at          = now()
  where id = p_order_id
  returning * into v_order;

  insert into notifications (customer_id, title, body, data)
  values (
    v_order.customer_id,
    'Pagamento confirmado 🎉',
    'Recebemos o pagamento do pedido ' || v_order.code || '. Já vamos preparar!',
    jsonb_build_object('order_id', v_order.id, 'type', 'payment')
  );

  return jsonb_build_object('order_id', v_order.id, 'status', v_order.status, 'already_paid', false);
end;
$$;

revoke all on function mark_order_paid(uuid, text, text, jsonb) from public, anon, authenticated;

create or replace function mark_order_payment_failed(
  p_order_id uuid,
  p_reason text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  update orders
  set payment_status = 'falhou',
      cancel_reason  = coalesce(p_reason, 'Pagamento não aprovado')
  where id = p_order_id and payment_status = 'pendente';
end;
$$;

revoke all on function mark_order_payment_failed(uuid, text) from public, anon, authenticated;

-- Guarda os dados da cobrança criada no gateway (QR Code, link de checkout).
create or replace function attach_payment_details(
  p_order_id uuid,
  p_provider text,
  p_reference text,
  p_url text,
  p_payload jsonb default '{}'
)
returns void language plpgsql security definer set search_path = public as $$
begin
  update orders set
    payment_provider = p_provider,
    payment_ref      = p_reference,
    payment_url      = p_url,
    payment_payload  = payment_payload || p_payload
  where id = p_order_id;
end;
$$;

revoke all on function attach_payment_details(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- =============================================================================
-- ADMIN — mudança de status e cancelamento pelo cliente
-- =============================================================================
create or replace function admin_set_order_status(p_order_id uuid, p_status order_status, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_order orders%rowtype;
begin
  if not is_staff() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  update orders set
    status        = p_status,
    delivered_at  = case when p_status = 'entregue' then now() else delivered_at end,
    cancel_reason = case when p_status = 'cancelado' then coalesce(p_note, cancel_reason) else cancel_reason end
  where id = p_order_id
  returning * into v_order;

  insert into notifications (customer_id, title, body, data)
  values (
    v_order.customer_id,
    case p_status
      when 'em_preparo'          then 'Seu pedido entrou na cozinha 🍣'
      when 'saiu_para_entrega'   then 'Saiu para entrega 🛵'
      when 'pronto_para_retirada' then 'Pronto para retirada ✅'
      when 'entregue'            then 'Pedido entregue. Bom apetite!'
      when 'cancelado'           then 'Pedido cancelado'
      else 'Atualização do pedido'
    end,
    'Pedido ' || v_order.code,
    jsonb_build_object('order_id', v_order.id, 'type', 'status', 'status', p_status)
  );
end;
$$;

grant execute on function admin_set_order_status(uuid, order_status, text) to authenticated;

-- O cliente só cancela enquanto a cozinha não começou.
create or replace function cancel_my_order(p_order_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_order orders%rowtype;
begin
  select * into v_order from orders
  where id = p_order_id and customer_id = auth.uid();

  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;

  if v_order.status not in ('aguardando_pagamento', 'confirmado_entrega', 'pago') then
    raise exception 'Este pedido já está em preparo e não pode ser cancelado pelo app.'
      using errcode = 'P0001';
  end if;

  update orders
  set status = 'cancelado',
      cancel_reason = coalesce(p_reason, 'Cancelado pelo cliente')
  where id = p_order_id;
end;
$$;

grant execute on function cancel_my_order(uuid, text) to authenticated;

-- =============================================================================
-- RECOMENDAÇÕES — "mais pedidos" e "pra você"
-- =============================================================================
create or replace function recommended_products(p_limit integer default 8)
returns setof products_public
language sql stable security definer set search_path = public as $$
  -- Começa pelo histórico do cliente; completa com os campeões de venda gerais.
  with meus as (
    select oi.product_id, count(*) * 10 as score
    from order_items oi
    join orders o on o.id = oi.order_id
    where o.customer_id = auth.uid() and o.status = 'entregue'
    group by oi.product_id
  ),
  gerais as (
    select oi.product_id, count(*) as score
    from order_items oi
    join orders o on o.id = oi.order_id
    where o.created_at > now() - interval '60 days'
      and o.status not in ('cancelado', 'aguardando_pagamento')
    group by oi.product_id
  ),
  ranked as (
    select product_id, sum(score) as score from (
      select * from meus union all select * from gerais
    ) s group by product_id
  )
  select p.* from products_public p
  left join ranked r on r.product_id = p.id
  where p.active and not p.sold_out
  order by coalesce(r.score, 0) desc, p.is_bestseller desc, p.sort_order
  limit p_limit;
$$;

grant execute on function recommended_products(integer) to anon, authenticated;
