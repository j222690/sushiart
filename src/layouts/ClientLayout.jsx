import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingBag, Search, Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import BottomNav from '../components/BottomNav';
import { Logo } from '../components/Logo';
import { useCart } from '../store/cart';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { formatBRL, shortHour, WEEKDAYS } from '../lib/format';
import { notifications as notificationsApi } from '../lib/api';

/** Próximo horário de abertura, para o aviso de "fechado" não ser um beco sem saída. */
function nextOpening(hours) {
  if (!hours?.length) return null;
  const now = new Date();
  const today = now.getDay();

  for (let offset = 0; offset < 8; offset += 1) {
    const weekday = (today + offset) % 7;
    const slots = hours
      .filter((h) => h.active && h.weekday === weekday)
      .sort((a, b) => a.opens_at.localeCompare(b.opens_at));

    for (const slot of slots) {
      if (offset > 0) return `${WEEKDAYS[weekday]} às ${shortHour(slot.opens_at)}`;
      const [hh, mm] = slot.opens_at.split(':').map(Number);
      if (hh * 60 + mm > now.getHours() * 60 + now.getMinutes()) {
        return `hoje às ${shortHour(slot.opens_at)}`;
      }
    }
  }
  return null;
}

export default function ClientLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isOpen, hours, restaurant } = useStore();
  const { user } = useAuth();
  const count = useCart((s) => s.count());
  const subtotal = useCart((s) => s.subtotal());
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    notificationsApi
      .list(user.id)
      .then((rows) => setUnread(rows.filter((n) => !n.read_at && n.customer_id === user.id).length))
      .catch(() => setUnread(0));
  }, [user, location.pathname]);

  // A barra do carrinho atrapalharia justamente nas telas de fechar o pedido.
  const hideCartBar = ['/carrinho', '/checkout'].some((p) => location.pathname.startsWith(p));
  const opening = nextOpening(hours);

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col bg-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-ink-600/95 backdrop-blur safe-top">
        <div className="flex items-center gap-3 px-4 py-3">
          <button type="button" onClick={() => navigate('/')} className="min-w-0">
            <Logo size="sm" />
          </button>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigate('/busca')}
              aria-label="Buscar no cardápio"
              className="rounded-xl p-2 text-cream-muted hover:bg-ink-300 hover:text-cream"
            >
              <Search size={20} />
            </button>
            <button
              type="button"
              onClick={() => navigate('/notificacoes')}
              aria-label="Notificações"
              className="relative rounded-xl p-2 text-cream-muted hover:bg-ink-300 hover:text-cream"
            >
              <Bell size={20} />
              {unread > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-vinho-500" />
              )}
            </button>
          </div>
        </div>

        {!isOpen && (
          <div className="border-t border-warning/25 bg-warning/10 px-4 py-2 text-center text-xs text-warning">
            <strong className="font-semibold">Estamos fechados.</strong>{' '}
            {opening ? `Abrimos ${opening}.` : 'Confira nossos horários no perfil.'} Você pode montar
            seu carrinho agora.
          </div>
        )}
      </header>

      <main className="flex-1 pb-32">
        <Outlet />
      </main>

      {/* Barra flutuante do carrinho */}
      {count > 0 && !hideCartBar && (
        <div className="fixed inset-x-0 bottom-[72px] z-40 px-4 safe-bottom">
          <button
            type="button"
            onClick={() => navigate('/carrinho')}
            className="mx-auto flex w-full max-w-lg items-center gap-3 rounded-xl bg-vinho-500 px-4 py-3 shadow-raised transition-colors hover:bg-vinho-600"
          >
            <span className="relative">
              <ShoppingBag size={20} className="text-cream" />
              <span className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-cream px-1 text-[10px] font-bold text-vinho-700">
                {count}
              </span>
            </span>
            <span className="flex-1 text-left text-sm font-semibold text-cream">Ver carrinho</span>
            <span className="text-sm font-bold text-cream">{formatBRL(subtotal)}</span>
          </button>
        </div>
      )}

      <BottomNav />

      {restaurant?.name && (
        <span className="sr-only">
          {restaurant.name} — {restaurant.tagline}
        </span>
      )}
    </div>
  );
}
