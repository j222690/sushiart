import { useEffect, useId } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Assina mudanças na tabela `orders`.
 *
 * O filtro `customer_id=eq.X` é aplicado no servidor do Realtime; sem ele o
 * app do cliente receberia eventos de pedidos de outras pessoas (e a RLS
 * apenas esconderia o conteúdo, não o evento).
 *
 * @param {object}   options
 * @param {string}   [options.customerId] assina só os pedidos deste cliente
 * @param {string}   [options.orderId]    assina um pedido específico
 * @param {Function} options.onChange     recebe (novoRegistro, evento)
 * @param {boolean}  [options.enabled]
 */
export function useRealtimeOrders({ customerId, orderId, onChange, enabled = true }) {
  // Nome de canal único por assinante.
  //
  // Sem isso, dois componentes que assinam a mesma coisa (o layout do painel e
  // a tela de Pedidos, ambos sem filtro) pediam o canal `orders:todos` — e o
  // Supabase entrega o evento a UM só. O segundo ficava mudo, sem erro nenhum
  // no console: foi assim que o sino de pedido novo parou de tocar quando
  // passou a viver no layout.
  const instancia = useId();

  useEffect(() => {
    if (!enabled) return undefined;

    let filter;
    if (orderId) filter = `id=eq.${orderId}`;
    else if (customerId) filter = `customer_id=eq.${customerId}`;

    const channel = supabase
      .channel(`orders:${orderId ?? customerId ?? 'todos'}:${instancia}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', ...(filter ? { filter } : {}) },
        (payload) => onChange(payload.new ?? payload.old, payload.eventType)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // `onChange` deve vir memoizado (useCallback) para não reassinar a cada render.
  }, [customerId, orderId, enabled, onChange, instancia]);
}
