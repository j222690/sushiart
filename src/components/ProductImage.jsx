import { useState } from 'react';
import clsx from 'clsx';
import { LogoMark } from './Logo';

/**
 * Toda foto de produto passa por aqui.
 *
 * Sem foto (ou com foto quebrada), o fallback mantém o clima da marca: fundo
 * escuro com um brilho quente ao centro, como um prato preto sob luz ambiente —
 * em vez do quadrado cinza claro genérico de app de fast-food.
 */
export default function ProductImage({ src, alt, className, rounded = 'rounded-xl', eager = false }) {
  const [failed, setFailed] = useState(false);
  const showFallback = !src || failed;

  return (
    <div className={clsx('relative overflow-hidden bg-ink-800', rounded, className)}>
      {showFallback ? (
        <div className="absolute inset-0 grid place-items-center bg-ember-glow">
          <LogoMark size={44} className="opacity-25" />
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
      {/* Vinheta inferior: dá contraste para textos sobrepostos */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-ink-fade opacity-70" />
    </div>
  );
}
