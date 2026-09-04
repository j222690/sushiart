import { useEffect, useId, useRef } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Assina mudanças na tabela `orders`, com rede de segurança.
 *
 * O filtro `customer_id=eq.X` é aplicado no servidor do Realtime; sem ele o
 * app do cliente receberia eventos de pedidos de outras pessoas (e a RLS
 * apenas esconderia o conteúdo, não o evento).
 *
 * POR QUE EXISTE UMA CONSULTA PERIÓDICA AQUI
 *
 * O tempo real da Supabase avalia a RLS com o token que a CONEXÃO apresenta, e
 * essa conexão pode perder a autorização de formas difíceis de perceber:
 * sessão renovada, aba que dormiu, rede que oscilou, socket que reconectou sem
 * refazer o `setAuth`. Quando isso acontece ele não entrega nada — e não
 * reclama.
 *
 * Medi isso em produção: com a página do pedido aberta, o pagamento foi
 * confirmado no banco e a tela ficou parada em "aguardando pagamento". Nenhum
 * erro no console.
 *
 * Corrigir a autorização (ver `autorizarRealtime` no AuthContext) melhorou mas
 * não deixou confiável. E o que está em jogo é o cliente ver o pedido andar e
 * a cozinha ouvir o sino — coisas que não podem depender de um socket estar de
 * bom humor.
 *
 * Então: o tempo real continua sendo o caminho rápido, e uma consulta a cada
 * poucos segundos garante que nada fique parado. É uma consulta pequena, só
 * enquanto a tela está aberta e visível.
 *
 * @param {object}   options
 * @param {string}   [options.customerId] assina só os pedidos deste cliente
 * @param {string}   [options.orderId]    assina um pedido específico
 * @param {Function} options.onChange     recebe (novoRegistro, evento)
 * @param {boolean}  [options.enabled]
 * @param {number}   [options.pollMs]     rede de segurança; 0 desliga
 */
export function useRealtimeOrders({
  customerId,
  orderId,
  onChange,
  enabled = true,
  pollMs = 12000,
}) {
  // Nome de canal único por assinante.
  //
  // Sem isso, dois componentes que assinam a mesma coisa (o layout do painel e
  // a tela de Pedidos, ambos sem filtro) pediam o canal `orders:todos` — e o
  // Supabase entrega o evento a UM só. O segundo ficava mudo, sem erro nenhum
  // no console: foi assim que o sino de pedido novo parou de tocar quando
  // passou a viver no layout.
  const instancia = useId();

  // `onChange` muda de identidade a cada render em alguns usos. Guardar numa
  // ref evita reassinar o canal e reiniciar o relógio a cada digitação.
  const aoMudar = useRef(onChange);
  aoMudar.current = onChange;

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
        (payload) => aoMudar.current(payload.new ?? payload.old, payload.eventType)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [customerId, orderId, enabled, instancia]);

  // -------------------------------------------------------------------------
  // A rede de segurança
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!enabled || !pollMs) return undefined;

    // Aba escondida não precisa de consulta: ninguém está olhando, e o celular
    // no bolso não deveria gastar bateria e dados por isso. Ao voltar para a
    // tela, uma consulta imediata põe tudo em dia.
    function conferir() {
      if (document.visibilityState !== 'visible') return;
      // `null` no lugar do registro: quem chama recarrega da fonte, que é o
      // que já acontece no tempo real. Passar um registro montado aqui daria
      // dois formatos diferentes para o mesmo callback tratar.
      aoMudar.current(null, 'POLL');
    }

    const relogio = setInterval(conferir, pollMs);
    document.addEventListener('visibilitychange', conferir);

    return () => {
      clearInterval(relogio);
      document.removeEventListener('visibilitychange', conferir);
    };
  }, [enabled, pollMs]);
}
