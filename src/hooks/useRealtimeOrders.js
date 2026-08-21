import { useEffect } from 'react';
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
  useEffect(() => {
    if (!enabled) return undefined;

    let filter;
    if (orderId) filter = `id=eq.${orderId}`;
    else if (customerId) filter = `customer_id=eq.${customerId}`;

    const channel = supabase
      .channel(`orders:${orderId ?? customerId ?? 'todos'}`)
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
  }, [customerId, orderId, enabled, onChange]);
}
