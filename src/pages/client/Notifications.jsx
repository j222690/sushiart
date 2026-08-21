import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, BellOff } from 'lucide-react';
import clsx from 'clsx';
import { Button, Card, EmptyState, Skeleton } from '../../components/ui';
import { notifications as api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { pushSupported, requestPushPermission } from '../../lib/push';
import { timeAgo } from '../../lib/format';

export default function Notifications() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (!user) {
      navigate('/entrar?next=/notificacoes', { replace: true });
      return;
    }
    api
      .list(user.id)
      .then((data) => {
        setRows(data);
        // Marca como lidas ao abrir a tela — o sino do topo zera junto.
        data
          .filter((n) => !n.read_at && n.customer_id === user.id)
          .forEach((n) => api.markRead(n.id));
      })
      .catch(() => setRows([]));
  }, [user, navigate]);

  const canAskPush =
    pushSupported() && 'Notification' in window && Notification.permission === 'default';

  return (
    <div className="px-4 pb-8 pt-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-1.5 text-sm text-cream-muted hover:text-cream"
      >
        <ArrowLeft size={16} /> Voltar
      </button>

      <h1 className="mb-4 font-brand text-2xl text-cream">Notificações</h1>

      {canAskPush && (
        <Card className="mb-4 flex items-center gap-3 border-vinho-500/30 p-4">
          <Bell size={20} className="shrink-0 text-vinho-300" />
          <p className="min-w-0 flex-1 text-xs text-cream-muted">
            Ative os avisos para saber quando o pedido sai para entrega e quando a roleta liberar.
          </p>
          <Button
            size="sm"
            onClick={async () => {
              const result = await requestPushPermission(user.id);
              if (result.ok) toast.success(result.reason || 'Notificações ativadas.');
              else toast.error(result.reason);
            }}
          >
            Ativar
          </Button>
        </Card>
      )}

      {rows === null ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="Nada por aqui"
          description="Avisos sobre pedidos e ofertas aparecem nesta tela."
        />
      ) : (
        <div className="space-y-2.5">
          {rows.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={!item.data?.order_id}
              onClick={() => item.data?.order_id && navigate(`/pedidos/${item.data.order_id}`)}
              className={clsx(
                'flex w-full gap-3 rounded-card border p-3.5 text-left transition-colors',
                item.read_at ? 'border-line bg-ink-500' : 'border-vinho-500/40 bg-vinho-900/20'
              )}
            >
              <span
                className={clsx(
                  'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                  item.read_at ? 'bg-transparent' : 'bg-vinho-400'
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-cream">{item.title}</span>
                <span className="mt-0.5 block text-xs text-cream-muted">{item.body}</span>
                <span className="mt-1 block text-[11px] text-cream-faint">
                  {timeAgo(item.created_at)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
