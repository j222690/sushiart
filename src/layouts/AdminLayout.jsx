import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, UtensilsCrossed, Tag, Gift, CreditCard,
  BarChart3, Settings as SettingsIcon, LogOut, Menu, X, Store,
} from 'lucide-react';
import clsx from 'clsx';
import { LogoMark } from '../components/Logo';
import { Badge } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import PushToggle from '../components/admin/PushToggle';

const NAV = [
  { to: '/admin', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: '/admin/pedidos', label: 'Pedidos', icon: ClipboardList },
  { to: '/admin/cardapio', label: 'Cardápio', icon: UtensilsCrossed },
  { to: '/admin/promocoes', label: 'Promoções', icon: Tag },
  { to: '/admin/roleta', label: 'Roleta e fidelidade', icon: Gift },
  { to: '/admin/pagamentos', label: 'Pagamentos', icon: CreditCard },
  { to: '/admin/relatorios', label: 'Relatórios', icon: BarChart3 },
  { to: '/admin/configuracoes', label: 'Configurações', icon: SettingsIcon },
];

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
              navigate('/admin/entrar');
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm text-cream-muted hover:bg-ink-300 hover:text-cream"
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>

      {/* Topo (mobile) */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-ink-600/95 px-4 py-3 backdrop-blur lg:hidden">
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
                  navigate('/admin/entrar');
                }}
                className="mt-6 flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm text-cream-muted"
              >
                <LogOut size={16} /> Sair
              </button>
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
