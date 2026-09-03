import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, UtensilsCrossed, Tag, Gift, CreditCard,
  BarChart3, Settings as SettingsIcon, LogOut, Menu, X, Store, Volume2,
} from 'lucide-react';
import clsx from 'clsx';
import { LogoMark } from '../components/Logo';
import { Badge } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import PushToggle from '../components/admin/PushToggle';
import { PAINEL, PAINEL_ENTRAR, rotaPainel } from '../lib/rotas';
import { desligarModoPainel } from '../lib/modoPainel';
import { useRealtimeOrders } from '../hooks/useRealtimeOrders';
import { useToast } from '../context/ToastContext';
import { liberarNoPrimeiroToque, prepararSino, sinoLiberado, sinoLigado, tocarSino } from '../lib/sinoDaCozinha';
import { impressaoAutomatica, imprimirComanda } from '../lib/comanda';
import { adminOrders } from '../lib/adminApi';

const NAV = [
  { to: PAINEL, label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: rotaPainel('pedidos'), label: 'Pedidos', icon: ClipboardList },
  { to: rotaPainel('cardapio'), label: 'Cardápio', icon: UtensilsCrossed },
  { to: rotaPainel('promocoes'), label: 'Promoções', icon: Tag },
  { to: rotaPainel('roleta'), label: 'Roleta e fidelidade', icon: Gift },
  { to: rotaPainel('pagamentos'), label: 'Pagamentos', icon: CreditCard },
  { to: rotaPainel('relatorios'), label: 'Relatórios', icon: BarChart3 },
  { to: rotaPainel('configuracoes'), label: 'Configurações', icon: SettingsIcon },
];

/**
 * O sino de pedido novo, montado no LAYOUT e não na tela de Pedidos.
 *
 * Antes o som existia só dentro de `/pedidos`. Numa cozinha real o painel fica
 * aberto onde parou — na Visão geral, no Cardápio conferindo um esgotado — e
 * ali o pedido entrava calado. Aqui embaixo do layout, toca em qualquer tela
 * do painel.
 *
 * Três toques, não um: um bipe sozinho se perde no barulho de uma cozinha em
 * movimento, e pedido não ouvido é pedido atrasado.
 */
function SinoDePedidoNovo() {
  const toast = useToast();
  const { restaurant } = useStore();
  const conhecidos = useRef(new Set());
  const [bloqueado, setBloqueado] = useState(false);

  // O navegador libera áudio no primeiro toque da pessoa. Enquanto isso não
  // acontece, o painel avisa — em vez de ficar mudo esperando alguém descobrir
  // no pedido perdido.
  useEffect(() => {
    const solta = liberarNoPrimeiroToque();
    const conferir = setInterval(() => setBloqueado(sinoLigado() && !sinoLiberado()), 1500);
    return () => {
      solta();
      clearInterval(conferir);
    };
  }, []);

  const aoMudar = useCallback(
    (linha, evento) => {
      if (evento !== 'INSERT' || !linha?.id) return;

      // Um mesmo pedido pode chegar duas vezes se a conexão do realtime
      // reconectar. Sem esta trava, a cozinha ouviria o sino em dobro e
      // desconfiaria de pedido duplicado.
      if (conhecidos.current.has(linha.id)) return;
      conhecidos.current.add(linha.id);

      if (sinoLigado()) tocarSino(); // sem numero: usa o alarme cheio
      toast.success(`Pedido novo: ${linha.code}`);

      // Comanda sai sozinha, para ser grampeada no pacote.
      //
      // O evento do tempo real traz só a linha do pedido — sem itens, sem
      // endereço, sem o nome do cliente. Imprimir com o que veio daria uma
      // comanda sem o que a cozinha precisa, então buscamos o pedido inteiro
      // antes. É uma consulta a mais por pedido, e vale.
      if (impressaoAutomatica()) {
        adminOrders
          .get(linha.id)
          .then((completo) => imprimirComanda(completo, restaurant))
          .catch(() => {
            // Falhar a impressão não pode esconder o pedido: o sino já tocou e
            // ele está na tela. O aviso diz o que fazer à mão.
            toast.error(`Não consegui imprimir a comanda do ${linha.code}. Imprima pelo pedido.`);
          });
      }
    },
    [toast]
  );

  useRealtimeOrders({ onChange: aoMudar });

  if (!bloqueado) return null;

  return (
    <button
      type="button"
      onClick={() => {
        prepararSino();
        tocarSino(2); // duas voltas: confirmacao, nao o alarme inteiro
        setBloqueado(false);
      }}
      className="mb-4 flex w-full items-center gap-3 rounded-card border border-warning/40 bg-warning/10 px-4 py-3 text-left"
    >
      <Volume2 size={18} className="shrink-0 text-warning" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-cream">Som bloqueado pelo navegador</span>
        <span className="block text-xs text-cream-muted">
          Toque aqui para liberar o aviso de pedido novo neste aparelho.
        </span>
      </span>
    </button>
  );
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const { staff, signOut } = useAuth();
  const { isOpen, restaurant } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);

  const nav = (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-vinho-500 text-white'
                : 'text-cream-muted hover:bg-ink-300 hover:text-cream'
            )
          }
        >
          <Icon size={18} />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-ink">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-ink-600 p-4 lg:flex">
        <div className="mb-6 flex items-center gap-3 px-1">
          <LogoMark size={36} />
          <div className="min-w-0">
            <p className="font-script text-lg leading-none text-cream">Sushi Art</p>
            <p className="text-[10px] uppercase tracking-widest text-cream-faint">Painel</p>
          </div>
        </div>

        {nav}

        <div className="mt-auto space-y-3 pt-4">
          <PushToggle compact />

          <div className="rounded-xl border border-line bg-ink-500 p-3">
            <div className="flex items-center gap-2">
              <Store size={14} className="text-cream-muted" />
              <Badge tone={isOpen ? 'success' : 'danger'}>{isOpen ? 'Aberto' : 'Fechado'}</Badge>
            </div>
            <p className="mt-1.5 truncate text-[11px] text-cream-faint">{restaurant?.name}</p>
          </div>

          <div className="px-1">
            <p className="truncate text-xs font-medium text-cream">{staff?.name}</p>
            <p className="text-[11px] capitalize text-cream-faint">{staff?.role}</p>
          </div>

          <button
            type="button"
            onClick={async () => {
              await signOut();
              desligarModoPainel();
                  navigate(PAINEL_ENTRAR);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm text-cream-muted hover:bg-ink-300 hover:text-cream"
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>

      {/* Topo (mobile) */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-ink-600 px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
            className="rounded-lg p-1.5 text-cream-muted hover:bg-ink-300"
          >
            <Menu size={20} />
          </button>
          <LogoMark size={26} />
          <span className="font-script text-lg text-cream">Sushi Art</span>
          <Badge tone={isOpen ? 'success' : 'danger'} className="ml-auto">
            {isOpen ? 'Aberto' : 'Fechado'}
          </Badge>
        </header>

        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setMenuOpen(false)}
              className="absolute inset-0 bg-black/70"
            />
            <div className="relative h-full w-72 max-w-[85%] border-r border-line bg-ink-600 p-4">
              <div className="mb-6 flex items-center justify-between">
                <span className="font-script text-xl text-cream">Sushi Art</span>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Fechar menu"
                  className="rounded-lg p-1.5 text-cream-muted"
                >
                  <X size={20} />
                </button>
              </div>
              {nav}

              <div className="mt-4">
                <PushToggle compact />
              </div>

              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  desligarModoPainel();
                  navigate(PAINEL_ENTRAR);
                }}
                className="mt-6 flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm text-cream-muted"
              >
                <LogOut size={16} /> Sair
              </button>
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 p-4 lg:p-6">
          <SinoDePedidoNovo />
        <Outlet />
        </main>
      </div>
    </div>
  );
}
