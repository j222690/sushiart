import { LogoMark } from './Logo';

/**
 * Abertura do app.
 *
 * O nome é revelado por uma pincelada, como caligrafia sendo escrita: o texto
 * fica atrás de um `clip-path` que abre da esquerda para a direita. Dura 620 ms
 * e acontece uma vez só — passar disso e quem só quer pedir sushi começa a
 * xingar a animação. Vale porque é o primeiro contato com a marca.
 *
 * Quem pediu menos movimento no sistema recebe a tela pronta: a regra global
 * de `prefers-reduced-motion` no index.css zera a duração, e como a animação
 * usa `both`, o estado final (revelado) é o que fica.
 */
export default function SplashScreen({ message = 'Amor em forma de sushi' }) {
  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 bg-ink bg-ember-glow">
      {/* Ondas seigaiha bem apagadas no fundo, para a tela não ser um vazio. */}
      <div
        aria-hidden="true"
        className="seigaiha pointer-events-none absolute inset-0 text-aizome opacity-[0.07]"
      />

      <LogoMark size={112} className="relative animate-pulse-glow rounded-full" />

      <div className="relative text-center">
        <p className="animate-pincelada font-script text-4xl text-cream">Sushi Art</p>
        <p
          className="animate-pincelada mt-1 font-sans text-[10px] uppercase tracking-[0.35em] text-cream-muted"
          style={{ animationDelay: '180ms' }}
        >
          Empório do Sushi
        </p>
      </div>

      <p
        className="animate-pincelada relative font-brand text-sm italic text-vinho-200"
        style={{ animationDelay: '340ms' }}
      >
        {message}
      </p>
    </div>
  );
}
