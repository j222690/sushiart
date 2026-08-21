import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, Banknote, QrCode, CreditCard, MessageCircle, Store } from 'lucide-react';
import OrderStatusTracker from '../../components/OrderStatusTracker';
import { Badge, Button, Card, Spinner } from '../../components/ui';
import { orders as ordersApi } from '../../lib/api';
import { useRealtimeOrders } from '../../hooks/useRealtimeOrders';
import { useStore } from '../../context/StoreContext';
import { useToast } from '../../context/ToastContext';
import { formatBRL, formatDateTime } from '../../lib/format';
import { paymentLabel } from '../../lib/constants';

const METHOD_ICONS = {
  pix: QrCode,
  cartao_credito: CreditCard,
  cartao_debito: CreditCard,
  na_entrega: Banknote,
};

export default function OrderDetail() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { restaurant } = useStore();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    ordersApi
      .get(orderId)
      .then(setOrder)
      .catch((e) => setError(e.message));
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  // Recarrega inteiro (e não só o registro) para trazer o histórico atualizado.
  const onChange = useCallback(() => load(), [load]);
  useRealtimeOrders({ orderId, onChange });

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-cream-muted">{error}</p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate('/pedidos')}>
          Voltar
        </Button>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner />
      </div>
    );
  }

  const address = order.address_snapshot;
  const MethodIcon = METHOD_ICONS[order.payment_method] ?? CreditCard;
  const canCancel = ['aguardando_pagamento', 'confirmado_entrega', 'pago'].includes(order.status);

  const whatsappLink = restaurant?.whatsapp
    ? `https://wa.me/${String(restaurant.whatsapp).replace(/\D/g, '')}?text=${encodeURIComponent(
        `Olá! Falando sobre o pedido ${order.code}.`
      )}`
    : null;

  async function handleCancel() {
    if (!window.confirm('Deseja mesmo cancelar este pedido?')) return;
    try {
      await ordersApi.cancel(order.id, 'Cancelado pelo cliente');
      toast.info('Pedido cancelado.');
      load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  return (
    <div className="px-4 pb-8 pt-4">
      <button
        type="button"
        onClick={() => navigate('/pedidos')}
        className="mb-4 flex items-center gap-1.5 text-sm text-cream-muted hover:text-cream"
      >
        <ArrowLeft size={16} /> Pedidos
      </button>

      <header className="mb-5">
        <h1 className="font-brand text-2xl text-cream">Pedido {order.code}</h1>
        <p className="text-xs text-cream-faint">{formatDateTime(order.created_at)}</p>
      </header>

      {/* Acompanhamento */}
      <Card className="mb-5 p-4">
        <OrderStatusTracker order={order} history={order.order_status_history ?? []} />
      </Card>

      {order.status === 'aguardando_pagamento' && (
        <Button size="lg" className="mb-5 w-full" onClick={() => navigate(`/pagamento/${order.id}`)}>
          Finalizar pagamento
        </Button>
      )}

      {/* Itens */}
      <Card className="mb-4 p-4">
        <h2 className="mb-3 font-brand text-base text-cream">Itens</h2>
        <ul className="space-y-3">
          {order.order_items.map((item) => (
            <li key={item.id} className="flex gap-3 text-sm">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-ink-300 text-xs font-bold text-cream-muted">
                {item.quantity}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-cream">{item.product_name}</p>
                {(item.addons ?? []).length > 0 && (
                  <p className="mt-0.5 text-[11px] text-cream-muted">
                    {item.addons.map((a) => a.name).join(', ')}
                  </p>
                )}
                {item.notes && (
                  <p className="mt-0.5 text-[11px] italic text-cream-muted">“{item.notes}”</p>
                )}
              </div>
              <span className="shrink-0 font-medium text-cream">{formatBRL(item.total_cents)}</span>
            </li>
          ))}
        </ul>

        {order.gift_description && (
          <p className="mt-3 rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs text-ember">
            🎁 Brinde: {order.gift_description}
          </p>
        )}

        <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-cream-muted">Subtotal</dt>
            <dd className="text-cream">{formatBRL(order.subtotal_cents)}</dd>
          </div>
          {order.delivery_fee_cents > 0 && (
            <div className="flex justify-between">
              <dt className="text-cream-muted">Entrega</dt>
              <dd className="text-cream">{formatBRL(order.delivery_fee_cents)}</dd>
            </div>
          )}
          {order.discount_cents > 0 && (
            <div className="flex justify-between">
              <dt className="text-cream-muted">
                Desconto{order.coupon_code ? ` (${order.coupon_code})` : ''}
              </dt>
              <dd className="text-success">− {formatBRL(order.discount_cents)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
            <dt className="text-cream">Total</dt>
            <dd className="text-cream">{formatBRL(order.total_cents)}</dd>
          </div>
        </dl>
      </Card>

      {/* Pagamento */}
      <Card className="mb-4 flex items-center gap-3 p-4">
        <MethodIcon size={19} className="text-cream-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-cream">{paymentLabel(order)}</p>
          {order.change_for_cents ? (
            <p className="text-xs text-cream-muted">
              Troco para {formatBRL(order.change_for_cents)} · levar{' '}
              {formatBRL(order.change_for_cents - order.total_cents)}
            </p>
          ) : null}
        </div>
        <Badge tone={order.payment_status === 'pago' ? 'success' : 'neutral'}>
          {order.payment_status === 'pago'
            ? 'Pago'
            : order.payment_status === 'nao_aplicavel'
              ? 'Na entrega'
              : 'Pendente'}
        </Badge>
      </Card>

      {/* Entrega / retirada */}
      <Card className="mb-4 flex items-start gap-3 p-4">
        {order.fulfillment === 'entrega' ? (
          <>
            <MapPin size={18} className="mt-0.5 shrink-0 text-cream-muted" />
            <div className="min-w-0 text-sm">
              <p className="text-cream">
                {address?.street}, {address?.number}
                {address?.complement ? ` — ${address.complement}` : ''}
              </p>
              <p className="text-xs text-cream-muted">
                {address?.neighborhood} · {address?.city}
              </p>
              {address?.reference && (
                <p className="mt-0.5 text-[11px] text-cream-faint">Ref: {address.reference}</p>
              )}
            </div>
          </>
        ) : (
          <>
            <Store size={18} className="mt-0.5 shrink-0 text-cream-muted" />
            <div className="text-sm">
              <p className="text-cream">Retirada no balcão</p>
              <p className="text-xs text-cream-muted">
                {restaurant?.address_street}, {restaurant?.address_number}
              </p>
            </div>
          </>
        )}
      </Card>

      {order.notes && (
        <Card className="mb-4 p-4 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-cream-faint">Observações</p>
          <p className="mt-1 text-cream-muted">{order.notes}</p>
        </Card>
      )}

      {order.points_earned > 0 && (
        <p className="mb-4 rounded-xl border border-ember/25 bg-ember/5 px-3.5 py-2.5 text-xs text-ember">
          ✨ Você ganhou {order.points_earned} pontos com este pedido.
        </p>
      )}

      <div className="space-y-2">
        {whatsappLink && (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => window.open(whatsappLink, '_blank', 'noopener,noreferrer')}
          >
            <MessageCircle size={16} /> Falar com o restaurante
          </Button>
        )}

        {canCancel && (
          <Button variant="ghost" className="w-full text-danger" onClick={handleCancel}>
            Cancelar pedido
          </Button>
        )}
      </div>
    </div>
  );
}
