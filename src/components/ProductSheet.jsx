import { useEffect, useMemo, useState } from 'react';
import { Heart } from 'lucide-react';
import clsx from 'clsx';
import ProductImage from './ProductImage';
import { Badge, Button, Sheet, Skeleton, QuantityStepper, Textarea } from './ui';
import { formatBRL } from '../lib/format';
import { menu } from '../lib/api';
import { useCart } from '../store/cart';
import { useToast } from '../context/ToastContext';
import { trackAddToCart, trackViewContent } from '../lib/analytics';

/**
 * Detalhe do produto com adicionais e observação por item.
 * Respeita min_select/max_select de cada grupo: com max_select = 1 o grupo
 * vira escolha única (rádio), acima disso vira múltipla escolha.
 */
export default function ProductSheet({ product, open, onClose, isFavorite, onToggleFavorite }) {
  const [groups, setGroups] = useState(null);
  const [selected, setSelected] = useState({}); // { groupId: Set(addonId) }
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const addItem = useCart((s) => s.addItem);
  const toast = useToast();

  useEffect(() => {
    if (!open || !product) return;
    setQuantity(1);
    setNotes('');
    setSelected({});
    setGroups(null);

    // ViewContent: a ficha aberta é o equivalente a pegar o prato na mão.
    // Fica aqui e não no clique do card porque a ficha também abre por link
    // direto (`?produto=`), e por ali o clique nunca acontece.
    trackViewContent({
      id: product.id,
      nome: product.name,
      precoCentavos: product.effective_price_cents ?? product.price_cents,
      categoria: product.categories?.name,
    });

    let alive = true;
    menu
      .addons(product.id)
      .then((data) => {
        if (!alive) return;
        // Grupos sem nenhum adicional ativo só ocupariam espaço na tela.
        setGroups(
          data
            .map((g) => ({ ...g, product_addons: (g.product_addons ?? []).filter((a) => a.active) }))
            .filter((g) => g.product_addons.length > 0)
        );
      })
      .catch(() => alive && setGroups([]));

    return () => {
      alive = false;
    };
  }, [open, product]);

  const chosenAddons = useMemo(() => {
    if (!groups) return [];
    return groups.flatMap((g) =>
      g.product_addons.filter((a) => selected[g.id]?.has(a.id))
    );
  }, [groups, selected]);

  const basePrice = product ? product.effective_price_cents ?? product.price_cents : 0;
  const addonsTotal = chosenAddons.reduce((sum, a) => sum + a.price_cents, 0);
  const lineTotal = (basePrice + addonsTotal) * quantity;

  const missingRequired = useMemo(() => {
    if (!groups) return null;
    return groups.find((g) => (selected[g.id]?.size ?? 0) < g.min_select) ?? null;
  }, [groups, selected]);

  function toggleAddon(group, addon) {
    setSelected((current) => {
      const set = new Set(current[group.id] ?? []);

      if (set.has(addon.id)) {
        set.delete(addon.id);
      } else if (group.max_select === 1) {
        set.clear();
        set.add(addon.id);
      } else if (set.size < group.max_select) {
        set.add(addon.id);
      } else {
        toast.info(`Escolha até ${group.max_select} opções em "${group.name}".`);
        return current;
      }
      return { ...current, [group.id]: set };
    });
  }

  function handleAdd() {
    if (missingRequired) {
      toast.error(`Escolha ao menos ${missingRequired.min_select} em "${missingRequired.name}".`);
      return;
    }
    addItem({
      product,
      quantity,
      addons: chosenAddons.map((a) => ({ id: a.id, name: a.name, price_cents: a.price_cents })),
      notes,
    });

    // Com o preço do que foi realmente escolhido: base mais adicionais. Mandar
    // só o preço da vitrine subestimaria o carrinho no relatório.
    trackAddToCart(
      {
        id: product.id,
        nome: product.name,
        precoCentavos: basePrice + addonsTotal,
        categoria: product.categories?.name,
      },
      quantity
    );
    toast.success(`${quantity}x ${product.name} no carrinho.`);
    onClose();
  }

  if (!product) return null;

  const compare = product.has_offer ? product.price_cents : product.compare_at_price_cents;
  const hasDiscount = compare && compare > basePrice;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={product.name}
      footer={
        <div className="flex items-center gap-3">
          <QuantityStepper value={quantity} onChange={setQuantity} />
          <Button
            size="lg"
            className="flex-1"
            onClick={handleAdd}
            disabled={product.sold_out}
          >
            {product.sold_out ? 'Esgotado' : `Adicionar · ${formatBRL(lineTotal)}`}
          </Button>
        </div>
      }
    >
      {/* Moldura QUADRADA, igual à foto.
          As fotos do cardápio são 400×400. Antes esta faixa tinha altura fixa
          e largura cheia, então sobrava espaço dos dois lados — preenchido por
          uma cópia borrada da própria foto. Com a moldura no mesmo formato do
          arquivo não sobra espaço nenhum: a foto preenche exata, sem borrão e
          sem cortar nada do prato. */}
      <div className="-mx-5 -mt-4 mb-4">
        <ProductImage
          src={product.image_url}
          alt={product.name}
          className="aspect-square w-full"
          rounded="rounded-none"
          eager
          vinheta={false}
        />
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        {product.is_bestseller && <Badge tone="vinho">Mais vendido</Badge>}
        {product.is_new && <Badge tone="ember">Novidade</Badge>}
        {product.serves && <Badge tone="neutral">{product.serves}</Badge>}
        {onToggleFavorite && (
          <button
            type="button"
            onClick={() => onToggleFavorite(product)}
            aria-pressed={isFavorite}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-cream-muted"
          >
            <Heart size={13} className={isFavorite ? 'fill-vinho-500 text-vinho-500' : ''} />
            {isFavorite ? 'Salvo' : 'Salvar'}
          </button>
        )}
      </div>

      {product.description && (
        <p className="text-sm leading-relaxed text-cream-muted">{product.description}</p>
      )}

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-xl font-bold text-cream">{formatBRL(basePrice)}</span>
        {hasDiscount && (
          <span className="text-sm text-cream-faint line-through">{formatBRL(compare)}</span>
        )}
      </div>

      {/* Adicionais */}
      {groups === null ? (
        <div className="mt-6 space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.id} className="mt-6">
            <header className="mb-2 flex items-center justify-between">
              <h4 className="font-sans text-sm font-semibold text-cream">{group.name}</h4>
              <span className="text-[11px] text-cream-faint">
                {group.min_select > 0 ? 'Obrigatório · ' : ''}
                {group.max_select === 1 ? 'escolha 1' : `até ${group.max_select}`}
              </span>
            </header>

            <div className="space-y-1.5">
              {group.product_addons.map((addon) => {
                const isSelected = selected[group.id]?.has(addon.id) ?? false;
                return (
                  <button
                    key={addon.id}
                    type="button"
                    onClick={() => toggleAddon(group, addon)}
                    aria-pressed={isSelected}
                    className={clsx(
                      'flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors',
                      isSelected
                        ? 'border-vinho-500 bg-vinho-900/40'
                        : 'border-line bg-ink-300 hover:border-cream-faint/30'
                    )}
                  >
                    <span className="text-sm text-cream">{addon.name}</span>
                    <span className="flex items-center gap-2.5">
                      {addon.price_cents > 0 && (
                        <span className="text-xs font-semibold text-cream-muted">
                          + {formatBRL(addon.price_cents)}
                        </span>
                      )}
                      <span
                        className={clsx(
                          'grid h-5 w-5 place-items-center border',
                          group.max_select === 1 ? 'rounded-full' : 'rounded-md',
                          isSelected ? 'border-vinho-400 bg-vinho-500' : 'border-cream-faint/40'
                        )}
                      >
                        {isSelected && <span className="h-2 w-2 rounded-sm bg-cream" />}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}

      <div className="mt-6">
        <Textarea
          label="Alguma observação?"
          placeholder="Ex: sem gengibre, wasabi à parte, cortar ao meio..."
          maxLength={200}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          hint={`${notes.length}/200 · a cozinha lê exatamente o que você escrever aqui`}
        />
      </div>
    </Sheet>
  );
}
