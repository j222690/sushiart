-- =============================================================================
-- Sushi Art — Empório do Sushi | Schema base
-- Convenção: todo valor monetário é INTEGER em CENTAVOS (evita erro de float).
--            Percentuais de desconto são INTEGER em pontos-base? Não: usamos
--            NUMERIC(5,2) para percentual (ex: 10.00 = 10%).
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type order_status as enum (
  'aguardando_pagamento',   -- Pix/Cartão online criado, esperando webhook
  'confirmado_entrega',     -- Paga na entrega: entra direto na fila da cozinha
  'pago',                   -- Webhook confirmou o pagamento online
  'em_preparo',
  'saiu_para_entrega',
  'pronto_para_retirada',
  'entregue',
  'cancelado'
);

-- Como o cliente paga. Os três primeiros são online (passam por gateway);
-- `na_entrega` é presencial e não toca gateway nenhum.
create type payment_method as enum ('pix', 'cartao_credito', 'cartao_debito', 'na_entrega');

-- Quando é `na_entrega`, o que o entregador precisa levar.
-- Sem isso a cozinha não sabe se manda a maquininha junto — e o relatório de
-- caixa contaria como dinheiro vivo uma venda que foi no cartão.
create type on_delivery_kind as enum ('dinheiro', 'credito', 'debito', 'pix');

create type payment_status as enum ('pendente', 'pago', 'falhou', 'estornado', 'nao_aplicavel');

create type fulfillment_type as enum ('entrega', 'retirada');

create type discount_type as enum ('percentual', 'fixo', 'frete_gratis', 'brinde');

create type loyalty_tx_type as enum ('ganho', 'resgate', 'expiracao', 'ajuste');

create type staff_role as enum ('admin', 'operador');

-- ---------------------------------------------------------------------------
-- Utilitário: updated_at automático
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- 1. EQUIPE E CONFIGURAÇÕES DO RESTAURANTE
-- =============================================================================

-- Quem pode entrar no /admin. Um usuário do Supabase Auth vira staff aqui.
create table staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  role       staff_role not null default 'operador',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Singleton (id sempre = 1) com os dados do restaurante.
create table restaurant_settings (
  id                    smallint primary key default 1 check (id = 1),
  name                  text not null default 'Sushi Art — Empório do Sushi',
  tagline               text not null default 'Amor em forma de sushi',
  phone                 text,
  whatsapp              text,
  instagram             text default 'https://instagram.com/sushiartchapeco',
  address_street        text,
  address_number        text,
  address_neighborhood  text,
  address_city          text default 'Chapecó',
  address_state         text default 'SC',
  address_zip           text,
  logo_url              text,
  cover_url             text,
  -- Operação
  accepting_orders      boolean not null default true,  -- chave-geral (pausa manual)
  delivery_enabled      boolean not null default true,
  pickup_enabled        boolean not null default true,
  min_order_cents       integer not null default 0 check (min_order_cents >= 0),
  prep_time_min         integer not null default 40 check (prep_time_min > 0),
  delivery_time_min     integer not null default 20 check (delivery_time_min >= 0),
  updated_at            timestamptz not null default now()
);

-- Horário de funcionamento (0 = domingo ... 6 = sábado). Pode haver 2 faixas/dia.
create table business_hours (
  id         uuid primary key default gen_random_uuid(),
  weekday    smallint not null check (weekday between 0 and 6),
  opens_at   time not null,
  closes_at  time not null,
  active     boolean not null default true
);
create index on business_hours (weekday) where active;

-- Taxa de entrega por bairro. `max_km` permite a variação por raio.
create table delivery_zones (
  id              uuid primary key default gen_random_uuid(),
  neighborhood    text not null,
  fee_cents       integer not null default 0 check (fee_cents >= 0),
  min_order_cents integer not null default 0 check (min_order_cents >= 0),
  eta_min         integer not null default 45,
  max_km          numeric(5,2),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (neighborhood)
);

-- =============================================================================
-- 2. CARDÁPIO
-- =============================================================================

create table categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  image_url  text,
  sort_order integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on categories (sort_order) where active;

create table products (
  id                      uuid primary key default gen_random_uuid(),
  category_id             uuid not null references categories(id) on delete restrict,
  name                    text not null,
  description             text,
  image_url               text,
  price_cents             integer not null check (price_cents >= 0),
  -- Preço "de" riscado; só exibir quando maior que price_cents.
  compare_at_price_cents  integer check (compare_at_price_cents is null or compare_at_price_cents >= 0),
  serves                  text,             -- ex: "serve 2 pessoas", "20 peças"
  is_bestseller           boolean not null default false,
  is_new                  boolean not null default false,
  sold_out                boolean not null default false,  -- esgotado hoje
  active                  boolean not null default true,   -- fora do cardápio
  sort_order              integer not null default 0,
  tags                    text[] not null default '{}',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index on products (category_id) where active;
create index on products (is_bestseller) where active and not sold_out;
-- Busca por nome/descrição sem acento (usada na tela de busca).
create index products_search_idx on products
  using gin (to_tsvector('portuguese', name || ' ' || coalesce(description, '')));

-- Grupos de adicionais de um produto (ex: "Escolha a proteína", "Extras").
create table addon_groups (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  name        text not null,
  min_select  smallint not null default 0 check (min_select >= 0),
  max_select  smallint not null default 1 check (max_select >= 1),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  check (max_select >= min_select)
);
create index on addon_groups (product_id);

create table product_addons (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references addon_groups(id) on delete cascade,
  name        text not null,
  price_cents integer not null default 0 check (price_cents >= 0),
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index on product_addons (group_id) where active;

-- =============================================================================
-- 3. CLIENTES
-- =============================================================================

create table customers (
  id                uuid primary key references auth.users(id) on delete cascade,
  name              text not null default '',
  phone             text,
  email             text,
  birthdate         date,
  marketing_opt_in  boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table addresses (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references customers(id) on delete cascade,
  label         text default 'Casa',
  street        text not null,
  number        text not null,
  complement    text,
  neighborhood  text not null,
  city          text not null default 'Chapecó',
  state         text not null default 'SC',
  zip           text,
  reference     text,
  lat           numeric(10,7),
  lng           numeric(10,7),
  is_default    boolean not null default false,
  created_at    timestamptz not null default now()
);
create index on addresses (customer_id);

create table favorites (
  customer_id uuid not null references customers(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (customer_id, product_id)
);

-- Tokens de push (web push / FCM). Um cliente pode ter vários aparelhos.
create table push_tokens (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  token       text not null unique,
  platform    text not null default 'web',
  created_at  timestamptz not null default now()
);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade, -- null = broadcast
  title       text not null,
  body        text not null,
  data        jsonb not null default '{}',
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index on notifications (customer_id, created_at desc);

-- =============================================================================
-- 4. MARKETING: banners, ofertas, cupons, roleta, fidelidade
-- =============================================================================

create table banners (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  subtitle    text,
  image_url   text,
  -- Para onde o banner leva: 'produto' | 'categoria' | 'ofertas' | 'roleta' | 'url'
  link_type   text not null default 'ofertas',
  link_value  text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Oferta em destaque: preço promocional de um produto por um período.
create table offers (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references products(id) on delete cascade,
  title              text not null,
  badge              text default 'Oferta do dia',
  offer_price_cents  integer not null check (offer_price_cents >= 0),
  image_url          text,
  starts_at          timestamptz not null default now(),
  ends_at            timestamptz,             -- null = sem contagem regressiva
  active             boolean not null default true,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now()
);
create index on offers (active, starts_at, ends_at);

create table coupons (
  id                        uuid primary key default gen_random_uuid(),
  code                      text not null unique,
  description               text,
  discount_kind             discount_type not null,
  -- percentual: 10.00 = 10%   | fixo: ignorado
  discount_percent          numeric(5,2) check (discount_percent is null or (discount_percent > 0 and discount_percent <= 100)),
  -- fixo: valor em centavos  | percentual: ignorado
  discount_cents            integer check (discount_cents is null or discount_cents > 0),
  -- Teto do desconto quando percentual (evita 20% de um pedido gigante).
  max_discount_cents        integer check (max_discount_cents is null or max_discount_cents > 0),
  min_order_cents           integer not null default 0 check (min_order_cents >= 0),
  valid_from                timestamptz not null default now(),
  valid_until               timestamptz,
  usage_limit               integer check (usage_limit is null or usage_limit > 0),
  usage_limit_per_customer  integer not null default 1 check (usage_limit_per_customer > 0),
  used_count                integer not null default 0,
  -- Cupom "clicável" que aparece na tela de Ofertas sem precisar digitar.
  is_public                 boolean not null default false,
  -- Cupom pessoal (prêmio de roleta / fidelidade) — só vale para este cliente.
  customer_id               uuid references customers(id) on delete cascade,
  source                    text not null default 'admin', -- admin | roleta | fidelidade
  active                    boolean not null default true,
  created_at                timestamptz not null default now(),
  -- Coerência entre tipo e valor
  check (
    (discount_kind = 'percentual' and discount_percent is not null) or
    (discount_kind = 'fixo'       and discount_cents  is not null) or
    (discount_kind in ('frete_gratis', 'brinde'))
  )
);
create index on coupons (code);
create index on coupons (customer_id) where customer_id is not null;
create index on coupons (is_public, active);

create table coupon_redemptions (
  id             uuid primary key default gen_random_uuid(),
  coupon_id      uuid not null references coupons(id) on delete cascade,
  customer_id    uuid not null references customers(id) on delete cascade,
  order_id       uuid,   -- FK adicionada depois de criar orders
  discount_cents integer not null default 0,
  created_at     timestamptz not null default now()
);
create index on coupon_redemptions (coupon_id, customer_id);

-- Configuração da roleta (singleton).
create table roulette_config (
  id                  smallint primary key default 1 check (id = 1),
  active              boolean not null default true,
  -- 'dia' = 1 giro a cada 24h | 'pedido' = 1 giro liberado por pedido entregue
  spin_rule           text not null default 'dia' check (spin_rule in ('dia', 'pedido')),
  cooldown_hours      integer not null default 24 check (cooldown_hours > 0),
  prize_validity_hours integer not null default 48 check (prize_validity_hours > 0),
  updated_at          timestamptz not null default now()
);

-- Prêmios com peso (probabilidade relativa). weight 0 = desativado no sorteio.
create table roulette_prizes (
  id               uuid primary key default gen_random_uuid(),
  label            text not null,                -- ex: "10% OFF"
  prize_kind       discount_type,                -- null = "não foi dessa vez"
  discount_percent numeric(5,2),
  discount_cents   integer,
  gift_description text,                         -- para prize_kind = 'brinde'
  min_order_cents  integer not null default 0,
  weight           integer not null default 1 check (weight >= 0),
  color            text not null default '#8B2635',
  active           boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now()
);

create table roulette_spins (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  prize_id    uuid references roulette_prizes(id) on delete set null,
  coupon_id   uuid references coupons(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on roulette_spins (customer_id, created_at desc);

-- Programa de fidelidade (singleton).
create table loyalty_config (
  id                    smallint primary key default 1 check (id = 1),
  active                boolean not null default true,
  points_per_real       numeric(6,2) not null default 1 check (points_per_real > 0),
  points_to_reward      integer not null default 100 check (points_to_reward > 0),
  reward_kind           discount_type not null default 'fixo',
  reward_percent        numeric(5,2),
  reward_cents          integer default 1000,
  expire_days           integer,      -- null = pontos não expiram
  updated_at            timestamptz not null default now()
);

create table loyalty_transactions (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  order_id    uuid,   -- FK adicionada depois de criar orders
  points      integer not null,   -- positivo = ganho, negativo = resgate
  kind        loyalty_tx_type not null,
  description text,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index on loyalty_transactions (customer_id, created_at desc);

-- =============================================================================
-- 5. PAGAMENTOS — roteador configurável
-- =============================================================================
-- Uma linha por método. Trocar de gateway no futuro = trocar `provider` aqui,
-- sem mexer no app. Segredos (API keys) NUNCA ficam nesta tabela: vivem nas
-- variáveis de ambiente das Edge Functions.
create table payment_config (
  method      payment_method primary key,
  provider    text not null,          -- 'infinitepay' | 'asaas' | 'manual'
  is_active   boolean not null default true,
  label       text not null,          -- rótulo exibido ao cliente
  description text,
  -- Opções não-sensíveis: parcelas máximas, bandeiras aceitas, etc.
  options     jsonb not null default '{}',
  sort_order  integer not null default 0,
  updated_at  timestamptz not null default now()
);

-- =============================================================================
-- 6. PEDIDOS
-- =============================================================================

-- Código curto e legível para o cliente/cozinha: SA-000123
create sequence order_code_seq start 1;

create table orders (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique default 'SA-' || lpad(nextval('order_code_seq')::text, 6, '0'),
  customer_id         uuid not null references customers(id) on delete restrict,
  status              order_status not null default 'aguardando_pagamento',
  fulfillment         fulfillment_type not null default 'entrega',

  -- Snapshot do endereço no momento do pedido (endereço pode ser editado depois).
  address_snapshot    jsonb,
  delivery_zone_id    uuid references delivery_zones(id) on delete set null,

  -- Valores (centavos). Sempre calculados no servidor, nunca vindos do cliente.
  subtotal_cents      integer not null default 0 check (subtotal_cents >= 0),
  delivery_fee_cents  integer not null default 0 check (delivery_fee_cents >= 0),
  discount_cents      integer not null default 0 check (discount_cents >= 0),
  total_cents         integer not null default 0 check (total_cents >= 0),

  coupon_id           uuid references coupons(id) on delete set null,
  coupon_code         text,
  gift_description    text,     -- brinde da roleta/cupom aplicado

  -- Pagamento
  payment_method      payment_method not null,
  payment_status      payment_status not null default 'pendente',
  payment_provider    text,     -- gateway efetivamente usado
  payment_ref         text,     -- id da cobrança no gateway
  payment_url         text,     -- checkout / QR Code Pix
  payment_payload     jsonb not null default '{}',  -- copia/cola pix, brand, etc.
  installments        smallint not null default 1 check (installments >= 1),

  -- Só para payment_method = 'na_entrega': o que o entregador leva.
  on_delivery_kind    on_delivery_kind,
  change_for_cents    integer check (change_for_cents is null or change_for_cents >= 0),

  -- Coerência: pagamento na entrega exige saber a forma; pagamento online não
  -- pode ter forma de entrega. E troco só existe em dinheiro.
  constraint orders_on_delivery_ck check (
    (payment_method = 'na_entrega' and on_delivery_kind is not null)
    or (payment_method <> 'na_entrega' and on_delivery_kind is null)
  ),
  constraint orders_change_ck check (
    change_for_cents is null or on_delivery_kind = 'dinheiro'
  ),

  -- Fidelidade
  points_earned       integer not null default 0,
  points_redeemed     integer not null default 0,

  notes               text,
  cancel_reason       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  paid_at             timestamptz,
  delivered_at        timestamptz
);
create index on orders (customer_id, created_at desc);
create index on orders (status, created_at desc);
create index on orders (created_at desc);
create index on orders (payment_ref) where payment_ref is not null;

create table order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references orders(id) on delete cascade,
  product_id       uuid references products(id) on delete set null,
  -- Snapshots: o pedido antigo não pode mudar se o produto mudar de nome/preço.
  product_name     text not null,
  product_image    text,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity         integer not null check (quantity > 0),
  addons           jsonb not null default '[]',  -- [{id,name,price_cents}]
  addons_cents     integer not null default 0,
  notes            text,                          -- "sem gengibre"
  total_cents      integer not null check (total_cents >= 0),
  created_at       timestamptz not null default now()
);
create index on order_items (order_id);

create table order_status_history (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders(id) on delete cascade,
  status     order_status not null,
  changed_by uuid references auth.users(id) on delete set null,
  note       text,
  created_at timestamptz not null default now()
);
create index on order_status_history (order_id, created_at);

-- FKs pendentes agora que `orders` existe
alter table coupon_redemptions
  add constraint coupon_redemptions_order_fk
  foreign key (order_id) references orders(id) on delete set null;

alter table loyalty_transactions
  add constraint loyalty_transactions_order_fk
  foreign key (order_id) references orders(id) on delete set null;

-- Um cliente não pode resgatar o mesmo cupom duas vezes no mesmo pedido.
create unique index coupon_redemptions_unique_order
  on coupon_redemptions (coupon_id, order_id) where order_id is not null;

-- ---------------------------------------------------------------------------
-- Triggers de updated_at
-- ---------------------------------------------------------------------------
create trigger t_products_updated   before update on products   for each row execute function set_updated_at();
create trigger t_categories_updated before update on categories for each row execute function set_updated_at();
create trigger t_customers_updated  before update on customers  for each row execute function set_updated_at();
create trigger t_orders_updated     before update on orders     for each row execute function set_updated_at();
create trigger t_settings_updated   before update on restaurant_settings for each row execute function set_updated_at();
create trigger t_payment_updated    before update on payment_config      for each row execute function set_updated_at();

-- Toda mudança de status vira histórico (relatório + rastreio do cliente).
create or replace function log_order_status()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into order_status_history (order_id, status, changed_by)
    values (new.id, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger t_orders_status_history
  after insert or update of status on orders
  for each row execute function log_order_status();

-- ---------------------------------------------------------------------------
-- Realtime: cliente acompanha o próprio pedido, cozinha acompanha a fila.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_items;
