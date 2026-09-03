import clsx from 'clsx';

/**
 * Lanternas chōchin (提灯) nos cantos da tela.
 *
 * Regra que o desenho impõe: duas, só na home, e paradas. Lanterna em toda
 * tela vira cenário de karaokê; balançando, rouba a atenção do botão de
 * comprar — que é o único lugar da home onde o olho precisa parar.
 *
 * Ficam sem eventos de ponteiro, então nunca engolem um toque. E ficam em
 * `z-0`, não em `-z-10`: índice negativo joga o elemento atrás do fundo da
 * própria seção que o contém, e na primeira tentativa as lanternas
 * desapareceram por baixo do `bg-ember-glow` da saudação. Em `z-0` elas ficam
 * acima do fundo do pai e abaixo do texto, que é onde deviam estar.
 */
export default function Lanternas({ className }) {
  return (
    <div
      aria-hidden="true"
      className={clsx('pointer-events-none absolute inset-0 z-0 overflow-hidden', className)}
    >
      <Lanterna className="-left-5 top-2" size={54} />
      <Lanterna className="-right-4 top-6" size={42} />
    </div>
  );
}

function Lanterna({ size, className }) {
  return (
    <div className={clsx('absolute', className)} style={{ width: size }}>
      {/* Cordão que prende a lanterna na barra */}
      <div className="mx-auto h-3 w-px bg-ember/40" />

      <div
        style={{ width: size, height: size * 1.32 }}
        className={clsx(
          'relative rounded-[46%] opacity-[0.22]',
          // As costelas de bambu: faixas de vinho separadas por vinco claro.
          'bg-[repeating-linear-gradient(theme(colors.vinho)_0_6px,rgba(255,255,255,0.45)_6px_7px)]',
          // O brilho quente é o que puxa o âmbar que o app já usa e faz a
          // lanterna parecer acesa em vez de desenhada.
          'shadow-[0_0_30px_8px_rgba(176,106,44,0.35)]'
        )}
      >
        {/* Aros de papel em cima e embaixo */}
        <div className="absolute inset-x-1 top-0 h-1 rounded-full bg-ink-900/50" />
        <div className="absolute inset-x-1 bottom-0 h-1 rounded-full bg-ink-900/50" />
      </div>

      {/* Borla */}
      <div className="mx-auto h-2 w-[3px] bg-ember/50" />
    </div>
  );
}
