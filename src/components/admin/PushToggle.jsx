import { useCallback, useEffect, useState } from 'react';
import { Bell, BellRing, Send } from 'lucide-react';
import { Switch } from '../ui';
import { notifications as api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  disablePush, isPushEnabled, pushConfigured, pushPrecisaInstalarNoIos,
  pushSupported, requestPushPermission,
} from '../../lib/push';

/**
 * Liga os avisos de pedido novo NESTE aparelho.
 *
 * É por aparelho, não por conta, de propósito: o tablet da cozinha deve tocar,
 * o notebook do escritório não precisa. Quem decide é quem está com o aparelho
 * na mão, e a mesma conta pode estar ligada num e desligada no outro.
 */
export default function PushToggle({ compact = false }) {
  const { user, staff } = useAuth();
  const toast = useToast();

  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);

  const suportado = pushSupported();
  const configurado = pushConfigured();

  const sincronizar = useCallback(async () => {
    if (!user) return;
    setEnabled(await isPushEnabled(user.id, 'equipe'));
    setChecked(true);
  }, [user]);

  useEffect(() => {
    sincronizar();
  }, [sincronizar]);

  // Sem staff não há o que ligar: a RLS recusaria o registro como 'equipe'.
  if (!staff || !suportado || !checked) return null;

  // No iPhone fora da tela de início, ligar não adianta: o Safari aceita a
  // permissão e não entrega nada. Melhor explicar do que deixar a pessoa achar
  // que ligou e depois perder pedido.
  if (pushPrecisaInstalarNoIos()) {
    return (
      <div className={compact ? 'rounded-xl border border-line bg-ink-500 p-3' : ''}>
        <div className="flex items-start gap-2.5">
          <Bell size={16} className="mt-0.5 shrink-0 text-cream-faint" />
          <p className="text-[11px] leading-relaxed text-cream-faint">
            Para receber aviso de pedido novo no iPhone, toque em{' '}
            <span className="text-cream-muted">Compartilhar → Adicionar à Tela de Início</span> e
            abra o painel por lá.
          </p>
        </div>
      </div>
    );
  }

  async function alternar(proximo) {
    setBusy(true);
    try {
      if (proximo) {
        const resultado = await requestPushPermission(user.id, 'equipe');
        if (!resultado.ok) {
          toast.error(resultado.reason);
          return;
        }
        setEnabled(true);
        toast.success(
          configurado
            ? 'Este aparelho vai avisar quando entrar pedido.'
            : 'Permissão concedida, mas falta configurar a chave VAPID no servidor.'
        );
      } else {
        const resultado = await disablePush('equipe');
        if (!resultado.ok) {
          toast.error(resultado.reason);
          return;
        }
        setEnabled(false);
        toast.success('Avisos desligados neste aparelho.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function testar() {
    setBusy(true);
    try {
      const resultado = await api.sendTest('equipe');
      if (resultado?.sent > 0) toast.success('Teste enviado. Deve chegar em instantes.');
      else toast.error('Nenhum aparelho recebeu. Confira a configuração do push.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? 'rounded-xl border border-line bg-ink-500 p-3' : ''}>
      <div className="flex items-start gap-2.5">
        {enabled ? (
          <BellRing size={16} className="mt-0.5 shrink-0 text-vinho-300" />
        ) : (
          <Bell size={16} className="mt-0.5 shrink-0 text-cream-faint" />
        )}
        <div className="min-w-0 flex-1">
          <Switch
            checked={enabled}
            disabled={busy}
            onChange={alternar}
            label="Avisar pedido novo"
            description={enabled ? 'Ligado neste aparelho' : 'Desligado neste aparelho'}
          />
        </div>
      </div>

      {enabled && configurado && (
        <button
          type="button"
          onClick={testar}
          disabled={busy}
          className="mt-2.5 flex items-center gap-1.5 text-[11px] text-cream-faint hover:text-cream disabled:opacity-50"
        >
          <Send size={11} /> Enviar teste
        </button>
      )}
    </div>
  );
}
