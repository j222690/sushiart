import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import clsx from 'clsx';

function remaining(endsAt) {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return null;

  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * Contagem regressiva das ofertas por tempo limitado.
 * `onExpire` deixa a tela recarregar as ofertas quando o prazo vira, para o
 * cliente não clicar num preço que já não existe mais.
 */
export default function Countdown({ endsAt, onExpire, className, compact = false }) {
  const [left, setLeft] = useState(() => remaining(endsAt));

  useEffect(() => {
    setLeft(remaining(endsAt));
    const timer = setInterval(() => {
      const next = remaining(endsAt);
      setLeft(next);
      if (!next) {
        clearInterval(timer);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [endsAt, onExpire]);

  if (!endsAt || !left) return null;

  const label =
    left.days > 0
      ? `${left.days}d ${pad(left.hours)}h`
      : `${pad(left.hours)}:${pad(left.minutes)}:${pad(left.seconds)}`;

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full bg-ink-800/85 px-2.5 py-1 font-semibold tabular-nums text-cream backdrop-blur',
        compact ? 'text-[11px]' : 'text-xs',
        className
      )}
    >
      <Timer size={compact ? 12 : 14} className="text-ember" />
      {label}
    </span>
  );
}
