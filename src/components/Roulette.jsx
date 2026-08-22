import { useMemo, useRef, useState } from 'react';
import { Gift, Lock } from 'lucide-react';
import clsx from 'clsx';
import { Button } from './ui';
import { LogoMark } from './Logo';

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
 * Roleta de prêmios.
 *
 * O sorteio acontece no banco (spin_roulette). Este componente só recebe o
 * índice do gomo vencedor e para a animação nele — o cliente não consegue
 * influenciar o resultado mexendo no front.
 */
export default function Roulette({ prizes, canSpin, reason, onSpin, spinning: externalSpinning }) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const timerRef = useRef(null);

  const size = 300;
  const cx = size / 2;
  const cy = size / 2;
  const radius = cx - 6;
  const sliceAngle = prizes.length ? 360 / prizes.length : 0;

  const slices = useMemo(
    () =>
      prizes.map((prize, index) => {
        const start = index * sliceAngle;
        const end = start + sliceAngle;
        const [tx, ty] = point(cx, cy, radius * 0.63, start + sliceAngle / 2);
        return {
          prize,
          path: slicePath(cx, cy, radius, start, end),
          labelX: tx,
          labelY: ty,
          labelAngle: start + sliceAngle / 2,
        };
      }),
    [prizes, sliceAngle, cx, cy, radius]
  );

  async function handleSpin() {
    if (spinning || !canSpin) return;
    setSpinning(true);

    try {
      const result = await onSpin();
      const index = Number(result?.index ?? 0);

      // Para com o gomo sorteado sob o ponteiro (topo), com uma variação
      // dentro do próprio gomo para não parecer sempre igual.
      const jitter = (Math.random() - 0.5) * sliceAngle * 0.55;
      const target = 360 * EXTRA_TURNS - (index * sliceAngle + sliceAngle / 2) - jitter;

      // Soma sobre a rotação atual para a roda nunca "voltar" na tela.
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
      <div className="relative" style={{ width: size, height: size }}>
        {/* Ponteiro */}
        <div className="absolute left-1/2 top-[-6px] z-20 -translate-x-1/2">
          <svg width="26" height="30" viewBox="0 0 26 30" aria-hidden="true">
            <path d="M13 30 L1 4 A 13 13 0 0 1 25 4 Z" fill="#B06A2C" />
            <circle cx="13" cy="9" r="4" fill="#FFFFFF" />
          </svg>
        </div>

        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label="Roleta de prêmios do Sushi Art"
          className="drop-shadow-[0_0_28px_rgba(139,38,53,0.45)]"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: busy ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.72, 0.12, 1)` : 'none',
          }}
        >
          <circle cx={cx} cy={cy} r={radius + 4} fill="#E4DDD3" />

          {slices.map(({ prize, path, labelX, labelY, labelAngle }) => (
            <g key={prize.id}>
              <path d={path} fill={prize.color || '#8B2635'} stroke="#FFFFFF" strokeWidth="2" />
              <text
                x={labelX}
                y={labelY}
                fill="#F5F1EA"
                fontSize="11"
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${labelAngle} ${labelX} ${labelY})`}
              >
                {prize.label.length > 16 ? `${prize.label.slice(0, 15)}…` : prize.label}
              </text>
            </g>
          ))}

          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#B06A2C" strokeWidth="3" opacity="0.5" />
        </svg>

        {/* Miolo com a marca */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <div className="grid h-16 w-16 place-items-center rounded-full border-4 border-ember/40 bg-ink-800">
            <LogoMark size={40} />
          </div>
        </div>
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

      {!canSpin && reason && (
        <p className="max-w-xs text-center text-xs text-cream-muted">{reason}</p>
      )}
    </div>
  );
}
