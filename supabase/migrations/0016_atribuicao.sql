-- =============================================================================
-- De qual campanha veio cada venda
--
-- Tabela À PARTE, e não colunas em `orders`, por três motivos:
--
--   1. `orders` é lida no meio do serviço, na tela da cozinha. Engordar cada
--      linha com dez campos de marketing que ninguém olha ali custa em toda
--      consulta do dia a dia.
--   2. Pedido é registro fiscal; origem de campanha é dado de análise. Coisas
--      com ciclos de vida diferentes não deveriam dividir a mesma linha.
--   3. Um pedido sem atribuição (cliente que digitou o endereço) simplesmente
--      não tem linha aqui — em vez de dez colunas nulas em `orders`.
--
-- Nada aqui é dado pessoal: são rótulos de campanha e identificadores de
-- clique que o próprio anunciante gerou.
-- =============================================================================

create table if not exists order_attribution (
  order_id      uuid primary key references orders(id) on delete cascade,
  customer_id   uuid references customers(id) on delete set null,

  -- Último toque: o que trouxe ESTA compra.
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  utm_term      text,
  fbclid        text,
  gclid         text,
  landing_page  text,

  -- Primeiro toque inteiro, como veio do navegador. Guardado em jsonb porque
  -- é dado de leitura ocasional e o formato pode ganhar campos novos sem
  -- exigir migração.
  primeiro_toque jsonb,

  first_touch_at timestamptz,
  last_touch_at  timestamptz,
  created_at     timestamptz not null default now()
);

-- O relatório pergunta "quanto vendeu a campanha X" — este índice é o que
-- responde sem varrer a tabela inteira.
create index if not exists order_attribution_campanha_idx
  on order_attribution (utm_source, utm_campaign);

create index if not exists order_attribution_customer_idx
  on order_attribution (customer_id);

alter table order_attribution enable row level security;

-- O cliente grava a origem do PRÓPRIO pedido, e só do próprio. Pode: não é
-- dinheiro nem regra de negócio — é de onde ele veio, e mentir aqui só
-- estragaria o relatório do próprio restaurante.
create policy atribuicao_insere_propria on order_attribution
  for insert to authenticated with check (
    exists (
      select 1 from orders o
      where o.id = order_id and o.customer_id = auth.uid()
    )
  );

-- Ler é da equipe: é relatório de marketing, não informação do cliente.
create policy atribuicao_le_staff on order_attribution
  for select to authenticated using (is_staff());

-- ---------------------------------------------------------------------------
-- Relatório: faturamento por campanha
--
-- Conta só pedido PAGO. Somar pedido pendente daria à campanha crédito por
-- venda que não aconteceu — e é justamente com esse número que se decide onde
-- colocar mais verba.
-- ---------------------------------------------------------------------------
create or replace function report_por_campanha(p_from date, p_to date)
returns table (
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_content  text,
  pedidos      bigint,
  receita_cents bigint,
  ticket_medio_cents bigint
)
language sql stable security definer set search_path = public as $$
  select
    coalesce(a.utm_source, 'direto'),
    coalesce(a.utm_medium, '—'),
    coalesce(a.utm_campaign, '—'),
    coalesce(a.utm_content, '—'),
    count(*),
    sum(o.total_cents)::bigint,
    (sum(o.total_cents) / count(*))::bigint
  from orders o
  left join order_attribution a on a.order_id = o.id
  where o.created_at::date between p_from and p_to
    and o.status in ('pago','confirmado_entrega','em_preparo',
                     'saiu_para_entrega','pronto_para_retirada','entregue')
  group by 1, 2, 3, 4
  order by 6 desc;
$$;

revoke all on function report_por_campanha(date, date) from public, anon;
grant execute on function report_por_campanha(date, date) to authenticated;
