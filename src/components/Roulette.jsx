import { useMemo, useRef, useState } from 'react';
import { Gift, Lock, Percent, Banknote, Bike, PartyPopper, Meh } from 'lucide-react';
import clsx from 'clsx';
import { Button } from './ui';
import { formatBRL } from '../lib/format';

const SPIN_MS = 4600;
const EXTRA_TURNS = 6; // voltas completas antes de frear no gomo sorteado

/** Coordenada de um ângulo (graus, 0 = topo) sobre o círculo. */
function point(cx, cy, radius, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
}

function slicePath(cx, cy, radius, startAngle, endAngle) {
  const [x1, y1] = point(cx, cy, radius, startAngle);
  const [x2, y2] = point(cx, cy, radius, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

/**
 * Desenho e valor curto de cada prêmio.
 *
 * O gomo mostra figura em vez de frase: numa fatia estreita, "Hot roll grátis"
 * só cabia deitado e miúdo. O valor continua escrito porque o desenho sozinho
 * não distingue 5% de 15% — três prêmios são percentuais, e o cliente precisa
 * saber qual caiu.
 */
function figuraDoPremio(prize) {
  switch (prize.prize_kind) {
    case 'percentual':
      return { Icone: Percent, valor: `${Number(prize.discount_percent)}%` };
    case 'fixo':
      // Sem os centavos quando são zero: "R$10,00" deitado no gomo encostava no
      // miolo, e num prêmio de valor redondo os centavos não dizem nada.
      return {
        Icone: Banknote,
        valor:
          prize.discount_cents % 100 === 0
            ? `R$${prize.discount_cents / 100}`
            : formatBRL(prize.discount_cents).replace(/\s/g, ''),
      };
    case 'frete_gratis':
      return { Icone: Bike, valor: 'FRETE' };
    case 'brinde':
      return { Icone: PartyPopper, valor: 'BRINDE' };
    default:
      return { Icone: Meh, valor: null };
  }
}

/**
 * Roleta de prêmios.
 *
 * O sorteio acontece no banco (spin_roulette). Este componente só recebe o
 * índice do gomo vencedor e para a animação nele — o cliente não consegue
 * influenciar o resultado mexendo no front. O cupom também nasce lá: ao cair
 * num prêmio, o banco cria um cupom pessoal com validade curta.
 */
export default function Roulette({ prizes, canSpin, reason, onSpin, spinning: externalSpinning }) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const timerRef = useRef(null);

  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  const aro = cx - 4; // borda externa vermelha
  const radius = aro - 20; // área colorida dos gomos
  const sliceAngle = prizes.length ? 360 / prizes.length : 0;

  const slices = useMemo(
    () =>
      prizes.map((prize, index) => {
        const start = index * sliceAngle;
        const meio = start + sliceAngle / 2;

        // Figura e valor são desenhados no eixo horizontal e o grupo gira até o
        // meio do gomo, para lerem do centro para fora. Na metade esquerda a
        // mesma rotação deixaria tudo de cabeça para baixo, então ali o
        // conteúdo é espelhado para o outro lado do centro e girado meia volta.
        const espelhado = meio > 180;
        const lado = espelhado ? -1 : 1;

        return {
          prize,
          path: slicePath(cx, cy, radius, start, start + sliceAngle),
          ...figuraDoPremio(prize),
          giro: espelhado ? meio + 90 : meio - 90,
          iconeX: cx + lado * radius * 0.72,
          valorX: cx + lado * radius * 0.44,
        };
      }),
    [prizes, sliceAngle, cx, cy, radius]
  );

  // Tachas douradas do aro, como na roleta de parque.
  const tachas = useMemo(
    () => Array.from({ length: 12 }, (_, i) => point(cx, cy, aro - 10, (360 / 12) * i)),
    [cx, cy, aro]
  );

  async function handleSpin() {
    if (spinning || !canSpin) return;
    setSpinning(true);

    try {
      const result = await onSpin();
      const index = Number(result?.index ?? 0);

      const jitter = (Math.random() - 0.5) * sliceAngle * 0.55;
      const target = 360 * EXTRA_TURNS - (index * sliceAngle + sliceAngle / 2) - jitter;

      setRotation((current) => current + (360 - (current % 360)) + target);
      timerRef.current = setTimeout(() => setSpinning(false), SPIN_MS);
    } catch (error) {
      setSpinning(false);
      throw error;
    }
  }

  const busy = spinning || externalSpinning;

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative" style={{ width: size, height: size + 10 }}>
        {/* Ponteiro fixo no topo, fora da parte que gira */}
        <div className="absolute left-1/2 top-[-2px] z-30 -translate-x-1/2 drop-shadow-lg">
          <svg width="30" height="36" viewBox="0 0 30 36" aria-hidden="true">
            <path d="M15 36 L3 8 A 12 12 0 0 1 27 8 Z" fill="#D93A2B" />
            <path d="M15 32 L6 8 A 9.5 9.5 0 0 1 24 8 Z" fill="#F0533F" />
            <circle cx="15" cy="10" r="4" fill="#FFF3D6" />
          </svg>
        </div>

        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label="Roleta de prêmios do Sushi Art"
          className="drop-shadow-[0_8px_22px_rgba(139,38,53,0.28)]"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: busy ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.72, 0.12, 1)` : 'none',
          }}
        >
          <defs>
            <radialGradient id="miolo" cx="35%" cy="30%">
              <stop offset="0%" stopColor="#FBE7A6" />
              <stop offset="55%" stopColor="#E0A93B" />
              <stop offset="100%" stopColor="#A9741C" />
            </radialGradient>
            <linearGradient id="aroVermelho" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E8483A" />
              <stop offset="100%" stopColor="#B92B1E" />
            </linearGradient>
          </defs>

          {/* Aro externo com as tachas */}
          <circle cx={cx} cy={cy} r={aro} fill="url(#aroVermelho)" />
          {tachas.map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="3.2" fill="#F5CE5E" stroke="#B98A18" strokeWidth="0.8" />
          ))}

          {/* Gomos */}
          {slices.map(({ prize, path, Icone, valor, iconeX, valorX, giro }) => (
            <g key={prize.id}>
              <path d={path} fill={prize.color || '#E8455A'} stroke="#FFFFFF" strokeWidth="2" />

              <g transform={`rotate(${giro} ${cx} ${cy})`}>
                {/* O ícone é um <svg> do lucide; a cor vem por prop, porque ele
                    traz o próprio `stroke` e ignora o que eu puser no pai. */}
                <g transform={`translate(${iconeX - 14}, ${cy - 14})`}>
                  <Icone size={28} color="#FFFFFF" strokeWidth={2.4} absoluteStrokeWidth />
                </g>

                {valor && (
                  <text
                    x={valorX}
                    y={cy}
                    fill="#FFFFFF"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={valor.length > 5 ? 11 : 15}
                    fontWeight="900"
                    letterSpacing={valor.length > 5 ? 0.5 : 0}
                  >
                    {valor}
                  </text>
                )}
              </g>
            </g>
          ))}

          {/* Miolo dourado */}
          <circle cx={cx} cy={cy} r="34" fill="#FFFFFF" />
          <circle cx={cx} cy={cy} r="30" fill="url(#miolo)" stroke="#A9741C" strokeWidth="1.5" />
          <circle cx={cx} cy={cy} r="11" fill="#C9911F" opacity="0.55" />
        </svg>
      </div>

      <Button
        size="lg"
        variant={canSpin ? 'primary' : 'secondary'}
        className={clsx('w-full max-w-xs', canSpin && !busy && 'animate-pulse-glow')}
        disabled={!canSpin || busy}
        loading={busy}
        onClick={handleSpin}
      >
        {canSpin ? (
          <>
            <Gift size={18} /> Girar a roleta
          </>
        ) : (
          <>
            <Lock size={16} /> Indisponível agora
          </>
        )}
      </Button>

      {!canSpin && reason && <p className="max-w-xs text-center text-xs text-cream-muted">{reason}</p>}

      {/* Legenda: o gomo mostra a figura, aqui fica o nome por extenso e o
          mínimo de cada prêmio. Ninguém gira imaginando que "10% OFF" vale
          para qualquer pedido e descobre a regra só no carrinho. */}
      <ul className="w-full max-w-xs space-y-1.5">
        {slices
          .filter(({ prize }) => prize.prize_kind)
          .map(({ prize, Icone }) => (
            <li key={prize.id} className="flex items-center gap-2.5 text-xs">
              <span
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md"
                style={{ backgroundColor: prize.color || '#E8455A' }}
              >
                <Icone size={13} className="text-white" />
              </span>
              <span className="font-semibold text-cream">{prize.label}</span>
              {prize.min_order_cents > 0 && (
                <span className="ml-auto text-cream-faint">
                  a partir de {formatBRL(prize.min_order_cents)}
                </span>
              )}
            </li>
          ))}
      </ul>
    </div>
  );
}
