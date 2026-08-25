import { useState } from 'react';
import clsx from 'clsx';
import { LogoMark } from './Logo';

/**
 * Toda foto de produto passa por aqui.
 *
 * Sem foto (ou com foto quebrada), o fallback mostra a marca sobre um bege
 * quente, no lugar do quadrado cinza genérico de app de fast-food. O logo vem
 * com opacidade alta o suficiente para se ler, mas baixa o suficiente para não
 * competir com o nome do prato ao lado.
 */
export default function ProductImage({
  src,
  alt,
  className,
  rounded = 'rounded-xl',
  eager = false,
  fit = 'cover',
}) {
  const [failed, setFailed] = useState(false);
  const showFallback = !src || failed;
  const contain = fit === 'contain';

  return (
    <div className={clsx('relative overflow-hidden bg-ink-900', rounded, className)}>
      {showFallback ? (
        <div className="absolute inset-0 grid place-items-center">
          <LogoMark size={44} className="opacity-40" />
        </div>
      ) : contain ? (
        // As fotos do cardápio são 200×200. Numa faixa larga, `cover` estica
        // para a largura do celular e borra. Aqui a foto aparece no tamanho que
        // aguenta, e quem preenche a sobra é uma cópia dela ampliada e
        // desfocada — no borrão a baixa resolução não aparece.
        <>
          <img
            src={src}
            alt=""
            aria-hidden="true"
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            className="absolute inset-0 h-full w-full scale-125 object-cover blur-2xl saturate-150"
          />
          <div className="absolute inset-0 bg-ink-900/40" />
          <img
            src={src}
            alt={alt}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            onError={() => setFailed(true)}
            className="relative mx-auto h-full object-contain"
          />
        </>
      ) : (
        <img
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}
      {/* Vinheta só sob foto real em `cover`: serve para dar contraste a texto
          sobreposto. Sobre o fallback ela sujaria o card, e sobre o fundo
          desfocado do `contain` competiria com a foto. */}
      {!showFallback && !contain && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />
      )}
    </div>
  );
}
