-- =============================================================================
-- Fidelização, aquisição e aumento de ticket
--
-- Tudo aqui compartilha a mesma postura das migrações anteriores: o cliente
-- nunca escreve valor de dinheiro. Cashback, carimbo e crédito são calculados
-- em funções SECURITY DEFINER a partir de pedidos já pagos — se o app do
-- cliente pudesse gravar saldo, bastava abrir o console do navegador para se
-- dar crédito.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Pétalas de sakura — liga e desliga pelo painel
--
-- No código isso é enfeite; aqui é uma linha, e evita que o restaurante
-- precise de deploy para aproveitar a florada ou o Ano-Novo.
-- ---------------------------------------------------------------------------
alter table restaurant_settings
  add column if not exists sakura_ativa boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. Cupom de primeira compra
--
-- A trava é no servidor, dentro da validação de cupom, não no app: "só quem
-- nunca pediu" conferido no navegador é só uma sugestão.
-- ---------------------------------------------------------------------------
alter table coupons
  add column if not exists first_order_only boolean not null default false;

comment on column coupons.first_order_only is
  'Só vale para cliente sem nenhum pedido pago. Conferido em validate_coupon().';

-- ---------------------------------------------------------------------------
-- 3. Desconto por forma de pagamento
--
-- O Pix custa 0,99% e o débito 3,99%. Um desconto pequeno no Pix ainda deixa
-- o restaurante na frente e move o cliente para a forma que sangra menos.
-- Fica no roteador de pagamento, junto do resto da configuração de cada forma.
-- ---------------------------------------------------------------------------
alter table payment_config
  add column if not exists discount_percent numeric(5,2) not null default 0
    check (discount_percent >= 0 and discount_percent <= 20);

comment on column payment_config.discount_percent is
  'Desconto oferecido ao cliente por escolher esta forma. Teto de 20% para um '
  'erro de digitação no painel não zerar o valor do pedido.';

-- ---------------------------------------------------------------------------
-- 4. Cartela de carimbos — compre N, ganhe 1
--
-- Vive ao lado do programa de pontos, não no lugar dele: pontos premiam quem
-- gasta muito, carimbo premia quem volta sempre, e são clientes diferentes.
-- ---------------------------------------------------------------------------
alter table loyalty_config
  add column if not exists stamp_active   boolean not null default false,
  add column if not exists stamps_needed  integer not null default 10
    check (stamps_needed between 2 and 50),
  add column if not exists stamp_min_cents integer not null default 0
    check (stamp_min_cents >= 0),
  add column if not exists stamp_reward_kind   discount_type not null default 'percentual',
  add column if not exists stamp_reward_percent numeric(5,2) default 100,
  add column if not exists stamp_reward_cents   integer;

comment on column loyalty_config.stamp_min_cents is
  'Valor mínimo do pedido para valer carimbo. Sem isso, dez pedidos de um '
  'refrigerante viram um combinado de graça.';

-- Cartelas fechadas. Guardamos o fechamento em vez de recontar tudo toda vez:
-- assim o carimbo já usado não volta a contar quando a cartela reinicia.
create table if not exists loyalty_stamp_cards (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references customers(id) on delete cascade,
  closed_at     timestamptz not null default now(),
  -- Cupom gerado como prêmio, para o cliente rastrear o que ganhou.
  coupon_id     uuid references coupons(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists loyalty_stamp_cards_customer_idx
  on loyalty_stamp_cards (customer_id, closed_at desc);

-- ---------------------------------------------------------------------------
-- 5. Crédito na casa (cashback)
--
-- Um lançamento por movimento, nunca um campo "saldo" que se sobrescreve:
-- saldo que se sobrescreve perde a história e não dá para auditar quando o
-- cliente reclamar que sumiu crédito.
-- ---------------------------------------------------------------------------
create table if not exists customer_credits (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references customers(id) on delete cascade,
  cents         integer not null,          -- positivo = ganhou, negativo = usou
  reason        text not null,
  order_id      uuid references orders(id) on delete set null,
  -- Crédito com prazo é o que faz o cliente voltar. Nulo = não expira.
  expires_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists customer_credits_customer_idx
  on customer_credits (customer_id, created_at desc);

alter table loyalty_config
  add column if not exists cashback_percent numeric(5,2) not null default 0
    check (cashback_percent >= 0 and cashback_percent <= 30),
  add column if not exists cashback_expire_days integer
    check (cashback_expire_days is null or cashback_expire_days > 0);

/** Saldo de crédito do cliente, já descontado o que expirou. */
create or replace function credit_balance(p_customer uuid default auth.uid())
returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(cents), 0)::integer
  from customer_credits
  where customer_id = p_customer
    and (expires_at is null or expires_at > now());
$$;

-- ---------------------------------------------------------------------------
-- 6. Níveis de cliente
--
-- O nível sai do que a pessoa gastou nos últimos 180 dias, não do total da
-- vida: nível vitalício premia quem comprou muito uma vez e sumiu, que é o
-- oposto do que o programa quer.
-- ---------------------------------------------------------------------------
create table if not exists loyalty_tiers (
  id              smallint primary key,
  name            text not null,
  min_cents       integer not null check (min_cents >= 0),
  -- O que o nível destrava. Frete grátis é o benefício que mais move gente.
  free_delivery   boolean not null default false,
  discount_percent numeric(5,2) not null default 0
    check (discount_percent >= 0 and discount_percent <= 30),
  perk            text,
  sort_order      smallint not null default 0
);

insert into loyalty_tiers (id, name, min_cents, free_delivery, discount_percent, perk, sort_order)
values
  (1, 'Iniciante', 0,      false, 0, 'Bem-vindo ao Sushi Art',              1),
  (2, 'Samurai',   30000,  false, 5, '5% de desconto em todo pedido',       2),
  (3, 'Mestre',    80000,  true,  5, 'Frete grátis sempre e 5% de desconto', 3)
on conflict (id) do nothing;

/** Nível atual do cliente, pelo gasto dos últimos 180 dias. */
create or replace function customer_tier(p_customer uuid default auth.uid())
returns loyalty_tiers
language sql stable security definer set search_path = public as $$
  select t.*
  from loyalty_tiers t
  where t.min_cents <= coalesce((
    select sum(o.total_cents)
    from orders o
    where o.customer_id = p_customer
      and o.status = 'entregue'
      and o.created_at > now() - interval '180 days'
  ), 0)
  order by t.min_cents desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 7. Avaliação do pedido
--
-- Uma avaliação por pedido, e só de pedido entregue: nota em pedido que nunca
-- chegou não diz nada sobre a comida.
-- ---------------------------------------------------------------------------
create table if not exists order_reviews (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null unique references orders(id) on delete cascade,
  customer_id  uuid not null references customers(id) on delete cascade,
  rating       smallint not null check (rating between 1 and 5),
  comment      text,
  -- Cupom dado como agradecimento, se a configuração premiar avaliação.
  coupon_id    uuid references coupons(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists order_reviews_customer_idx on order_reviews (customer_id);
create index if not exists order_reviews_rating_idx on order_reviews (rating, created_at desc);

-- ---------------------------------------------------------------------------
-- 8. Indicação premiada
--
-- Os dois lados ganham. Premiar só quem indica faz o programa soar a corrente,
-- e quem recebe o convite não tem motivo nenhum para usar.
-- ---------------------------------------------------------------------------
alter table customers
  add column if not exists referral_code text unique;

create table if not exists referrals (
  id             uuid primary key default gen_random_uuid(),
  referrer_id    uuid not null references customers(id) on delete cascade,
  referred_id    uuid not null references customers(id) on delete cascade,
  -- Só vira prêmio quando o primeiro pedido do indicado é entregue: pagar na
  -- criação da conta é convite para cadastrar contas falsas.
  qualified_at   timestamptz,
  order_id       uuid references orders(id) on delete set null,
  created_at     timestamptz not null default now(),
  -- Ninguém é indicado duas vezes, e ninguém indica a si mesmo.
  unique (referred_id),
  check (referrer_id <> referred_id)
);
create index if not exists referrals_referrer_idx on referrals (referrer_id);

alter table loyalty_config
  add column if not exists referral_active boolean not null default false,
  add column if not exists referral_referrer_cents integer not null default 1000
    check (referral_referrer_cents >= 0),
  add column if not exists referral_referred_cents integer not null default 1000
    check (referral_referred_cents >= 0);

/**
 * Código de indicação: 6 caracteres, sem vogal.
 *
 * Sem vogal por dois motivos que valem mais que a elegância: o código nunca
 * forma palavra sem querer (inclusive palavrão, que o cliente vai ler alto ao
 * indicar um amigo), e some a confusão entre O e 0, I e 1.
 */
create or replace function gerar_codigo_indicacao()
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  alfabeto constant text := 'BCDFGHJKLMNPQRSTVWXZ23456789';
  tentativa text;
begin
  loop
    tentativa := '';
    for _ in 1..6 loop
      tentativa := tentativa || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
    end loop;

    exit when not exists (select 1 from customers where referral_code = tentativa);
  end loop;

  return tentativa;
end;
$$;

/** Todo cliente novo já nasce com código — não adianta ter programa se o
    código só existe depois que alguém pede por ele. */
create or replace function preencher_codigo_indicacao()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.referral_code is null then
    new.referral_code := gerar_codigo_indicacao();
  end if;
  return new;
end;
$$;

drop trigger if exists customers_codigo_indicacao on customers;
create trigger customers_codigo_indicacao
  before insert on customers
  for each row execute function preencher_codigo_indicacao();

-- Quem já é cliente também recebe o seu.
update customers set referral_code = gerar_codigo_indicacao() where referral_code is null;

-- ---------------------------------------------------------------------------
-- 9. Pedido agendado
--
-- Ajuda os dois lados: o cliente garante o jantar de sexta e a cozinha enxerga
-- a demanda antes de ela chegar, o que evita o atraso do pico.
-- ---------------------------------------------------------------------------
alter table orders
  add column if not exists scheduled_for timestamptz;

create index if not exists orders_scheduled_idx
  on orders (scheduled_for) where scheduled_for is not null;

alter table restaurant_settings
  add column if not exists scheduling_active boolean not null default false,
  add column if not exists scheduling_max_days smallint not null default 7
    check (scheduling_max_days between 1 and 30);

-- ---------------------------------------------------------------------------
-- 10. Carrinho abandonado
--
-- Guarda só o suficiente para lembrar a pessoa do que ela deixou: o carrinho
-- de verdade continua no aparelho dela. Um por cliente — a ideia é lembrar do
-- que ficou por fazer, não montar um histórico de tudo que ele desistiu.
-- ---------------------------------------------------------------------------
create table if not exists abandoned_carts (
  customer_id   uuid primary key references customers(id) on delete cascade,
  items         jsonb not null,
  total_cents   integer not null default 0,
  reminded_at   timestamptz,
  updated_at    timestamptz not null default now()
);

-- =============================================================================
-- RLS
-- =============================================================================
alter table loyalty_stamp_cards enable row level security;
alter table customer_credits    enable row level security;
alter table loyalty_tiers       enable row level security;
alter table order_reviews       enable row level security;
alter table referrals           enable row level security;
alter table abandoned_carts     enable row level security;

-- Cliente lê o que é dele; escrita só pelas funções SECURITY DEFINER.
create policy stamp_cards_own on loyalty_stamp_cards
  for select to authenticated using (customer_id = auth.uid() or is_staff());

create policy credits_own on customer_credits
  for select to authenticated using (customer_id = auth.uid() or is_staff());

create policy referrals_own on referrals
  for select to authenticated using (
    referrer_id = auth.uid() or referred_id = auth.uid() or is_staff()
  );

-- A tabela de níveis é catálogo: qualquer um lê (é o que a tela "faltam R$ X
-- para o próximo nível" mostra), só admin muda.
create policy tiers_read on loyalty_tiers for select using (true);
create policy tiers_admin on loyalty_tiers
  for all to authenticated using (is_admin()) with check (is_admin());

-- A avaliação é o único lugar em que o cliente escreve direto. Pode: não é
-- dinheiro, e as travas que importam (pedido dele, pedido entregue, uma por
-- pedido) estão na policy e no `unique`, não no app.
create policy reviews_read on order_reviews
  for select to authenticated using (customer_id = auth.uid() or is_staff());

create policy reviews_insert on order_reviews
  for insert to authenticated with check (
    customer_id = auth.uid()
    and exists (
      select 1 from orders o
      where o.id = order_id
        and o.customer_id = auth.uid()
        and o.status = 'entregue'
    )
  );

-- O carrinho abandonado é do próprio cliente e não vale dinheiro nenhum — o
-- pedido é recalculado no servidor quando ele finaliza. Pode escrever.
create policy carts_own on abandoned_carts
  for all to authenticated using (customer_id = auth.uid() or is_staff())
  with check (customer_id = auth.uid());
