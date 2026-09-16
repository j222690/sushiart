-- =============================================================================
-- Não avisar antes do dinheiro entrar
--
-- O gatilho de criação disparava em TODO pedido inserido, sem olhar se ele já
-- estava pago. Pedido de Pix ou cartão nasce em `aguardando_pagamento` — o
-- cliente ainda vai para a tela do gateway e pode nunca concluir. Mesmo assim
-- saíam os dois avisos na hora:
--
--   Para o cliente: "Pedido confirmado 🍣 — já vamos preparar!"
--                   Mentira. Nada foi confirmado, ele nem pagou ainda. E se
--                   desistir no checkout, fica com um aviso no celular
--                   dizendo que a comida está sendo feita.
--
--   Para a equipe:  "Pedido novo · SA-000123"
--                   Pior: a cozinha começa a montar um pedido que pode não
--                   ter pagamento nenhum atrás. É prejuízo direto, e é o
--                   caminho óbvio para alguém aplicar golpe de graça.
--
-- E havia o outro lado do mesmo erro: desde a 0019 o aviso de pagamento
-- confirmado ia só para o CLIENTE. A equipe era avisada cedo (na criação) e
-- nunca mais — ou seja, no momento em que o dinheiro realmente entrava,
-- ninguém na cozinha era chamado.
--
-- A regra passa a ser uma só, e é a mesma que o painel já usa no sino:
-- anuncia quando o pedido deixa de estar `aguardando_pagamento`.
--
--   Pago na entrega  → nasce em `confirmado_entrega`, avisa na criação.
--   Pix / cartão     → nasce em `aguardando_pagamento`, não avisa nada;
--                      avisa quando o webhook confirmar.
--
-- Pedido que nunca é pago não avisa ninguém, nunca. É o comportamento certo.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Criação: só avisa o que já vale para a cozinha
-- ---------------------------------------------------------------------------
create or replace function notify_order_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- A porta que faltava. Pedido esperando pagamento não é pedido ainda: não
  -- entra na cozinha e não vira aviso no celular de ninguém.
  if new.status = 'aguardando_pagamento' then
    return new;
  end if;

  -- Equipe: COM o código. É o que a cozinha usa para achar o pedido.
  --
  -- O valor sai por `replace`, e não pelos marcadores `G`/`D` do to_char:
  -- aqueles seguem o locale do banco, que aqui resolve para o formato
  -- americano — a comanda da cozinha dizia "R$ 88.00".
  insert into notifications (customer_id, audience, title, body, data) values (
    null,
    'equipe',
    'Pedido novo · ' || new.code,
    case when new.fulfillment = 'retirada' then 'Retirada' else 'Entrega' end
      || ' · R$ ' || replace(to_char(new.total_cents / 100.0, 'FM999999990.00'), '.', ',')
      || ' · ' || case
                    when new.payment_method = 'na_entrega' then 'paga na entrega'
                    when new.payment_method = 'pix' then 'Pix'
                    when new.payment_method = 'cartao_credito' then 'crédito'
                    when new.payment_method = 'cartao_debito' then 'débito'
                    else new.payment_method::text
                  end,
    jsonb_build_object('order_id', new.id, 'type', 'pedido_novo', 'code', new.code)
  );

  -- Cliente: SEM o código. Ver o cabeçalho da 0019.
  insert into notifications (customer_id, audience, title, body, data) values (
    new.customer_id,
    'cliente',
    'Pedido confirmado 🍣',
    'Seu pedido caiu aqui e já vamos preparar!',
    jsonb_build_object('order_id', new.id, 'type', 'pedido_criado')
  );

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Pagamento confirmado: agora sim, os dois lados
--
-- Este é o momento em que um pedido de Pix/cartão passa a existir de verdade.
-- O cliente precisa saber que deu certo, e a cozinha precisa ser chamada —
-- porque na criação, de propósito, ela não foi.
-- ---------------------------------------------------------------------------
create or replace function notify_order_paid()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.payment_status is not distinct from old.payment_status then
    return new;
  end if;
  if new.payment_status <> 'pago' then
    return new;
  end if;

  -- Cliente: sem o código, como todos os outros avisos dele.
  insert into notifications (customer_id, audience, title, body, data) values (
    new.customer_id,
    'cliente',
    'Pagamento confirmado 🎉',
    'Tudo certo com o pagamento. Já vamos preparar!',
    jsonb_build_object('order_id', new.id, 'type', 'pagamento')
  );

  -- Equipe: com o código, e dizendo que já está pago. É o chamado da cozinha
  -- para este pedido — o único que ela vai receber.
  insert into notifications (customer_id, audience, title, body, data) values (
    null,
    'equipe',
    'Pedido novo · ' || new.code,
    case when new.fulfillment = 'retirada' then 'Retirada' else 'Entrega' end
      || ' · R$ ' || replace(to_char(new.total_cents / 100.0, 'FM999999990.00'), '.', ',')
      || ' · PAGO via ' || coalesce(new.payment_provider, 'online'),
    jsonb_build_object('order_id', new.id, 'type', 'pedido_novo', 'code', new.code)
  );

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. O aviso de pagamento duplicado (e o código que sobreviveu)
--
-- `mark_order_paid` inseria a própria notificação de pagamento, e o gatilho
-- `orders_notify_paid` insere outra ao ver `payment_status` virar 'pago'. O
-- cliente recebia DUAS vezes "Pagamento confirmado 🎉" — provado num pedido
-- real: as duas linhas gravadas no mesmo milissegundo, uma com
-- `type: 'pagamento'` (gatilho) e outra com `type: 'payment'` (esta função).
--
-- E o texto daqui ainda dizia "Recebemos o pagamento do pedido SA-000043".
-- A 0019 tirou o código dos avisos do cliente, mas passou por este: ele não
-- está em nenhuma das funções que aquela migração redefiniu.
--
-- Quem avisa passa a ser só o gatilho. Ele é o lugar certo porque pega
-- QUALQUER caminho que confirme o pagamento — o webhook do gateway e também a
-- confirmação manual pelo painel, que altera a tabela direto e nunca passou
-- por aqui.
-- ---------------------------------------------------------------------------
create or replace function mark_order_paid(
  p_order_id uuid,
  p_provider text,
  p_reference text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql security definer set search_path = public as $$
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

  -- Sem `insert into notifications` aqui. Ver o cabeçalho: o UPDATE acima
  -- dispara `orders_notify_paid`, que avisa o cliente e a equipe.

  return jsonb_build_object('order_id', v_order.id, 'status', v_order.status, 'already_paid', false);
end;
$$;
