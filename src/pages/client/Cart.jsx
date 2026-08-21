import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Trash2, Pencil, Bike, Store } from 'lucide-react';
import clsx from 'clsx';
import ProductImage from '../../components/ProductImage';
import { Button, Card, EmptyState, QuantityStepper, Sheet, Textarea } from '../../components/ui';
import { useCart } from '../../store/cart';
import { useStore } from '../../context/StoreContext';
import { formatBRL } from '../../lib/format';

export default function Cart() {
  const navigate = useNavigate();
  const { restaurant } = useStore();
  const items = useCart((s) => s.items);
  const fulfillment = useCart((s) => s.fulfillment);
  const setFulfillment = useCart((s) => s.setFulfillment);
  const updateQuantity = useCart((s) => s.updateQuantity);
  const updateNotes = useCart((s) => s.updateNotes);
  const removeItem = useCart((s) => s.removeItem);
  const clear = useCart((s) => s.clear);
  const subtotal = useCart((s) => s.subtotal());

  const [editing, setEditing] = useState(null);
  const [draftNotes, setDraftNotes] = useState('');

  const minOrder = restaurant?.min_order_cents ?? 0;
  const belowMinimum = subtotal < minOrder;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="Seu carrinho está vazio"
        description="Que tal começar por um combo? A casa recomenda."
        action={
          <Button className="mt-2" onClick={() => navigate('/cardapio')}>
            Ver cardápio
          </Button>
        }
      />
    );
  }

  return (
    <div className="px-4 pb-6 pt-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="font-brand text-2xl text-cream">Seu carrinho</h1>
        <button
          type="button"
          onClick={clear}
          className="text-xs font-medium text-cream-faint hover:text-danger"
        >
          Esvaziar
        </button>
      </header>

      {/* Entrega x retirada */}
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-line bg-ink-300 p-1">
        {[
          { key: 'entrega', label: 'Entrega', icon: Bike },
          { key: 'retirada', label: 'Retirar no local', icon: Store },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFulfillment(key)}
            className={clsx(
              'flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition-colors',
              fulfillment === key ? 'bg-vinho-500 text-cream' : 'text-cream-muted hover:text-cream'
            )}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const addonsTotal = item.addons.reduce((s, a) => s + a.price_cents, 0);
          const lineTotal = (item.unit_price_cents + addonsTotal) * item.quantity;

          return (
            <Card key={item.key} className="p-3">
              <div className="flex gap-3">
                <ProductImage src={item.image} alt={item.name} className="h-16 w-16 shrink-0" />

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug text-cream">{item.name}</p>

                  {item.addons.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {item.addons.map((addon) => (
                        <li key={addon.id} className="text-[11px] text-cream-muted">
                          + {addon.name}
                          {addon.price_cents > 0 && ` (${formatBRL(addon.price_cents)})`}
                        </li>
                      ))}
                    </ul>
                  )}

                  {item.notes && (
                    <p className="mt-1 rounded-md bg-ink-300 px-2 py-1 text-[11px] italic text-cream-muted">
                      “{item.notes}”
                    </p>
                  )}

                  <p className="mt-1.5 text-sm font-bold text-cream">{formatBRL(lineTotal)}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                <QuantityStepper
                  size="sm"
                  value={item.quantity}
                  onChange={(q) => updateQuantity(item.key, q)}
                />
                <button
                  type="button"
                  onClick={() => {
                    setEditing(item);
                    setDraftNotes(item.notes || '');
                  }}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-cream-muted hover:bg-ink-300 hover:text-cream"
                >
                  <Pencil size={13} /> Observação
                </button>
                <button
                  type="button"
                  onClick={() => removeItem(item.key)}
                  aria-label={`Remover ${item.name}`}
                  className="ml-auto rounded-lg p-1.5 text-cream-faint hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Resumo */}
      <Card className="mt-5 p-4">
        <div className="flex justify-between text-sm">
          <span className="text-cream-muted">Subtotal</span>
          <span className="font-semibold text-cream">{formatBRL(subtotal)}</span>
        </div>
        <p className="mt-2 text-xs text-cream-faint">
          Taxa de entrega, cupom e desconto entram na próxima etapa.
        </p>
      </Card>

      {belowMinimum && (
        <p className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-xs text-warning">
          Faltam {formatBRL(minOrder - subtotal)} para atingir o pedido mínimo de{' '}
          {formatBRL(minOrder)}.
        </p>
      )}

      <Button
        size="lg"
        className="mt-4 w-full"
        disabled={belowMinimum}
        onClick={() => navigate('/checkout')}
      >
        Continuar
      </Button>

      <Button variant="ghost" className="mt-2 w-full" onClick={() => navigate('/cardapio')}>
        Adicionar mais itens
      </Button>

      {/* Observação por item */}
      <Sheet
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Observação do item"
        footer={
          <Button
            className="w-full"
            onClick={() => {
              updateNotes(editing.key, draftNotes);
              setEditing(null);
            }}
          >
            Salvar
          </Button>
        }
      >
        <p className="mb-3 text-sm text-cream-muted">{editing?.name}</p>
        <Textarea
          value={draftNotes}
          onChange={(e) => setDraftNotes(e.target.value)}
          maxLength={200}
          placeholder="Ex: sem gengibre, sem cebolinha, wasabi à parte"
          hint={`${draftNotes.length}/200`}
        />
      </Sheet>
    </div>
  );
}
