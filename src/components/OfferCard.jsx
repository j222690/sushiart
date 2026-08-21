import clsx from 'clsx';
import ProductImage from './ProductImage';
import Countdown from './Countdown';
import { Badge } from './ui';
import { formatBRL } from '../lib/format';

/**
 * Card de oferta em destaque: preço "de/por", selo e — quando a oferta tem
 * prazo — a contagem regressiva por cima da foto.
 */
export default function OfferCard({ offer, onClick, onExpire, className }) {
  const product = offer.product;
  if (!product) return null;

  const from = product.price_cents;
  const to = offer.offer_price_cents;
  const off = from > to ? Math.round((1 - to / from) * 100) : 0;
  const unavailable = product.sold_out || !product.active;

  return (
    <button
      type="button"
      onClick={() => onClick?.(product)}
      disabled={unavailable}
      className={clsx(
        'group relative w-64 shrink-0 overflow-hidden rounded-card border border-vinho-500/30 bg-ink-500 text-left shadow-card transition',
        unavailable ? 'opacity-50' : 'hover:border-vinho-500',
        className
      )}
    >
      <div className="relative">
        <ProductImage
          src={offer.image_url || product.image_url}
          alt={product.name}
          className="h-36 w-full"
          rounded="rounded-none"
        />

        <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5">
          {offer.badge && <Badge tone="vinho">{offer.badge}</Badge>}
          {off > 0 && <Badge tone="ember">-{off}%</Badge>}
        </div>

        {offer.ends_at && (
          <Countdown endsAt={offer.ends_at} onExpire={onExpire} className="absolute bottom-2.5 right-2.5" />
        )}

        {unavailable && (
          <span className="absolute inset-0 grid place-items-center bg-ink-900/70 text-xs font-bold uppercase tracking-wide text-cream">
            Esgotado
          </span>
        )}
      </div>

      <div className="p-3.5">
        <p className="line-clamp-1 font-sans text-sm font-semibold text-cream">{offer.title}</p>
        <p className="line-clamp-1 text-xs text-cream-muted">{product.name}</p>

        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-xs text-cream-faint line-through">{formatBRL(from)}</span>
          <span className="text-lg font-extrabold text-cream">{formatBRL(to)}</span>
        </div>
      </div>
    </button>
  );
}
