import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReceiptText, ChevronRight, Banknote, RotateCcw } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Skeleton } from '../../components/ui';
import { orders as ordersApi } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../store/cart';
import { useToast } from '../../context/ToastContext';
import { useRealtimeOrders } from '../../hooks/useRealtimeOrders';
import { ORDER_STATUS, ACTIVE_STATUSES, ON_DELIVERY_KINDS } from '../../lib/constants';
import { formatBRL, formatDateTime } from '../../lib/format';

export default function Orders() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const addItem = useCart((s) => s.addItem);
  const [rows, setRows] = useState(null);

  const load = useCallback(() => {
    if (!user) return;
    ordersApi
      .list(user.id)
      .then(setRows)
      .catch(() => setRows([]));
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Um pedido que muda de status no admin reflete aqui na hora.
  const onChange = useCallback((row) => {
    setRows((current) =>
      current ? current.map((o) => (o.id === row.id ? { ...o, ...row } : o)) : current
    );
  }, []);

  useRealtimeOrders({ customerId: user?.id, onChange, enabled: Boolean(user) });

  /** "Pedir de novo": repõe os itens do pedido antigo no carrinho. */
  function reorder(order) {
    let added = 0;
    order.order_items.forEach((item) => {
      addItem({
        product: {
          id: item.product_id,
          name: item.product_name,
          image_url: item.product_image,
          price_cents: item.unit_price_cents,
          effective_price_cents: item.unit_price_cents,
        },
        quantity: item.quantity,
        addons: item.addons ?? [],
        notes: item.notes ?? '',
      });
      added += 1;
    });

    if (added === 0) {
      toast.error('Este pedido não tem itens para repetir.');
      return;
    }
    // Os preços daqui são só de exibição: o servidor recobra pelo cardápio atual.
    toast.success('Itens no carrinho. Os preços são revalidados no checkout.');
    navigate('/carrinho');
  }

  if (!user) {
    return (
      <EmptyState
        icon={ReceiptText}
        title="Entre para ver seus pedidos"
        description="Seu histórico e o acompanhamento em tempo real ficam aqui."
        action={
          <Button className="mt-2" onClick={() => navigate('/entrar?next=/pedidos')}>
            Entrar
          </Button>
        }
      />
    );
  }

  if (rows === null) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ReceiptText}
        title="Você ainda não fez pedidos"
        description="Quando fizer, o acompanhamento aparece aqui em tempo real."
        action={
          <Button className="mt-2" onClick={() => navigate('/cardapio')}>
            Ver cardápio
          </Button>
        }
      />
    );
  }

  const active = rows.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const past = rows.filter((o) => !ACTIVE_STATUSES.includes(o.status));

  const renderCard = (order) => {
    const meta = ORDER_STATUS[order.status];
    const itemCount = order.order_items?.reduce((s, i) => s + i.quantity, 0) ?? 0;

    return (
      <Card key={order.id} className="p-4">
        <button
          type="button"
          onClick={() => navigate(`/pedidos/${order.id}`)}
          className="flex w-full items-start gap-3 text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={meta.tone}>{meta.customerLabel}</Badge>
              {order.payment_method === 'na_entrega' && (
                <Badge tone="cash">
                  <Banknote size={11} />
                  {ON_DELIVERY_KINDS[order.on_delivery_kind]?.label ?? 'Na entrega'}
                </Badge>
              )}
            </div>

            <p className="mt-2 text-sm font-semibold text-cream">
              {order.code} · {formatBRL(order.total_cents)}
            </p>
            <p className="text-xs text-cream-muted">
              {itemCount} {itemCount === 1 ? 'item' : 'itens'} ·{' '}
              {order.fulfillment === 'entrega' ? 'Entrega' : 'Retirada'}
            </p>
            <p className="mt-0.5 text-[11px] text-cream-faint">{formatDateTime(order.created_at)}</p>
          </div>

          <ChevronRight size={18} className="mt-1 shrink-0 text-cream-faint" />
        </button>

        {['entregue', 'cancelado'].includes(order.status) && (
          <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => reorder(order)}>
            <RotateCcw size={14} /> Pedir de novo
          </Button>
        )}

        {order.status === 'aguardando_pagamento' && (
          <Button size="sm" className="mt-3 w-full" onClick={() => navigate(`/pagamento/${order.id}`)}>
            Finalizar pagamento
          </Button>
        )}
      </Card>
    );
  };

  return (
    <div className="px-4 pb-6 pt-4">
      <h1 className="mb-4 font-brand text-2xl text-cream">Seus pedidos</h1>

      {active.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-cream-faint">
            Em andamento
          </h2>
          <div className="space-y-3">{active.map(renderCard)}</div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-cream-faint">
            Anteriores
          </h2>
          <div className="space-y-3">{past.map(renderCard)}</div>
        </section>
      )}
    </div>
  );
}
