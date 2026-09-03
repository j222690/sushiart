-- =============================================================================
-- Purchase pelo servidor, quando o pagamento é confirmado
--
-- Segue o mesmo desenho do disparo de push (0007): configuração em
-- `private.app_config`, chamada assíncrona com `pg_net`, e falha que nunca
-- interrompe o pedido.
--
-- POR QUE SAI DAQUI, e não do navegador
--
-- O Pixel do navegador some com frequência: bloqueador de anúncio, aba fechada
-- antes de carregar, iPhone com rastreamento limitado. A venda aconteceu e a
-- Meta não ficou sabendo — e campanha otimiza pelo que enxerga.
--
-- O banco sabe da venda de qualquer jeito, porque é ele que muda o status
-- quando o webhook do gateway confirma. Este é o único ponto do sistema que
-- não depende de nada do lado do cliente.
-- =============================================================================

create or replace function dispatch_capi_purchase()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_url    text;
  v_secret text;
begin
  -- Só na TRANSIÇÃO para pago. Sem esta conferência, cada mudança seguinte
  -- (em preparo, saiu para entrega, entregue) mandaria um Purchase novo, e o
  -- mesmo pedido viraria cinco vendas na conta de anúncios.
  --
  -- A deduplicação por `event_id` na Meta ainda pegaria os repetidos, mas
  -- depender dela para o caso comum é usar a rede de proteção como piso.
  if new.status not in ('pago', 'confirmado_entrega') then
    return new;
  end if;
  -- Mesma armadilha do enum: `coalesce(old.status, '')` tenta converter a
  -- string vazia para `order_status` e estoura, derrubando o update do pedido.
  if old.status is not null and old.status in ('pago', 'confirmado_entrega') then
    return new;
  end if;

  select value into v_url    from private.app_config where key = 'capi_function_url';
  select value into v_secret from private.app_config where key = 'push_hook_secret';

  -- Conversions API não configurada: segue o baile. O restaurante que não usa
  -- Meta Ads não pode ter pedido travado por causa disso.
  if v_url is null or v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-push-secret', v_secret
               ),
    body    := jsonb_build_object('order_id', new.id),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists orders_dispatch_capi on orders;

create trigger orders_dispatch_capi
  after update of status on orders
  for each row execute function dispatch_capi_purchase();
