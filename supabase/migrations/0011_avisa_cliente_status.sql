-- Avisa o CLIENTE a cada passo do pedido dele.
--
-- Até aqui o cliente recebia um aviso só, "Pedido confirmado", na hora de
-- fechar. Depois disso ficava no escuro até a comida chegar — e é justamente
-- nesse intervalo que ele liga para o restaurante perguntando se está vindo.
-- Os três gatilhos que já existiam avisam a EQUIPE (pedido novo, pago,
-- cancelado pelo cliente); nenhum acompanha o cliente.
--
-- O texto muda conforme entrega ou retirada, porque "saiu para entrega" não
-- quer dizer nada para quem vai buscar no balcão.

create or replace function notify_customer_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_titulo text;
  v_corpo  text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  case new.status
    when 'em_preparo' then
      v_titulo := 'Seu pedido está no fogo 🔥';
      v_corpo  := 'Começamos a preparar o ' || new.code || '. Já já sai!';

    when 'saiu_para_entrega' then
      v_titulo := 'Saiu para entrega 🛵';
      v_corpo  := 'O pedido ' || new.code || ' está a caminho. Fique de olho na campainha!';

    when 'pronto_para_retirada' then
      v_titulo := 'Pronto para retirar 🍣';
      v_corpo  := 'O pedido ' || new.code || ' está pronto e esperando por você no balcão.';

    when 'entregue' then
      -- Quem recebeu já sabe que recebeu. O aviso aqui serve para fechar o
      -- ciclo e dar o gancho da próxima visita, não para informar.
      v_titulo := 'Bom apetite! 🥢';
      v_corpo  := case
                    when new.fulfillment = 'retirada'
                      then 'Pedido ' || new.code || ' retirado. Obrigado pela preferência!'
                    else 'Pedido ' || new.code || ' entregue. Obrigado pela preferência!'
                  end;

    when 'cancelado' then
      -- Só quando quem cancelou foi o restaurante. Se foi o próprio cliente,
      -- ele acabou de fazer isso na tela e não precisa ser avisado do que fez.
      if not is_staff() then
        return new;
      end if;
      v_titulo := 'Pedido cancelado';
      v_corpo  := 'O pedido ' || new.code || ' foi cancelado'
                  || coalesce(': ' || new.cancel_reason, '.')
                  || ' Qualquer dúvida, fale com a gente.';

    else
      -- `aguardando_pagamento`, `pago` e `confirmado_entrega` não geram aviso
      -- aqui: o cliente acabou de sair do checkout e já recebeu a confirmação.
      return new;
  end case;

  insert into notifications (customer_id, audience, title, body, data) values (
    new.customer_id,
    'cliente',
    v_titulo,
    v_corpo,
    jsonb_build_object(
      'order_id', new.id,
      'type', 'status_pedido',
      'status', new.status,
      'code', new.code
    )
  );

  return new;
end;
$$;

drop trigger if exists orders_notify_customer_status on orders;

create trigger orders_notify_customer_status
  after update of status on orders
  for each row execute function notify_customer_status();
