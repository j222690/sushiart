import clsx from 'clsx';

/**
 * Noren (のれん) — a cortina dividida que fica na porta do restaurante.
 *
 * No Japão ela não é enfeite: cortina pendurada quer dizer que a casa está
 * aberta, e recolher a cortina é como se avisa que fechou. Aqui ela lê o mesmo
 * `isOpen` que já governa o botão de pedir, então o app diz "fechado" duas
 * vezes na mesma tela — uma em texto, outra em imagem — sem que ninguém
 * precise manter as duas em dia.
 *
 * A largura é 100% e a altura é curta de propósito: é uma bandeira no topo da
 * tela, não uma cortina de teatro. Ocupar mais que isso empurra o cardápio
 * para baixo da dobra, e o cliente veio comprar, não olhar cortina.
 */
export default function Noren({ isOpen = true, className }) {
  // Recolhida: some. Guardar um talo de cortina para dizer "fechado" seria
  // dizer com desenho o que a faixa vermelha logo abaixo já diz com palavra.
  if (!isOpen) return null;

  return (
    <div
      aria-hidden="true"
      className={clsx('pointer-events-none relative h-9 w-full select-none overflow-hidden', className)}
    >
      <div className="animate-noren-cai flex h-full w-full origin-top gap-[3px]">
        {PANOS.map((pano, i) => (
          <div
            key={i}
            className={clsx(
              'relative flex-1 origin-top rounded-b-[3px] bg-aizome-600',
              'motion-safe:animate-noren-balanca'
            )}
            style={{
              // Os panos não têm a mesma altura nem balançam junto: cortina de
              // pano real pende torto. Igualzinhos, o olho lê como gráfico.
              height: pano.altura,
              animationDelay: `${pano.atraso}s`,
            }}
          >
            {/* Ondas seigaiha na barra de cima, como o tecido estampado. */}
            <div className="seigaiha absolute inset-x-0 top-0 h-4 text-aizome-300 opacity-40" />

            {/* O caractere do meio: 寿 (vida longa, sorte) — o que costuma
                aparecer em noren de restaurante. Só no pano central, porque
                nos laterais ele cortaria na dobra. */}
            {pano.marca && (
              <span className="absolute inset-0 flex items-start justify-center pt-1 font-brand text-[13px] leading-none text-ink-100/80">
                寿
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Varão de madeira: a barra por onde a cortina passa. Sem ele os panos
          parecem flutuar. */}
      <div className="absolute inset-x-0 top-0 h-[3px] bg-ember/70" />
    </div>
  );
}

const PANOS = [
  { altura: '86%', atraso: 0, marca: false },
  { altura: '100%', atraso: 0.5, marca: true },
  { altura: '90%', atraso: 1.1, marca: false },
  { altura: '100%', atraso: 0.3, marca: false },
  { altura: '84%', atraso: 0.8, marca: false },
];
