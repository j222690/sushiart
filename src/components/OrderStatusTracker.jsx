import { Check, Clock, ChefHat, Bike, ShoppingBag, Banknote, X } from 'lucide-react';
import clsx from 'clsx';
import { ORDER_STATUS, timelineFor } from '../lib/constants';
import { formatTime } from '../lib/format';

const ICONS = {
  clock: Clock,
  check: Check,
  chef: ChefHat,
  bike: Bike,
  bag: ShoppingBag,
  banknote: Banknote,
  x: X,
};

/**
 * Trilha do pedido para o cliente. Atualiza sozinha via realtime — a página
 * que usa este componente reassina `orders` e passa o pedido novo.
 */
export default function OrderStatusTracker({ order, history = [] }) {
  if (order.status === 'cancelado') {
    return (
      <div className="flex items-center gap-3 rounded-card border border-danger/40 bg-danger/10 p-4">
        <X size={20} className="text-danger" />
        <div>
          <p className="text-sm font-semibold text-cream">Pedido cancelado</p>
          {order.cancel_reason && (
            <p className="text-xs text-cream-muted">{order.cancel_reason}</p>
          )}
        </div>
      </div>
    );
  }

  const steps = timelineFor(order);
  const currentIndex = steps.indexOf(order.status);
  const timeOf = (status) => history.find((h) => h.status === status)?.created_at;

  return (
    <ol className="relative space-y-0">
      {steps.map((status, index) => {
        const meta = ORDER_STATUS[status];
        const Icon = ICONS[meta.icon] ?? Clock;
        const done = currentIndex >= index;
        const active = currentIndex === index;
        const isLast = index === steps.length - 1;
        const at = timeOf(status);

        return (
          <li key={status} className="relative flex gap-3.5 pb-6 last:pb-0">
            {/* Linha vertical entre os passos */}
            {!isLast && (
              <span
                aria-hidden="true"
                className={clsx(
                  'absolute left-[15px] top-8 h-full w-0.5',
                  done ? 'bg-vinho-500' : 'bg-ink-100'
                )}
              />
            )}

            <span
              className={clsx(
                'relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 transition-colors',
                done
                  ? 'border-vinho-500 bg-vinho-500 text-white'
                  : 'border-ink-50 bg-ink-400 text-cream-faint',
                active && 'animate-pulse-glow'
              )}
            >
              <Icon size={15} />
            </span>

            <div className="min-w-0 pt-1">
              <p
                className={clsx(
                  'text-sm font-medium leading-tight',
                  done ? 'text-cream' : 'text-cream-faint'
                )}
              >
                {meta.customerLabel}
              </p>
              {at && <p className="mt-0.5 text-[11px] text-cream-faint">{formatTime(at)}</p>}
              {active && status === 'aguardando_pagamento' && (
                <p className="mt-1 text-xs text-warning">
                  Finalize o pagamento para a cozinha começar.
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
