-- =============================================================================
-- Row Level Security
-- Princípios:
--   1. O cardápio é público (anon pode ler para navegar sem login).
--   2. Cliente só enxerga os PRÓPRIOS dados (pedidos, endereços, cupons, pontos).
--   3. Escrita em pedidos/cupons/roleta NÃO é permitida direto pelo cliente:
--      passa obrigatoriamente pelas funções SECURITY DEFINER (0003), que
--      recalculam preços no servidor. Isso impede adulteração de valores.
--   4. Staff (tabela `staff`) tem acesso total ao painel admin.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers. SECURITY DEFINER + search_path fixo evita recursão de policy e
-- sequestro de search_path.
-- ---------------------------------------------------------------------------
create or replace function is_staff()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff
    where user_id = auth.uid() and active
  );
$$;

create or replace function is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff
    where user_id = auth.uid() and active and role = 'admin'
  );
$$;

revoke all on function is_staff() from public;
revoke all on function is_admin() from public;
grant execute on function is_staff(), is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Ativa RLS em tudo
-- ---------------------------------------------------------------------------
alter table staff                enable row level security;
alter table restaurant_settings  enable row level security;
alter table business_hours       enable row level security;
alter table delivery_zones       enable row level security;
alter table categories           enable row level security;
alter table products             enable row level security;
alter table addon_groups         enable row level security;
alter table product_addons       enable row level security;
alter table customers            enable row level security;
alter table addresses            enable row level security;
alter table favorites            enable row level security;
alter table push_tokens          enable row level security;
alter table notifications        enable row level security;
alter table banners              enable row level security;
alter table offers               enable row level security;
alter table coupons              enable row level security;
alter table coupon_redemptions   enable row level security;
alter table roulette_config      enable row level security;
alter table roulette_prizes      enable row level security;
alter table roulette_spins       enable row level security;
alter table loyalty_config       enable row level security;
alter table loyalty_transactions enable row level security;
alter table payment_config       enable row level security;
alter table orders               enable row level security;
alter table order_items          enable row level security;
alter table order_status_history enable row level security;

-- ---------------------------------------------------------------------------
-- STAFF
-- ---------------------------------------------------------------------------
create policy staff_self_read on staff
  for select using (user_id = auth.uid());

create policy staff_admin_all on staff
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- CATÁLOGO E CONFIGURAÇÕES PÚBLICAS (leitura livre / escrita só staff)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'restaurant_settings','business_hours','delivery_zones',
    'categories','products','addon_groups','product_addons',
    'banners','offers','roulette_prizes','roulette_config','loyalty_config'
  ] loop
    execute format(
      'create policy %I on %I for select to anon, authenticated using (true)',
      t || '_public_read', t
    );
    execute format(
      'create policy %I on %I for all to authenticated using (is_staff()) with check (is_staff())',
      t || '_staff_write', t
    );
  end loop;
end $$;

-- payment_config: o cliente precisa saber QUAIS métodos existem, mas não
-- precisa (nem deve) saber configurações internas de gateway inativo.
create policy payment_config_public_read on payment_config
  for select to anon, authenticated using (is_active);

create policy payment_config_staff_all on payment_config
  for all to authenticated using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------------------
-- CLIENTES
-- ---------------------------------------------------------------------------
create policy customers_self on customers
  for select using (id = auth.uid() or is_staff());

create policy customers_self_insert on customers
  for insert to authenticated with check (id = auth.uid());

create policy customers_self_update on customers
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy customers_staff_all on customers
  for all to authenticated using (is_staff()) with check (is_staff());

create policy addresses_owner on addresses
  for all to authenticated
  using (customer_id = auth.uid() or is_staff())
  with check (customer_id = auth.uid());

create policy favorites_owner on favorites
  for all to authenticated
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

create policy push_tokens_owner on push_tokens
  for all to authenticated
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

create policy notifications_owner on notifications
  for select to authenticated
  using (customer_id = auth.uid() or customer_id is null or is_staff());

create policy notifications_owner_update on notifications
  for update to authenticated
  using (customer_id = auth.uid()) with check (customer_id = auth.uid());

create policy notifications_staff_write on notifications
  for all to authenticated using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------------------
-- CUPONS
-- Cliente vê: cupons públicos vigentes + os cupons pessoais dele (roleta).
-- Cliente NÃO enumera cupons privados de outras pessoas.
-- ---------------------------------------------------------------------------
create policy coupons_visible on coupons
  for select to anon, authenticated
  using (
    is_staff()
    or (
      active
      and ((customer_id is null and is_public) or customer_id = auth.uid())
      and valid_from <= now()
      and (valid_until is null or valid_until >= now())
    )
  );

create policy coupons_staff_all on coupons
  for all to authenticated using (is_staff()) with check (is_staff());

create policy redemptions_owner_read on coupon_redemptions
  for select to authenticated using (customer_id = auth.uid() or is_staff());

create policy redemptions_staff_all on coupon_redemptions
  for all to authenticated using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------------------
-- ROLETA E FIDELIDADE (histórico só de leitura; gravação via RPC)
-- ---------------------------------------------------------------------------
create policy spins_owner_read on roulette_spins
  for select to authenticated using (customer_id = auth.uid() or is_staff());

create policy spins_staff_all on roulette_spins
  for all to authenticated using (is_staff()) with check (is_staff());

create policy loyalty_owner_read on loyalty_transactions
  for select to authenticated using (customer_id = auth.uid() or is_staff());

create policy loyalty_staff_all on loyalty_transactions
  for all to authenticated using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------------------
-- PEDIDOS
-- Cliente lê os próprios; criação e mudança de status passam por RPC.
-- ---------------------------------------------------------------------------
create policy orders_owner_read on orders
  for select to authenticated using (customer_id = auth.uid() or is_staff());

create policy orders_staff_write on orders
  for all to authenticated using (is_staff()) with check (is_staff());

create policy order_items_owner_read on order_items
  for select to authenticated
  using (
    exists (select 1 from orders o where o.id = order_id and (o.customer_id = auth.uid() or is_staff()))
  );

create policy order_items_staff_write on order_items
  for all to authenticated using (is_staff()) with check (is_staff());

create policy order_history_owner_read on order_status_history
  for select to authenticated
  using (
    exists (select 1 from orders o where o.id = order_id and (o.customer_id = auth.uid() or is_staff()))
  );

create policy order_history_staff_write on order_status_history
  for all to authenticated using (is_staff()) with check (is_staff());
