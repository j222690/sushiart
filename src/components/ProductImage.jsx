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
export default function ProductImage({ src, alt, className, rounded = 'rounded-xl', eager = false }) {
  const [failed, setFailed] = useState(false);
  const showFallback = !src || failed;

  return (
    <div className={clsx('relative overflow-hidden bg-ink-900', rounded, className)}>
      {showFallback ? (
        <div className="absolute inset-0 grid place-items-center">
          <LogoMark size={44} className="opacity-40" />
        </div>
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
      {/* Vinheta só sob foto real: serve para dar contraste a texto sobreposto.
          Sobre o fundo bege do fallback ela apenas sujaria o card. */}
      {!showFallback && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />
      )}
    </div>
  );
}
