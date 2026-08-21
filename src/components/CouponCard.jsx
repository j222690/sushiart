import { Ticket, Check, Clock } from 'lucide-react';
import clsx from 'clsx';
import { formatBRL, formatDateTime } from '../lib/format';

function describe(coupon) {
  switch (coupon.discount_kind) {
    case 'percentual':
      return `${Number(coupon.discount_percent)}% OFF`;
    case 'fixo':
      return `${formatBRL(coupon.discount_cents)} OFF`;
    case 'frete_gratis':
      return 'Frete grátis';
    case 'brinde':
      return 'Brinde';
    default:
      return 'Desconto';
  }
}

/**
 * Cupom "clicável": o cliente aplica sem digitar código.
 * O visual imita um bilhete, com o recorte entre o valor e as regras.
 */
export default function CouponCard({ coupon, onApply, applied, disabled }) {
  const expiring =
    coupon.valid_until && new Date(coupon.valid_until) - Date.now() < 48 * 3600 * 1000;

  return (
    <div
      className={clsx(
        'relative flex overflow-hidden rounded-card border shadow-card transition-colors',
        applied ? 'border-success/60 bg-success/5' : 'border-line bg-ink-500'
      )}
    >
      {/* Talão do bilhete */}
      <div className="flex w-24 shrink-0 flex-col items-center justify-center bg-vinho-gradient px-2 py-4 text-center">
        <Ticket size={18} className="mb-1 text-cream/80" />
        <p className="text-sm font-extrabold leading-tight text-cream">{describe(coupon)}</p>
      </div>

      {/* Recorte */}
      <div className="relative w-0">
        <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full bg-ink" />
        <span className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full bg-ink" />
        <span className="absolute inset-y-2 left-0 border-l border-dashed border-line" />
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3 p-3.5">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-bold tracking-wider text-cream">{coupon.code}</p>
          {coupon.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-cream-muted">{coupon.description}</p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-cream-faint">
            {coupon.min_order_cents > 0 && <span>Mín. {formatBRL(coupon.min_order_cents)}</span>}
            {coupon.valid_until && (
              <span className={clsx('inline-flex items-center gap-1', expiring && 'text-ember')}>
                <Clock size={11} />
                até {formatDateTime(coupon.valid_until)}
              </span>
            )}
          </div>
        </div>

        {onApply && (
          <button
            type="button"
            onClick={() => onApply(coupon)}
            disabled={disabled || applied}
            className={clsx(
              'shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
              applied
                ? 'bg-success/20 text-success'
                : 'bg-vinho-500 text-cream hover:bg-vinho-600 disabled:opacity-50'
            )}
          >
            {applied ? (
              <span className="inline-flex items-center gap-1">
                <Check size={13} /> Aplicado
              </span>
            ) : (
              'Usar'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
