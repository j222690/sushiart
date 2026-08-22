import { Flame, Sparkles, Heart, Plus } from 'lucide-react';
import clsx from 'clsx';
import ProductImage from './ProductImage';
import { Badge } from './ui';
import { formatBRL } from '../lib/format';

/**
 * Card do cardápio. Dois formatos:
 *  - list (padrão): foto à direita, como iFood — melhor para varrer o cardápio
 *  - grid: foto grande, para carrosséis de destaque
 */
export default function ProductCard({
  product,
  onClick,
  onToggleFavorite,
  isFavorite = false,
  variant = 'list',
}) {
  const price = product.effective_price_cents ?? product.price_cents;
  const compare =
    product.has_offer ? product.price_cents : product.compare_at_price_cents;
  const hasDiscount = compare && compare > price;
  const off = hasDiscount ? Math.round((1 - price / compare) * 100) : 0;
  const unavailable = product.sold_out || !product.active;

  const flags = (
    <>
      {product.is_bestseller && (
        <Badge tone="vinho">
          <Flame size={11} /> Mais vendido
        </Badge>
      )}
      {product.is_new && (
        <Badge tone="ember">
          <Sparkles size={11} /> Novidade
        </Badge>
      )}
      {hasDiscount && <Badge tone="success">-{off}%</Badge>}
    </>
  );

  if (variant === 'grid') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={unavailable}
        className={clsx(
          'group w-44 shrink-0 overflow-hidden rounded-card border border-line bg-ink-500 text-left shadow-card transition',
          unavailable ? 'opacity-50' : 'hover:border-vinho-500/50'
        )}
      >
        <div className="relative">
          <ProductImage src={product.image_url} alt={product.name} className="h-32 w-full" rounded="rounded-none" />
          <div className="absolute left-2 top-2 flex flex-wrap gap-1">{flags}</div>
          {unavailable && (
            <span className="absolute inset-0 grid place-items-center bg-ink-900/70 text-xs font-semibold uppercase tracking-wide text-cream">
              Esgotado
            </span>
          )}
        </div>
        <div className="p-3">
          <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-cream">
            {product.name}
          </p>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-sm font-bold text-cream">{formatBRL(price)}</span>
            {hasDiscount && (
              <span className="text-[11px] text-cream-faint line-through">{formatBRL(compare)}</span>
            )}
          </div>
        </div>
      </button>
    );
  }

  return (
    <div
      className={clsx(
        'relative flex gap-3 rounded-card border border-line bg-ink-500 p-3 shadow-card transition',
        unavailable ? 'opacity-55' : 'hover:border-vinho-500/40'
      )}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={unavailable}
        className="flex min-w-0 flex-1 gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap gap-1">{flags}</div>
          <h3 className="font-sans text-sm font-semibold leading-snug text-cream">{product.name}</h3>
          {product.description && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-cream-muted">
              {product.description}
            </p>
          )}
          {product.serves && (
            <p className="mt-1 text-[11px] text-cream-faint">{product.serves}</p>
          )}

          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-base font-bold text-cream">{formatBRL(price)}</span>
            {hasDiscount && (
              <span className="text-xs text-cream-faint line-through">{formatBRL(compare)}</span>
            )}
          </div>
        </div>

        <div className="relative">
          <ProductImage src={product.image_url} alt={product.name} className="h-24 w-24" />
          {unavailable ? (
            <span className="absolute inset-0 grid place-items-center rounded-xl bg-ink-900/75 text-[10px] font-bold uppercase tracking-wide text-cream">
              Esgotado
            </span>
          ) : (
            <span className="absolute -bottom-1.5 -right-1.5 grid h-7 w-7 place-items-center rounded-full bg-vinho-500 text-white shadow-card">
              <Plus size={16} />
            </span>
          )}
        </div>
      </button>

      {onToggleFavorite && (
        <button
          type="button"
          onClick={() => onToggleFavorite(product)}
          aria-label={isFavorite ? 'Remover dos favoritos' : 'Salvar nos favoritos'}
          aria-pressed={isFavorite}
          className="absolute right-2 top-2 rounded-full bg-ink-800/70 p-1.5 backdrop-blur"
        >
          <Heart
            size={15}
            className={isFavorite ? 'fill-vinho-500 text-vinho-500' : 'text-cream-muted'}
          />
        </button>
      )}
    </div>
  );
}
