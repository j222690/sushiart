import { useMemo, useRef, useState } from 'react';
import { Gift, Lock } from 'lucide-react';
import clsx from 'clsx';
import { Button } from './ui';
import { LogoMark } from './Logo';
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
 * Quebra o rótulo em linhas curtas em vez de cortar com reticências.
 *
 * O gomo é uma fatia estreita: "Não foi dessa vez" numa linha só não cabe no
 * comprimento do raio. Em duas linhas cabe inteiro, e o cliente lê o prêmio —
 * que é o ponto da roleta.
 */
function quebrar(texto, maxPorLinha = 11) {
  const palavras = texto.split(' ');
  const linhas = [];
  let atual = '';

  for (const palavra of palavras) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (tentativa.length <= maxPorLinha || !atual) {
      atual = tentativa;
    } else {
      linhas.push(atual);
      atual = palavra;
    }
  }
  if (atual) linhas.push(atual);
  return linhas.slice(0, 2);
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

  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  const radius = cx - 14;
  const sliceAngle = prizes.length ? 360 / prizes.length : 0;

  const slices = useMemo(
    () =>
      prizes.map((prize, index) => {
        const start = index * sliceAngle;
        const meio = start + sliceAngle / 2;

        // O texto é desenhado no eixo horizontal e o grupo inteiro gira até o
        // meio do gomo — assim ele lê do centro para fora, como roleta de
        // feira, em vez de deitado atravessado na fatia.
        //
        // Na metade esquerda (meio > 180) essa mesma rotação deixaria a
        // palavra de cabeça para baixo. Ali o texto é espelhado para o outro
        // lado do centro e girado meia volta: cai no mesmo gomo, de pé.
        const espelhado = meio > 180;

        return {
          prize,
          path: slicePath(cx, cy, radius, start, start + sliceAngle),
          giro: espelhado ? meio + 90 : meio - 90,
          textoX: espelhado ? cx - radius * 0.6 : cx + radius * 0.6,
          linhas: quebrar(prize.label),
          minimo: prize.min_order_cents > 0 ? formatBRL(prize.min_order_cents) : null,
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
        <div className="absolute left-1/2 top-[-4px] z-20 -translate-x-1/2 drop-shadow-md">
          <svg width="28" height="32" viewBox="0 0 28 32" aria-hidden="true">
            <path d="M14 32 L2 5 A 14 14 0 0 1 26 5 Z" fill="#8B2635" />
            <circle cx="14" cy="10" r="4.5" fill="#F6F3EF" />
          </svg>
        </div>

        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label="Roleta de prêmios do Sushi Art"
          className="drop-shadow-[0_6px_20px_rgba(139,38,53,0.20)]"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: busy ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.72, 0.12, 1)` : 'none',
          }}
        >
          {/* Aro externo, no bege do app em vez do bronze do tema escuro antigo */}
          <circle cx={cx} cy={cy} r={radius + 9} fill="#FFFFFF" />
          <circle cx={cx} cy={cy} r={radius + 9} fill="none" stroke="#E4DDD3" strokeWidth="1.5" />

          {slices.map(({ prize, path, giro, textoX, linhas, minimo }) => (
            <g key={prize.id}>
              <path d={path} fill={prize.color || '#8B2635'} stroke="#FFFFFF" strokeWidth="2.5" />

              <g transform={`rotate(${giro} ${cx} ${cy})`}>
                <text
                  x={textoX}
                  y={cy}
                  fill="#F6F3EF"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="12.5"
                  fontWeight="800"
                >
                  {linhas.map((linha, i) => (
                    <tspan
                      key={linha}
                      x={textoX}
                      dy={i === 0 ? (linhas.length > 1 ? -7 : 0) : 14}
                    >
                      {linha}
                    </tspan>
                  ))}
                </text>

                {/* O requisito vive junto do prêmio: ninguém gira imaginando que
                    "10% OFF" vale para qualquer pedido. */}
                {minimo && (
                  <text
                    x={textoX}
                    y={cy + (linhas.length > 1 ? 22 : 15)}
                    fill="#F6F3EF"
                    fillOpacity="0.78"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="9"
                    fontWeight="600"
                  >
                    a partir de {minimo}
                  </text>
                )}
              </g>
            </g>
          ))}

          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#FFFFFF" strokeWidth="3" />
        </svg>

        {/* Miolo com a marca */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <div className="grid h-[68px] w-[68px] place-items-center rounded-full border-4 border-white bg-white shadow-card">
            <LogoMark size={52} />
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
