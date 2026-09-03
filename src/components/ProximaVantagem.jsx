import { useEffect, useState } from 'react';
import { Gift, Check } from 'lucide-react';
import { home } from '../lib/api';
import { formatBRL } from '../lib/format';

/**
 * "Faltam R$ 12 para o frete grátis."
 *
 * A barra que mostra o quanto falta para a próxima vantagem. É das mudanças
 * mais simples do app e das que mais mexem no ticket: a pessoa prefere botar
 * mais uma peça do que pagar a entrega.
 *
 * O alvo sai dos CUPONS PÚBLICOS cadastrados, não de um número escrito no
 * código. Assim, quando o restaurante mudar o frete grátis de R$ 90 para
 * R$ 80 no painel, a barra acompanha sozinha — e se um dia não houver
 * nenhum cupom com valor mínimo, ela simplesmente não aparece, em vez de
 * prometer uma vantagem que não existe.
 */
export default function ProximaVantagem({ subtotalCents }) {
  const [cupons, setCupons] = useState([]);

  useEffect(() => {
    home
      .publicCoupons()
      .then((lista) => setCupons(lista.filter((c) => c.min_order_cents > 0)))
      // Silencioso de propósito: isto é um empurrãozinho de venda. Falhar a
      // busca não pode encher a tela de erro em cima de quem só quer fechar
      // o carrinho.
      .catch(() => setCupons([]));
  }, []);

  if (cupons.length === 0) return null;

  // O próximo alvo é o cupom mais barato que ainda não foi alcançado. Os
  // cupons já vêm ordenados por valor mínimo da API.
  const proximo = cupons.find((c) => subtotalCents < c.min_order_cents);

  // Passou de todos: mostra o melhor que ele já garantiu, em vez de sumir.
  // Sumir na hora em que a pessoa conquistou é perder o momento de dizer
  // "deu certo" — que é metade do efeito.
  if (!proximo) {
    const conquistado = cupons[cupons.length - 1];
    return (
      <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-success/30 bg-success/10 px-3.5 py-2.5">
        <Check size={16} className="shrink-0 text-success" />
        <p className="text-xs font-semibold text-success">
          {rotulo(conquistado)} liberado! Use o cupom{' '}
          <span className="font-mono">{conquistado.code}</span> no checkout.
        </p>
      </div>
    );
  }

  const falta = proximo.min_order_cents - subtotalCents;
  const progresso = Math.min(100, (subtotalCents / proximo.min_order_cents) * 100);

  return (
    <div className="mt-3 rounded-xl border border-line bg-ink-300 px-3.5 py-3">
      <div className="flex items-center gap-2">
        <Gift size={15} className="shrink-0 text-vinho" />
        <p className="text-xs text-cream">
          Faltam <span className="font-bold">{formatBRL(falta)}</span> para {rotulo(proximo)}
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuenow={Math.round(progresso)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progresso para ${rotulo(proximo)}`}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-50"
      >
        <div
          className="h-full rounded-full bg-vinho transition-[width] duration-300"
          style={{ width: `${progresso}%` }}
        />
      </div>
    </div>
  );
}

/** Como o prêmio do cupom se chama para o cliente. */
function rotulo(cupom) {
  switch (cupom.discount_kind) {
    case 'frete_gratis':
      return 'o frete grátis';
    case 'percentual':
      return `${Number(cupom.discount_percent)}% de desconto`;
    case 'fixo':
      return `${formatBRL(cupom.discount_cents)} de desconto`;
    case 'brinde':
      return 'um brinde';
    default:
      return 'a próxima vantagem';
  }
}
