-- =============================================================================
-- 0009 — ENTREGA PELO MAPA
--
-- O cliente passa a marcar o ponto de entrega num mapa. O ponto preenche o
-- bairro por geocodificação, mas quem confirma é a pessoa: o mapa sugere, o
-- humano decide. Geocodificação erra nome de bairro com frequência, e um
-- pedido recusado por causa de grafia é uma venda perdida em silêncio.
--
-- Três defesas contra a grafia, nesta ordem:
--   1. `aliases` por bairro — o painel cadastra as variações que o mapa devolve
--   2. o cliente confirma o bairro sugerido antes de fechar
--   3. se ainda assim nada casar, o pedido ENTRA marcado como taxa a combinar
--
-- O que NÃO muda: a taxa continua vindo da tabela do painel, lida pelo
-- servidor. O navegador manda o ponto e o bairro; o preço quem diz é o banco.
-- =============================================================================

-- Variações de grafia que apontam para o mesmo bairro.
alter table delivery_zones
  add column if not exists aliases text[] not null default '{}';

comment on column delivery_zones.aliases is
  'Outras grafias do bairro (o que a geocodificação do mapa costuma devolver).';

-- Pedido aceito fora da área cadastrada: a equipe combina a taxa por telefone.
alter table orders
  add column if not exists fee_to_arrange boolean not null default false;

comment on column orders.fee_to_arrange is
  'Bairro fora do cadastro: entrou sem taxa, a combinar com o cliente.';

create index if not exists orders_fee_to_arrange_idx
  on orders (created_at desc) where fee_to_arrange;

-- Onde fica o restaurante — é o centro do mapa que o cliente abre.
alter table restaurant_settings
  add column if not exists lat numeric(10,7),
  add column if not exists lng numeric(10,7),
  add column if not exists map_zoom smallint not null default 13;

-- Chapecó/SC como ponto de partida, até o painel marcar o endereço exato.
update restaurant_settings
set lat = coalesce(lat, -27.1009), lng = coalesce(lng, -52.6156)
where id = 1;

-- -----------------------------------------------------------------------------
-- Consulta da taxa a partir do bairro.
--
-- O app usa para MOSTRAR a taxa antes de fechar o pedido. É só vitrine: quem
-- cobra é o `create_order`, que refaz esta mesma busca por conta própria.
-- -----------------------------------------------------------------------------
create or replace function zone_for_neighborhood(p_neighborhood text)
returns delivery_zones language sql stable security definer set search_path = public as $$
  select * from delivery_zones
  where active
    and (
      unaccent_safe(lower(neighborhood)) = unaccent_safe(lower(p_neighborhood))
      or exists (
        select 1 from unnest(aliases) as apelido
        where unaccent_safe(lower(apelido)) = unaccent_safe(lower(p_neighborhood))
      )
    )
  limit 1;
$$;

grant execute on function zone_for_neighborhood(text) to anon, authenticated;

-- =============================================================================
-- create_order: aceita o pedido fora da área e entende os apelidos.
-- Copiado da 0008 sem alterar uma linha do cálculo de preço.
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
  v_group_row  record;
  v_fee_combinar boolean := false;
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

    -- ---------------------------------------------------------------------
    -- Adicionais: conferir o que o app já confere na tela.
    --
    -- A tela do produto barra grupo obrigatório vazio e estouro de máximo,
    -- mas a tela é do navegador — e aqui o navegador não decide nada. Sem
    -- esta parte, um payload montado fora do app passa com o obrigatório em
    -- branco (a cozinha recebe um pedido que não dá para montar) ou com mais
    -- opções do que o grupo permite.
    --
    -- Não é furo de dinheiro: o preço de cada adicional é relido do banco no
    -- laço acima, então ninguém paga menos. É pedido incoerente entrando na
    -- produção, que custa em retrabalho e em cliente irritado.
    -- ---------------------------------------------------------------------

    -- Id que não resolveu = adicional de outro produto, desativado ou
    -- inventado. Descartar em silêncio entregaria um item diferente do que a
    -- pessoa acha que pediu; melhor recusar e mandar revisar.
    if jsonb_array_length(coalesce(v_item -> 'addon_ids', '[]'::jsonb))
       <> jsonb_array_length(v_addons) then
      raise exception 'Uma das opções de "%" não está mais disponível. Revise o item.',
        v_product.name using errcode = 'P0001';
    end if;

    for v_group_row in
      select g.name, g.min_select, g.max_select, count(a.id) as escolhidos
      from addon_groups g
      left join product_addons a
        on a.group_id = g.id
       and a.active
       and a.id in (
         select el::uuid
         from jsonb_array_elements_text(coalesce(v_item -> 'addon_ids', '[]'::jsonb)) as el
       )
      where g.product_id = v_product.id
      group by g.id, g.name, g.min_select, g.max_select
    loop
      if v_group_row.escolhidos < v_group_row.min_select then
        raise exception 'Escolha ao menos % em "%" para %.',
          v_group_row.min_select, v_group_row.name, v_product.name
          using errcode = 'P0001';
      end if;

      if v_group_row.escolhidos > v_group_row.max_select then
        raise exception 'Escolha no máximo % em "%" para %.',
          v_group_row.max_select, v_group_row.name, v_product.name
          using errcode = 'P0001';
      end if;
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

    -- O bairro pode chegar grafado de N formas — digitado pela pessoa ou vindo
    -- da geocodificação do mapa ("Efapi", "EFAPI", "Sao Cristovao"). Por isso a
    -- busca olha o nome E os apelidos cadastrados no painel, sempre sem acento
    -- e sem caixa. Apelido é a válvula de escape para o que o mapa devolver
    -- diferente do cadastro.
    select * into v_zone from delivery_zones
    where active
      and (
        unaccent_safe(lower(neighborhood)) = unaccent_safe(lower(v_addr.neighborhood))
        or exists (
          select 1 from unnest(aliases) as apelido
          where unaccent_safe(lower(apelido)) = unaccent_safe(lower(v_addr.neighborhood))
        )
      )
    limit 1;

    if found then
      if v_subtotal < v_zone.min_order_cents then
        raise exception 'Pedido mínimo de R$ % para %.',
          to_char(v_zone.min_order_cents / 100.0, 'FM999G990D00'), v_addr.neighborhood
          using errcode = 'P0001';
      end if;

      v_fee := v_zone.fee_cents;
    else
      -- Fora da área cadastrada: o pedido ENTRA, com a taxa zerada e marcado
      -- para a equipe combinar por telefone. Recusar aqui jogaria fora uma
      -- venda por causa de um bairro que ninguém cadastrou ainda.
      --
      -- Zerada, e não estimada: cobrar um palpite seria decidir preço no
      -- escuro. O pedido mínimo também não se aplica — não há regra para uma
      -- área que não existe no cadastro.
      v_fee := 0;
      v_fee_combinar := true;
    end if;
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
    installments, on_delivery_kind, change_for_cents, notes, points_redeemed, fee_to_arrange
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
    v_redeemed,
    v_fee_combinar
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
    'requires_payment', v_method <> 'na_entrega',
    'fee_to_arrange', v_order.fee_to_arrange
  );
end;
$$;

revoke all on function create_order(jsonb) from public, anon;
grant execute on function create_order(jsonb) to authenticated;
