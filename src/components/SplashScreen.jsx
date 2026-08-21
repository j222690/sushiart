import { LogoMark } from './Logo';

/** Abertura do app: disco vinho sobre fundo preto, como o perfil do Instagram. */
export default function SplashScreen({ message = 'Amor em forma de sushi' }) {
  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 bg-ink bg-ember-glow">
      <LogoMark size={112} className="animate-pulse-glow rounded-full" />
      <div className="text-center">
        <p className="font-script text-4xl text-cream">Sushi Art</p>
        <p className="mt-1 font-sans text-[10px] uppercase tracking-[0.35em] text-cream-muted">
          Empório do Sushi
        </p>
      </div>
      <p className="font-brand text-sm italic text-vinho-200">{message}</p>
    </div>
  );
}
