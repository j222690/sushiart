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
 *
 * Só existe um modo de encaixe, `cover`, e isso é uma escolha. Havia um segundo
 * modo que mostrava a foto inteira e preenchia a sobra com uma cópia dela
 * borrada. Funcionava, mas as bordas desfocadas eram feias — e o problema real
 * era outro: a moldura tinha um formato e o arquivo tinha outro. Todas as fotos
 * do cardápio são quadradas (400×400), então basta a moldura ser quadrada
 * também e não sobra espaço para preencher. Quem chama é que decide o formato,
 * com `aspect-square` na classe.
 */
export default function ProductImage({
  src,
  alt,
  className,
  rounded = 'rounded-xl',
  eager = false,
  /**
   * Sombra no rodapé da foto. Serve para dar contraste a texto ou selo posto
   * POR CIMA da imagem — é o caso dos cards do cardápio. Onde nada é
   * sobreposto, como na ficha do produto, ela só escurece o prato à toa.
   */
  vinheta = true,
}) {
  const [failed, setFailed] = useState(false);
  const showFallback = !src || failed;

  return (
    <div className={clsx('relative overflow-hidden bg-ink-900', rounded, className)}>
      {showFallback ? (
        <div className="absolute inset-0 grid place-items-center">
          <LogoMark size={44} className="opacity-40" />
        </div>
      ) : (
        <>
          <img
            src={src}
            alt={alt}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
          {vinheta && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />
          )}
        </>
      )}
    </div>
  );
}
