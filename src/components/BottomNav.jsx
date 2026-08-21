import { NavLink } from 'react-router-dom';
import { Home, UtensilsCrossed, Tag, ReceiptText, User } from 'lucide-react';
import clsx from 'clsx';

const TABS = [
  { to: '/', label: 'Início', icon: Home, end: true },
  { to: '/cardapio', label: 'Cardápio', icon: UtensilsCrossed },
  { to: '/ofertas', label: 'Ofertas', icon: Tag },
  { to: '/pedidos', label: 'Pedidos', icon: ReceiptText },
  { to: '/perfil', label: 'Perfil', icon: User },
];

/** Navegação principal do app do cliente. A aba ativa usa o vinho da marca. */
export default function BottomNav({ badge }) {
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink-600/95 backdrop-blur safe-bottom"
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'relative flex flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors',
                  isActive ? 'text-vinho-200' : 'text-cream-faint hover:text-cream-muted'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute -top-px h-0.5 w-8 rounded-full bg-vinho-500" />
                  )}
                  <span className="relative">
                    <Icon size={21} strokeWidth={isActive ? 2.4 : 1.9} />
                    {to === '/pedidos' && badge > 0 && (
                      <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-vinho-500 px-1 text-[9px] font-bold text-cream">
                        {badge}
                      </span>
                    )}
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
