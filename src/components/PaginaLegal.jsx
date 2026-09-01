import clsx from 'clsx';

/**
 * Casca das páginas de privacidade e termos.
 *
 * Vive fora do layout do app, sem barra inferior nem carrinho: o Google abre
 * esses endereços durante a análise do OAuth, e quem chega por ali não está
 * comprando — está lendo. Uma barra de navegação de loja no meio de um texto
 * legal só atrapalha.
 */
export default function PaginaLegal({
  titulo,
  icone: Icone,
  atualizadoEm,
  voltar,
  voltarIcone: VoltarIcone,
  children,
}) {
  return (
    <div className="min-h-screen bg-ink">
      <header className="border-b border-line bg-ink-600">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          {voltar && (
            <button
              type="button"
              onClick={voltar}
              aria-label="Voltar"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-cream-muted transition-colors hover:bg-ink-300 hover:text-cream"
            >
              {VoltarIcone && <VoltarIcone size={18} />}
            </button>
          )}
          <div className="min-w-0">
            <p className="font-script text-xl leading-none text-vinho-200">Sushi Art</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-cream-faint">
              Empório do Sushi
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-16 pt-8">
        <div className="mb-8 flex items-start gap-3">
          {Icone && (
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-vinho-800 text-vinho-500">
              <Icone size={22} />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="font-brand text-2xl leading-tight text-cream">{titulo}</h1>
            {atualizadoEm && (
              <p className="mt-0.5 text-xs text-cream-faint">Atualizada em {atualizadoEm}</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-7">{children}</div>
      </main>
    </div>
  );
}

/**
 * Uma seção do documento. O texto corrido fica limitado em largura de leitura —
 * linha longa demais faz o olho perder o começo da próxima.
 */
export function Secao({ titulo, children, className }) {
  return (
    <section className={clsx('flex flex-col gap-2', className)}>
      <h2 className="font-sans text-base font-bold text-cream">{titulo}</h2>
      <div className="max-w-[62ch] space-y-2.5 text-sm leading-relaxed text-cream-muted [&_li]:ml-4 [&_li]:list-disc [&_strong]:text-cream [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}
