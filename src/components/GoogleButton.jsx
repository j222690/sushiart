import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import clsx from 'clsx';

/**
 * Marca do Google, desenhada em vez de baixada.
 *
 * A diretriz do Google exige o logo colorido, nas quatro cores exatas, sem
 * recolorir. Como SVG local ela não depende de rede nem de CDN — o botão de
 * entrar não pode ficar sem logo porque uma imagem externa demorou.
 */
function LogoGoogle({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

/**
 * Botão de entrar com o Google.
 *
 * Diz "Entrar", nunca "Cadastrar": no painel do restaurante quem libera acesso
 * é a tabela `staff`, e prometer cadastro ali seria mentira — a conta nova não
 * ganha nada até alguém da equipe autorizar.
 */
export default function GoogleButton({ onClick, disabled, className }) {
  const [carregando, setCarregando] = useState(false);

  async function handle() {
    setCarregando(true);
    try {
      await onClick();
      // Não desligo o carregando no sucesso: a página inteira sai para o
      // Google, e voltar o botão ao normal só piscaria antes do redirecionamento.
    } catch (e) {
      setCarregando(false);
      throw e;
    }
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={disabled || carregando}
      className={clsx(
        'flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-ink-100',
        'text-sm font-semibold text-cream transition-colors',
        'hover:bg-ink-200 disabled:opacity-60',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vinho-500',
        className
      )}
    >
      {carregando ? <Loader2 size={18} className="animate-spin" /> : <LogoGoogle />}
      Entrar com Google
    </button>
  );
}
