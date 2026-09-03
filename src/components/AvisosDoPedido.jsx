import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Check } from 'lucide-react';
import { Button, Card } from './ui';
import {
  disablePush,
  isPushEnabled,
  pushConfigured,
  pushPrecisaInstalarNoIos,
  pushSupported,
  requestPushPermission,
} from '../lib/push';
import { useToast } from '../context/ToastContext';

/**
 * Ligar e desligar os avisos do pedido, no app do cliente.
 *
 * Existe porque não havia nada disso, e o que fazia as vezes estava errado de
 * duas maneiras:
 *
 *   1. O único controle era o interruptor "Avisos de ofertas", que mexe no
 *      `marketing_opt_in` do banco — e esse campo nasce `true`. Como já vinha
 *      ligado, ninguém encostava nele, e a permissão do navegador (que só era
 *      pedida ao LIGAR o interruptor) nunca chegava a ser pedida.
 *
 *   2. Na tela de Notificações o convite só aparecia com
 *      `Notification.permission === 'default'`. Depois de aceitar uma vez, ele
 *      sumia para sempre — mesmo com a inscrição apagada, o aparelho trocado ou
 *      a permissão revogada. Sem caminho de volta.
 *
 * A regra aqui é outra: o card mostra SEMPRE o estado de verdade, e cada estado
 * diz o que fazer. Permissão do navegador e preferência de marketing são coisas
 * separadas — esta trata só da primeira.
 */
export default function AvisosDoPedido({ userId }) {
  const toast = useToast();
  const [ligado, setLigado] = useState(null); // null = ainda conferindo
  const [ocupado, setOcupado] = useState(false);

  const conferir = useCallback(async () => {
    if (!userId) return;
    setLigado(await isPushEnabled(userId, 'cliente'));
  }, [userId]);

  useEffect(() => {
    conferir();
  }, [conferir]);

  // Navegador sem suporte ou app sem chave VAPID: não há o que oferecer, e um
  // botão que não funciona é pior que botão nenhum.
  if (!pushSupported() || !pushConfigured() || ligado === null) return null;

  // -------------------------------------------------------------------------
  // iPhone fora da tela de início: o Safari aceita a permissão e não entrega
  // nada. Explicar é melhor que deixar a pessoa achar que ligou.
  // -------------------------------------------------------------------------
  if (pushPrecisaInstalarNoIos()) {
    return (
      <Card className="mb-4 flex items-start gap-3 p-4">
        <Bell size={18} className="mt-0.5 shrink-0 text-cream-faint" />
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-cream-muted">
          No iPhone os avisos do pedido só chegam com o app na tela de início. Toque em{' '}
          <span className="text-cream">Compartilhar → Adicionar à Tela de Início</span> e abra
          por lá.
        </p>
      </Card>
    );
  }

  // -------------------------------------------------------------------------
  // Bloqueado no navegador. `requestPermission` não pergunta de novo depois de
  // um "não" — o navegador guarda a resposta. Pedir para clicar num botão que
  // não vai fazer nada seria mentir; o caminho é a configuração do site.
  // -------------------------------------------------------------------------
  if (Notification.permission === 'denied') {
    return (
      <Card className="mb-4 flex items-start gap-3 p-4">
        <BellOff size={18} className="mt-0.5 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-cream">Avisos bloqueados</p>
          <p className="mt-1 text-xs leading-relaxed text-cream-muted">
            Você recusou as notificações neste navegador. Para voltar a receber, toque no
            cadeado ao lado do endereço do site e libere as notificações.
          </p>
        </div>
      </Card>
    );
  }

  async function ligar() {
    setOcupado(true);
    try {
      const resultado = await requestPushPermission(userId, 'cliente');
      if (resultado.ok) {
        setLigado(true);
        toast.success('Pronto! Você será avisado sobre o pedido.');
      } else {
        toast.error(resultado.reason);
      }
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    setOcupado(true);
    try {
      await disablePush('cliente');
      setLigado(false);
      toast.info('Avisos desligados neste aparelho.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setOcupado(false);
    }
  }

  // -------------------------------------------------------------------------
  return (
    <Card className="mb-4 flex items-center gap-3.5 p-4">
      <span
        className={
          ligado
            ? 'grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-success/15 text-success'
            : 'grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-vinho-50 text-vinho'
        }
      >
        {ligado ? <BellRing size={20} /> : <Bell size={20} />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-cream">
          {ligado ? 'Avisos do pedido ligados' : 'Avisos do pedido'}
        </p>
        <p className="text-xs text-cream-muted">
          {ligado
            ? 'Neste aparelho você recebe quando o pedido é aceito e quando sai para entrega.'
            : 'Saiba na hora quando o pedido for aceito e quando sair para entrega.'}
        </p>
      </div>

      {ligado ? (
        <Button size="sm" variant="ghost" loading={ocupado} onClick={desligar}>
          <Check size={14} /> Ligado
        </Button>
      ) : (
        <Button size="sm" loading={ocupado} onClick={ligar}>
          Ativar
        </Button>
      )}
    </Card>
  );
}
