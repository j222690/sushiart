-- =============================================================================
-- 0007 — NOTIFICAÇÕES PUSH (cliente e equipe)
--
-- A ideia central: o app nunca dispara push. Quem dispara é o banco.
--
-- Toda mudança que interessa a alguém já grava uma linha em `notifications`
-- (era assim antes desta migration). Aqui essa tabela vira o único gatilho:
-- entrou linha → um trigger chama a Edge Function `send-push`, que criptografa
-- e entrega. Duas consequências boas:
--
--   · o aviso sai com o app fechado — não depende de aba aberta em lugar nenhum;
--   · não existe caminho que mude o pedido e "esqueça" de notificar, porque
--     mudar o pedido e gravar a notificação é a mesma transação.
--
-- Ordem: rode depois de 0001..0006.
-- =============================================================================

create extension if not exists pg_net;

-- -----------------------------------------------------------------------------
-- 1. Público da notificação
--
-- Antes, `customer_id is null` significava "aviso para todo mundo". Agora
-- existe um segundo público — a equipe — e misturar os dois na mesma coluna
-- faria a cozinha receber promoção e o cliente receber "pedido novo chegou".
-- -----------------------------------------------------------------------------
do $$ begin
  create type notification_audience as enum ('cliente', 'equipe');
exception when duplicate_object then null;
end $$;

alter table notifications
  add column if not exists audience notification_audience not null default 'cliente';

create index if not exists notifications_equipe_idx
  on notifications (created_at desc) where audience = 'equipe';

-- -----------------------------------------------------------------------------
-- 2. Aparelhos
--
-- A equipe entra pelo app do cliente (é o que o README manda), então todo
-- membro da equipe também tem linha em `customers` — por isso `push_tokens`
-- continua apontando para lá. O que muda é que o MESMO navegador pode estar
-- registrado nos dois papéis: o dono usa o painel de dia e pede sushi de noite,
-- e são avisos diferentes. Daí a unicidade virar (token, audience).
-- -----------------------------------------------------------------------------
alter table push_tokens
  add column if not exists audience notification_audience not null default 'cliente';

alter table push_tokens drop constraint if exists push_tokens_token_key;

create unique index if not exists push_tokens_token_audience_idx
  on push_tokens (token, audience);

create index if not exists push_tokens_audience_idx on push_tokens (audience);

-- -----------------------------------------------------------------------------
-- 3. RLS
--
-- O ponto delicado: um cliente comum NÃO pode se registrar como 'equipe'. Se
-- pudesse, passaria a receber o nome, o endereço e o valor de todo pedido que
-- entrasse na loja. O `with check` barra isso na escrita.
-- -----------------------------------------------------------------------------
drop policy if exists push_tokens_owner on push_tokens;

create policy push_tokens_owner on push_tokens
  for all to authenticated
  using (customer_id = auth.uid())
  with check (
    customer_id = auth.uid()
    and (audience = 'cliente' or is_staff())
  );

drop policy if exists notifications_owner on notifications;

create policy notifications_owner on notifications
  for select to authenticated
  using (
    is_staff()
    or (audience = 'cliente' and (customer_id = auth.uid() or customer_id is null))
  );

-- -----------------------------------------------------------------------------
-- 4. Onde mora a configuração do disparo
--
-- Schema `private`: sem grant para anon nem authenticated. Só funções
-- `security definer` (que rodam como dono) enxergam. A URL e o segredo ficam
-- aqui em vez de hardcoded para dar pra trocar sem reescrever função.
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

revoke all on private.app_config from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. O disparo
--
-- `net.http_post` do pg_net é assíncrono: enfileira e devolve na hora. O pedido
-- do cliente não fica esperando o Google responder — se o push falhar, o pedido
-- já está gravado do mesmo jeito.
-- -----------------------------------------------------------------------------
create or replace function dispatch_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_url    text;
  v_secret text;
begin
  select value into v_url    from private.app_config where key = 'push_function_url';
  select value into v_secret from private.app_config where key = 'push_hook_secret';

  -- Push ainda não configurado: segue o baile. O app inteiro funciona sem push,
  -- e uma instalação nova não pode quebrar ao criar o primeiro pedido.
  if v_url is null or v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-push-secret', v_secret
               ),
    body    := jsonb_build_object('notification_id', new.id),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists notifications_dispatch_push on notifications;

create trigger notifications_dispatch_push
  after insert on notifications
  for each row execute function dispatch_push();

-- =============================================================================
-- 6. Avisos que ainda não existiam
--
-- `admin_set_order_status` e `mark_order_paid` já avisavam o CLIENTE a cada
-- mudança de status. Faltava o outro lado: a cozinha não era avisada de nada.
--
-- Feito por trigger em `orders`, e não editando `create_order`, de propósito:
-- `create_order` tem ~250 linhas de regra de dinheiro e não vale reescrever
-- inteira para pendurar um insert no fim.
-- =============================================================================

-- Pedido novo já pago na entrega: entra direto na fila da cozinha.
create or replace function notify_order_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'confirmado_entrega' then
    -- Pagamento online: quem avisa a cozinha é a confirmação do webhook,
    -- não a criação. Pedido não pago não é pedido.
    return new;
  end if;

  insert into notifications (customer_id, audience, title, body, data) values (
    null,
    'equipe',
    'Pedido novo · ' || new.code,
    case when new.fulfillment = 'retirada' then 'Retirada' else 'Entrega' end
      || ' · R$ ' || replace(to_char(new.total_cents / 100.0, 'FM999999990.00'), '.', ',')
      || ' · paga na entrega',
    jsonb_build_object('order_id', new.id, 'type', 'novo_pedido', 'code', new.code)
  );

  insert into notifications (customer_id, audience, title, body, data) values (
    new.customer_id,
    'cliente',
    'Pedido confirmado 🍣',
    'Recebemos o pedido ' || new.code || '. Já vamos preparar!',
    jsonb_build_object('order_id', new.id, 'type', 'confirmacao')
  );

  return new;
end;
$$;

drop trigger if exists orders_notify_created on orders;

create trigger orders_notify_created
  after insert on orders
  for each row execute function notify_order_created();

-- Pagamento online confirmado pelo webhook: agora sim a cozinha é avisada.
-- (O aviso ao cliente já sai de dentro de `mark_order_paid`.)
create or replace function notify_order_paid()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.payment_status = 'pago' and old.payment_status is distinct from 'pago' then
    insert into notifications (customer_id, audience, title, body, data) values (
      null,
      'equipe',
      'Pedido novo · ' || new.code,
      case when new.fulfillment = 'retirada' then 'Retirada' else 'Entrega' end
        || ' · R$ ' || replace(to_char(new.total_cents / 100.0, 'FM999999990.00'), '.', ',')
        || ' · pago via ' || coalesce(new.payment_provider, 'online'),
      jsonb_build_object('order_id', new.id, 'type', 'novo_pedido', 'code', new.code)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists orders_notify_paid on orders;

create trigger orders_notify_paid
  after update of payment_status on orders
  for each row execute function notify_order_paid();

-- Cliente desistiu. A cozinha precisa saber ANTES de começar a montar.
create or replace function notify_order_cancelled_by_customer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Só quando quem cancelou foi o cliente: cancelamento feito pelo próprio
  -- painel não precisa avisar o painel.
  if new.status = 'cancelado' and old.status is distinct from 'cancelado' and not is_staff() then
    insert into notifications (customer_id, audience, title, body, data) values (
      null,
      'equipe',
      'Pedido cancelado · ' || new.code,
      'O cliente cancelou' || coalesce(': ' || new.cancel_reason, '.'),
      jsonb_build_object('order_id', new.id, 'type', 'cancelamento', 'code', new.code)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists orders_notify_cancelled on orders;

create trigger orders_notify_cancelled
  after update of status on orders
  for each row execute function notify_order_cancelled_by_customer();

-- =============================================================================
-- 7. Para ligar o push, rode com os seus valores:
--
--   insert into private.app_config (key, value) values
--     ('push_function_url', 'https://SEU-PROJETO.supabase.co/functions/v1/send-push'),
--     ('push_hook_secret',  'o-mesmo-valor-de-PUSH_HOOK_SECRET')
--   on conflict (key) do update set value = excluded.value, updated_at = now();
--
-- O segredo tem que bater com `supabase secrets set PUSH_HOOK_SECRET=...`.
-- Sem esse par, o trigger simplesmente não dispara e nada quebra.
-- =============================================================================
