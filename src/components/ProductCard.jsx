import { memo } from 'react';
import { Flame, Sparkles, Heart, Plus } from 'lucide-react';
import clsx from 'clsx';
import ProductImage from './ProductImage';
import { Badge } from './ui';
import { formatBRL } from '../lib/format';

/**
 * Card do cardápio. Dois formatos:
 *  - list (padrão): foto à direita, como iFood — melhor para varrer o cardápio
 *  - grid: foto grande, para carrosséis de destaque
 *
 * Exportado com `memo` porque o cardápio tem 53 destes na tela. A tela do
 * cardápio troca de estado a cada categoria que passa pela rolagem (para
 * acender a aba certa), e sem o memo cada uma dessas trocas redesenhava os 53
 * cards — medido, dava quadros de mais de um segundo num celular mediano.
 * Para o memo valer, quem usa precisa passar funções estáveis.
 */
function ProductCard({
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

  // Um selo só, na ordem em que fazem o cliente parar de rolar: desconto é o
  // que mais converte, depois a prova social do mais vendido, e a novidade por
  // último. No cardápio real quase todo combo é "mais vendido" — mostrar os três
  // enchia o card de etiqueta e não destacava nada.
  const selo = hasDiscount ? (
    <Badge tone="success">-{off}% hoje</Badge>
  ) : product.is_bestseller ? (
    <Badge tone="vinho">
      <Flame size={11} /> Mais vendido
    </Badge>
  ) : product.is_new ? (
    <Badge tone="ember">
      <Sparkles size={11} /> Novidade
    </Badge>
  ) : null;

  if (variant === 'grid') {
    return (
      <button
        type="button"
        onClick={() => onClick?.(product)}
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
        'group relative flex gap-3.5 rounded-card border border-line bg-ink-500 p-3 shadow-card transition-shadow',
        unavailable ? 'opacity-55' : 'hover:shadow-lg'
      )}
    >
      <button
        type="button"
        onClick={() => onClick?.(product)}
        disabled={unavailable}
        className="flex min-w-0 flex-1 items-stretch gap-3.5 text-left"
      >
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Um selo só. Três empilhados empurravam o nome para baixo e faziam
              todo card competir por atenção — o que equivale a nenhum chamar. */}
          {selo && <div className="mb-1.5">{selo}</div>}

          <h3 className="font-sans text-[15px] font-semibold leading-tight text-cream">
            {product.name}
          </h3>

          {product.description && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-cream-muted">
              {product.description}
            </p>
          )}

          {/* Empurra o preço para a base do card. Com os cards alinhados numa
              coluna, o olho corre os preços em linha reta em vez de caçá-los em
              alturas diferentes conforme o tamanho da descrição. */}
          <div className="mt-auto flex items-baseline gap-2 pt-2">
            <span className="text-[17px] font-extrabold leading-none text-cream">
              {formatBRL(price)}
            </span>
            {hasDiscount && (
              <span className="text-xs text-cream-faint line-through">{formatBRL(compare)}</span>
            )}
            {product.serves && (
              <span className="ml-auto text-[11px] text-cream-faint">{product.serves}</span>
            )}
          </div>
        </div>

        <div className="relative shrink-0 self-center">
          <ProductImage src={product.image_url} alt={product.name} className="h-[104px] w-[104px]" />
          {unavailable ? (
            <span className="absolute inset-0 grid place-items-center rounded-xl bg-black/60 text-[10px] font-bold uppercase tracking-wide text-white">
              Esgotado
            </span>
          ) : (
            <span className="absolute -bottom-1.5 -right-1.5 grid h-8 w-8 place-items-center rounded-full border-2 border-ink-500 bg-vinho-500 text-white shadow-card transition-transform group-hover:scale-105">
              <Plus size={17} strokeWidth={2.5} />
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
          // Sobre o card, não sobre a foto: em cima da foto ele sumia num prato
          // claro e brigava com o botão de adicionar, que fica logo abaixo.
          className="absolute right-2.5 top-2.5 rounded-full p-1 text-cream-faint transition-colors hover:text-vinho-500"
        >
          <Heart
            size={16}
            className={isFavorite ? 'fill-vinho-500 text-vinho-500' : ''}
          />
        </button>
      )}
    </div>
  );
}

export default memo(ProductCard);
