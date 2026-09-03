import { useEffect, useState } from 'react';
import { Download, Share, Plus } from 'lucide-react';
import { Button, Card, Sheet } from './ui';

/**
 * Convite para instalar o app na tela de início.
 *
 * Vale para os dois lados: o dono precisa do app instalado para receber os
 * avisos de pedido novo (no iPhone, notificação só chega em app instalado), e
 * o cliente que instala volta muito mais — o ícone na tela de início é a
 * lembrança mais barata que existe.
 *
 * São dois caminhos porque os navegadores não concordam:
 *
 *   Android/Chrome  — o navegador avisa que dá para instalar (`beforeinstallprompt`),
 *                     guardamos o aviso e abrimos a caixa nativa num toque.
 *   iPhone/Safari   — não existe esse evento nem API de instalação. O único
 *                     jeito é a pessoa fazer pelo menu Compartilhar, então
 *                     mostramos o passo a passo com os ícones que ela vai ver.
 *
 * Já instalado, some: oferecer instalar de novo confunde.
 */
export default function InstalarApp() {
  const [prompt, setPrompt] = useState(null);
  const [passoAPasso, setPassoAPasso] = useState(false);
  const [instalado, setInstalado] = useState(estaInstalado);

  useEffect(() => {
    function aoPoderInstalar(evento) {
      // Sem isto o Chrome mostra a barrinha dele, na hora que quiser. Assim o
      // convite aparece onde faz sentido, e não por cima do cardápio.
      evento.preventDefault();
      setPrompt(evento);
    }

    function aoInstalar() {
      setInstalado(true);
      setPrompt(null);
    }

    window.addEventListener('beforeinstallprompt', aoPoderInstalar);
    window.addEventListener('appinstalled', aoInstalar);
    return () => {
      window.removeEventListener('beforeinstallprompt', aoPoderInstalar);
      window.removeEventListener('appinstalled', aoInstalar);
    };
  }, []);

  if (instalado) return null;

  const ios = ehIos();

  // Nem Android com evento, nem iPhone: é desktop ou navegador sem suporte.
  // Não há o que oferecer, então não aparece nada.
  if (!prompt && !ios) return null;

  async function instalar() {
    if (ios) return setPassoAPasso(true);

    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    // O evento é de uso único: usado, o navegador não deixa chamar de novo.
    // Guardar e reaproveitar dá erro na segunda vez.
    setPrompt(null);
    if (outcome === 'accepted') setInstalado(true);
  }

  return (
    <>
      <Card className="mb-4 flex items-center gap-3.5 p-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-vinho-50 text-vinho">
          <Download size={20} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-cream">Instalar o app</p>
          <p className="text-xs text-cream-muted">
            Fica na tela de início, abre mais rápido e recebe os avisos do pedido.
          </p>
        </div>

        <Button size="sm" onClick={instalar}>
          Instalar
        </Button>
      </Card>

      <Sheet
        open={passoAPasso}
        onClose={() => setPassoAPasso(false)}
        title="Instalar no iPhone"
      >
        <p className="mb-4 text-sm text-cream-muted">
          No iPhone a instalação é feita pelo Safari, em dois toques:
        </p>

        <ol className="space-y-3.5">
          <li className="flex items-start gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-vinho-50 text-xs font-bold text-vinho">
              1
            </span>
            <span className="flex-1 text-sm text-cream">
              Toque em <Share size={15} className="inline align-text-bottom text-vinho" />{' '}
              <strong>Compartilhar</strong>, na barra de baixo do Safari.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-vinho-50 text-xs font-bold text-vinho">
              2
            </span>
            <span className="flex-1 text-sm text-cream">
              Role e escolha{' '}
              <Plus size={15} className="inline align-text-bottom text-vinho" />{' '}
              <strong>Adicionar à Tela de Início</strong>.
            </span>
          </li>
        </ol>

        <p className="mt-4 rounded-xl border border-line bg-ink-300 px-3.5 py-2.5 text-xs text-cream-muted">
          Precisa ser pelo Safari. Em outro navegador do iPhone essa opção não aparece.
        </p>
      </Sheet>
    </>
  );
}

function estaInstalado() {
  return (
    window.navigator.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)')?.matches === true
  );
}

function ehIos() {
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS recente se identifica como Mac; o toque é o que o denuncia.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}
