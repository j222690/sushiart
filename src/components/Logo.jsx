import clsx from 'clsx';

/**
 * Marca do Sushi Art, recortada em círculo.
 *
 * Usa o PNG de 192 px, não o JPEG original de 150: o emblema aparece em até
 * 64 px, e numa tela 3x isso pede 192. O arquivo é o mesmo que serve de ícone
 * do PWA, então o navegador baixa uma vez só.
 */
export function LogoMark({ size = 40, className }) {
  return (
    <img
      src="/icon-192.png"
      width={size}
      height={size}
      alt="Sushi Art"
      loading="eager"
      decoding="async"
      style={{ width: size, height: size }}
      className={clsx('shrink-0 rounded-full object-cover', className)}
    />
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
