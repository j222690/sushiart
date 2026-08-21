import clsx from 'clsx';

/**
 * Marca do Sushi Art: disco vinho, assinatura caligráfica e os hashi cruzados.
 * Vem do mesmo desenho de /public/logo.svg, aqui como componente para poder
 * herdar tamanho e responder a hover/animação.
 */
export function LogoMark({ size = 40, className }) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      role="img"
      aria-label="Sushi Art"
      className={clsx('shrink-0', className)}
    >
      <defs>
        <linearGradient id="sa-vinho" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8B2635" />
          <stop offset="100%" stopColor="#611A1B" />
        </linearGradient>
      </defs>
      <circle cx="256" cy="256" r="256" fill="url(#sa-vinho)" />
      <circle cx="256" cy="256" r="238" fill="none" stroke="#F5F1EA" strokeOpacity="0.35" strokeWidth="3" />
      <g stroke="#F5F1EA" strokeLinecap="round" opacity="0.9">
        <line x1="150" y1="392" x2="366" y2="150" strokeWidth="10" />
        <line x1="188" y1="404" x2="392" y2="176" strokeWidth="10" />
      </g>
      <text
        x="256"
        y="286"
        textAnchor="middle"
        fill="#F5F1EA"
        fontFamily="Great Vibes, cursive"
        fontSize="150"
      >
        Sushi Art
      </text>
    </svg>
  );
}

/** Marca completa: símbolo + nome + tagline. */
export function Logo({ size = 'md', showTagline = true, className }) {
  const mark = size === 'lg' ? 64 : size === 'sm' ? 28 : 40;

  return (
    <div className={clsx('flex items-center gap-3', className)}>
      <LogoMark size={mark} />
      <div className="min-w-0 leading-tight">
        <p
          className={clsx(
            'font-script text-cream',
            size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-lg' : 'text-xl'
          )}
        >
          Sushi Art
        </p>
        {showTagline && (
          <p
            className={clsx(
              'font-sans uppercase tracking-[0.2em] text-cream-muted',
              size === 'lg' ? 'text-[11px]' : 'text-[9px]'
            )}
          >
            Empório do Sushi
          </p>
        )}
      </div>
    </div>
  );
}
