import Hanko from './Hanko';
import { Card } from './ui';
import { formatBRL } from '../lib/format';

/**
 * Cartela de carimbos: compre N, ganhe 1.
 *
 * Os espaços vazios aparecem como carimbo apagado, não como quadrado em
 * branco — a pessoa vê a cartela inteira e o quanto falta de uma olhada, que
 * é justamente o que faz a mecânica funcionar.
 *
 * Vive ao lado dos pontos, não no lugar deles: ponto premia quem gasta muito,
 * carimbo premia quem volta sempre, e costumam ser clientes diferentes.
 */
export default function CartelaCarimbos({ carimbos, config }) {
  if (!config?.stamp_active) return null;

  const total = config.stamps_needed;
  const faltam = Math.max(0, total - carimbos);

  const premio =
    config.stamp_reward_kind === 'percentual'
      ? `${Number(config.stamp_reward_percent)}% de desconto`
      : `${formatBRL(config.stamp_reward_cents ?? 0)} de desconto`;

  return (
    <Card className="mt-4 p-5">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="font-brand text-lg text-cream">Sua cartela</h2>
        <span className="text-xs tabular-nums text-cream-muted">
          {carimbos} de {total}
        </span>
      </div>

      <p className="mb-4 text-xs text-cream-muted">
        {faltam > 0
          ? `Faltam ${faltam} ${faltam === 1 ? 'pedido' : 'pedidos'} para ganhar ${premio}.`
          : `Cartela completa! Seu cupom de ${premio} está em Ofertas.`}
        {config.stamp_min_cents > 0 && (
          <> Vale para pedidos a partir de {formatBRL(config.stamp_min_cents)}.</>
        )}
      </p>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: total }, (_, i) => (
          <Hanko
            key={i}
            size={38}
            texto="寿"
            apagado={i >= carimbos}
            // Cada carimbo batido fica com uma inclinação um pouco diferente:
            // dez selos no mesmo ângulo lê como grade impressa, não como
            // carimbo que alguém bateu um por vez.
            className={i < carimbos ? INCLINACOES[i % INCLINACOES.length] : undefined}
          />
        ))}
      </div>
    </Card>
  );
}

const INCLINACOES = ['-rotate-[8deg]', 'rotate-[5deg]', '-rotate-[3deg]', 'rotate-[9deg]'];
