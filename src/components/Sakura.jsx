import { useMemo } from 'react';

/**
 * Pétalas de sakura (桜) caindo.
 *
 * É a ideia que todo mundo tem, e é justamente por isso que ela vem desligada.
 * Ligada o ano inteiro, vira enfeite que ninguém enxerga e ainda gasta bateria
 * a cada quadro. Guardada para uma semana de promoção, as pessoas percebem e
 * comentam — que é o efeito que se queria desde o começo.
 *
 * Quem liga e desliga é o painel (`restaurant_settings.sakura_ativa`), não o
 * código: assim o restaurante aproveita a florada, o Ano-Novo ou a semana do
 * aniversário sem depender de deploy.
 */
export default function Sakura({ ativa = false, quantidade = 14 }) {
  // As posições são sorteadas uma vez e congeladas. Sorteando a cada render,
  // toda mudança de estado da home teleportaria as pétalas.
  const petalas = useMemo(
    () =>
      Array.from({ length: quantidade }, (_, i) => ({
        id: i,
        esquerda: Math.random() * 100,
        atraso: Math.random() * 12,
        duracao: 9 + Math.random() * 7,
        tamanho: 6 + Math.random() * 6,
        // Metade fica bem pálida: com todas na mesma opacidade a tela lê como
        // chuva, não como pétala que cai de longe e de perto.
        opacidade: 0.25 + Math.random() * 0.4,
      })),
    [quantidade]
  );

  if (!ativa) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] overflow-hidden motion-reduce:hidden"
    >
      {petalas.map((p) => (
        <span
          key={p.id}
          className="animate-petala absolute top-0 block bg-vinho-100"
          style={{
            left: `${p.esquerda}%`,
            width: p.tamanho,
            height: p.tamanho,
            opacity: p.opacidade,
            animationDelay: `${p.atraso}s`,
            animationDuration: `${p.duracao}s`,
            // Pétala de cerejeira tem uma ponta e três lados moles — o
            // círculo com um canto vivo é o que mais se aproxima com uma
            // propriedade só.
            borderRadius: '50% 0 50% 50%',
          }}
        />
      ))}
    </div>
  );
}
