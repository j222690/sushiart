import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { orders as ordersApi } from '../lib/api';
import { useCart } from '../store/cart';
import { useToast } from '../context/ToastContext';
import { formatBRL } from '../lib/format';

/**
 * "Pedir de novo" — o último pedido, em um toque.
 *
 * Não é promoção, é tirar atrito, e costuma aumentar mais a frequência que
 * qualquer desconto: quem já sabe o que quer não deveria precisar caçar seis
 * itens pelo cardápio de novo.
 *
 * Os itens são reencontrados no cardápio de HOJE pelo id, e não copiados do
 * pedido antigo. O pedido guarda um retrato do preço e do nome de quando foi
 * feito — é o que garante que a nota fiscal antiga não mude. Repor esse
 * retrato no carrinho seria deixar a pessoa comprar pelo preço de três meses
 * atrás, ou pedir um prato que saiu do cardápio.
 */
export default function PedirDeNovo({ userId, produtos = [] }) {
  const navigate = useNavigate();
  const toast = useToast();
  const addItem = useCart((s) => s.addItem);
  const [ultimo, setUltimo] = useState(null);

  useEffect(() => {
    if (!userId) {
      setUltimo(null);
      return;
    }
    ordersApi
      .list(userId)
      .then((lista) => {
        // O último que realmente chegou. Pedido cancelado ou parado no
        // pagamento não é "o que você pediu da última vez".
        setUltimo(lista.find((o) => o.status === 'entregue') ?? null);
      })
      .catch(() => setUltimo(null));
  }, [userId]);

  if (!ultimo?.order_items?.length || produtos.length === 0) return null;

  // Só os itens que ainda existem no cardápio e não estão esgotados.
  const disponiveis = ultimo.order_items
    .map((item) => ({ item, produto: produtos.find((p) => p.id === item.product_id) }))
    .filter(({ produto }) => produto && !produto.sold_out);

  if (disponiveis.length === 0) return null;

  const resumo = disponiveis.map(({ item }) => `${item.quantity}× ${item.product_name}`).join(', ');
  const totalHoje = disponiveis.reduce(
    (soma, { item, produto }) =>
      soma + (produto.effective_price_cents ?? produto.price_cents) * item.quantity,
    0
  );

  // Item que saiu do cardápio ou esgotou não some calado: quem pediu seis
  // coisas e recebeu cinco precisa saber disso antes de fechar.
  const faltando = ultimo.order_items.length - disponiveis.length;

  function repetir() {
    for (const { item, produto } of disponiveis) {
      addItem({
        product: produto,
        quantity: item.quantity,
        addons: item.addons ?? [],
        notes: item.notes || '',
      });
    }

    toast.success(
      faltando > 0
        ? `${disponiveis.length} ${disponiveis.length === 1 ? 'item foi' : 'itens foram'} para o carrinho. ${faltando} não ${faltando === 1 ? 'está disponível' : 'estão disponíveis'} hoje.`
        : 'Itens no carrinho. Confira antes de fechar.'
    );
    navigate('/carrinho');
  }

  return (
    <section className="mt-7 px-4">
      <button
        type="button"
        onClick={repetir}
        className="flex w-full items-center gap-3 rounded-card border border-line bg-ink-500 p-4 text-left shadow-card transition-transform active:scale-[0.99]"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-vinho-50 text-vinho">
          <RotateCcw size={19} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block font-brand text-base text-cream">Pedir de novo</span>
          <span className="block truncate text-xs text-cream-muted">{resumo}</span>
        </span>

        <span className="shrink-0 text-sm font-bold tabular-nums text-cream">
          {formatBRL(totalHoje)}
        </span>
      </button>
    </section>
  );
}
