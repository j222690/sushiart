-- =============================================================================
-- Tira o código do pedido dos avisos do cliente, e mata um aviso duplicado
--
-- Ninguém fala "seu pedido SA-000018". Quem está esperando comida tem UM
-- pedido em aberto e não precisa que ele seja identificado por número. O
-- código continua na tela do pedido, onde serve para consulta, e nos avisos da
-- EQUIPE — na cozinha ele é justamente como se identifica qual pedido é.
--
-- Fica também no aviso de cancelamento: é o único em que o cliente liga para
-- entender, e citar o pedido evita interrogatório no atendimento.
--
-- Esta migração redefine funções que nasceram em 0003, 0007 e 0014. Não
-- reaplica aqueles arquivos inteiros de propósito: 0003 contém `create_order`,
-- que foi redefinida depois (0008, 0009 e o desconto por forma de pagamento).
-- Rodar o arquivo antigo inteiro apagaria essas mudanças em silêncio.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Pedido criado
-- ---------------------------------------------------------------------------
create or replace function notify_order_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Equipe: COM o código. É o que a cozinha usa para achar o pedido.
  insert into notifications (customer_id, audience, title, body, data) values (
    null,
    'equipe',
    'Pedido novo · ' || new.code,
    case when new.fulfillment = 'retirada' then 'Retirada' else 'Entrega' end
      || ' · R$ ' || to_char(new.total_cents / 100.0, 'FM999G990D00')
      || ' · ' || case
                    when new.payment_method = 'na_entrega' then 'paga na entrega'
                    when new.payment_method = 'pix' then 'Pix'
                    when new.payment_method = 'cartao_credito' then 'crédito'
                    when new.payment_method = 'cartao_debito' then 'débito'
                    else new.payment_method::text
                  end,
    jsonb_build_object('order_id', new.id, 'type', 'pedido_novo', 'code', new.code)
  );

  -- Cliente: SEM o código.
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
-- 2. Pagamento confirmado
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

  insert into notifications (customer_id, audience, title, body, data) values (
    new.customer_id,
    'cliente',
    'Pagamento confirmado 🎉',
    'Tudo certo com o pagamento. Já vamos preparar!',
    jsonb_build_object('order_id', new.id, 'type', 'pagamento')
  );

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. O aviso duplicado
--
-- `admin_set_order_status` inseria a própria notificação de status, e desde a
-- 0011 existe um GATILHO que faz a mesma coisa — melhor, porque distingue
-- entrega de retirada. Resultado: cada avanço pelo painel mandava DOIS avisos
-- para o cliente, um deles dizendo só "Pedido SA-000018".
--
-- Aqui a função para de notificar e passa a só mudar o status. Quem avisa é o
-- gatilho, num lugar só.
-- ---------------------------------------------------------------------------
create or replace function admin_set_order_status(
  p_order_id uuid,
  p_status   order_status,
  p_note     text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order orders;
begin
  if not is_staff() then
    raise exception 'Apenas a equipe pode mudar o status.' using errcode = '42501';
  end if;

  update orders set
    status        = p_status,
    delivered_at  = case when p_status = 'entregue' then now() else delivered_at end,
    cancel_reason = case when p_status = 'cancelado' then coalesce(p_note, cancel_reason) else cancel_reason end
  where id = p_order_id
  returning * into v_order;

  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;

  -- Sem `insert into notifications` aqui. Ver o cabeçalho.
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Extrato de pontos e cashback
--
-- Estes textos aparecem no extrato do cliente, não só no aviso. "Pontos do
-- pedido SA-000018" numa lista de lançamentos é o mesmo problema: a pessoa vê
-- a data e o valor, e o código não a ajuda a lembrar do que se trata.
-- ---------------------------------------------------------------------------
create or replace function creditar_cashback(p_order uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  cfg    loyalty_config;
  pedido orders;
  valor  integer;
begin
  select * into cfg from loyalty_config where id = 1;
  if not found or cfg.cashback_percent <= 0 then return; end if;

  select * into pedido from orders where id = p_order;
  if not found or pedido.customer_id is null then return; end if;

  -- Sobre o subtotal, não sobre o total: devolver percentual da taxa de
  -- entrega é o restaurante pagando cashback do dinheiro do entregador.
  valor := floor(pedido.subtotal_cents * cfg.cashback_percent / 100.0)::integer;
  if valor <= 0 then return; end if;

  insert into customer_credits (customer_id, cents, reason, order_id, expires_at)
  values (
    pedido.customer_id,
    valor,
    -- O extrato guarda o `order_id`, então a tela consegue ligar o lançamento
    -- ao pedido sem precisar do código escrito no texto.
    'Cashback do seu pedido',
    pedido.id,
    case when cfg.cashback_expire_days is not null
      then now() + (cfg.cashback_expire_days || ' days')::interval
    end
  );

  insert into notifications (customer_id, audience, kind, title, body, data)
  values (
    pedido.customer_id,
    'cliente',
    'transacional',
    'Você ganhou crédito',
    'R$ ' || to_char(valor / 100.0, 'FM999990.00') || ' de volta do seu último pedido.',
    jsonb_build_object('link', '/fidelidade', 'order_id', pedido.id)
  );
end;
$$;
