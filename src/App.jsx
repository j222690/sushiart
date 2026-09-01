import { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { StoreProvider } from './context/StoreContext';
import { ToastProvider } from './context/ToastContext';
import SplashScreen from './components/SplashScreen';
import { Spinner } from './components/ui';
import ClientLayout from './layouts/ClientLayout';
import AdminLayout from './layouts/AdminLayout';

// Telas do cliente — as três primeiras entram no bundle inicial porque são o
// caminho quente (abrir o app → navegar no cardápio → carrinho).
import Home from './pages/client/Home';
import Menu from './pages/client/Menu';
import Cart from './pages/client/Cart';

const Search = lazy(() => import('./pages/client/Search'));
const Offers = lazy(() => import('./pages/client/Offers'));
const Checkout = lazy(() => import('./pages/client/Checkout'));
const Payment = lazy(() => import('./pages/client/Payment'));
const Orders = lazy(() => import('./pages/client/Orders'));
const OrderDetail = lazy(() => import('./pages/client/OrderDetail'));
const Favorites = lazy(() => import('./pages/client/Favorites'));
const Profile = lazy(() => import('./pages/client/Profile'));
const Addresses = lazy(() => import('./pages/client/Addresses'));
const Loyalty = lazy(() => import('./pages/client/Loyalty'));
const Notifications = lazy(() => import('./pages/client/Notifications'));
const Login = lazy(() => import('./pages/client/Login'));
const Privacidade = lazy(() => import('./pages/client/Privacidade'));
const Termos = lazy(() => import('./pages/client/Termos'));

// O painel só é baixado por quem realmente abre /admin.
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminOrders = lazy(() => import('./pages/admin/Orders'));
const MenuAdmin = lazy(() => import('./pages/admin/MenuAdmin'));
const Promotions = lazy(() => import('./pages/admin/Promotions'));
const RouletteAdmin = lazy(() => import('./pages/admin/RouletteAdmin'));
const Payments = lazy(() => import('./pages/admin/Payments'));
const Reports = lazy(() => import('./pages/admin/Reports'));
const Settings = lazy(() => import('./pages/admin/Settings'));

function PageFallback() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <Spinner />
    </div>
  );
}

/** Rola para o topo a cada navegação — sem isso o app "abre no meio da tela". */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** Barreira do painel: sem sessão de staff, ninguém entra em /admin. */
function RequireStaff({ children }) {
  const { loading, isStaff } = useAuth();

  if (loading) return <SplashScreen message="Verificando acesso..." />;
  if (!isStaff) return <Navigate to="/admin/entrar" replace />;
  return children;
}

function AppRoutes() {
  const { loading } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  // A splash fica no mínimo 900ms: um flash de 100ms fica pior do que não ter.
  useEffect(() => {
    const timer = setTimeout(() => setSplashDone(true), 900);
    return () => clearTimeout(timer);
  }, []);

  if (loading || !splashDone) return <SplashScreen />;

  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* ------------------------------ App do cliente ------------------------------ */}
        <Route element={<ClientLayout />}>
          <Route index element={<Home />} />
          <Route path="cardapio" element={<Menu />} />
          <Route path="busca" element={<Search />} />
          <Route path="ofertas" element={<Offers />} />
          <Route path="carrinho" element={<Cart />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="pedidos" element={<Orders />} />
          <Route path="pedidos/:orderId" element={<OrderDetail />} />
          <Route path="pagamento/:orderId" element={<Payment />} />
          <Route path="favoritos" element={<Favorites />} />
          <Route path="perfil" element={<Profile />} />
          <Route path="enderecos" element={<Addresses />} />
          <Route path="fidelidade" element={<Loyalty />} />
          <Route path="notificacoes" element={<Notifications />} />
        </Route>

        {/* Login do cliente fica fora do layout: sem bottom nav nem carrinho. */}
        <Route path="/entrar" element={<Login />} />

        {/* Páginas legais, públicas e fora do layout da loja. O Google abre
            estes endereços na análise do OAuth, e quem ainda não criou conta
            precisa poder ler antes de decidir. */}
        <Route path="/privacidade" element={<Privacidade />} />
        <Route path="/termos" element={<Termos />} />

        {/* --------------------------------- Painel --------------------------------- */}
        <Route path="/admin/entrar" element={<AdminLogin />} />
        <Route
          path="/admin"
          element={
            <RequireStaff>
              <AdminLayout />
            </RequireStaff>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="pedidos" element={<AdminOrders />} />
          <Route path="cardapio" element={<MenuAdmin />} />
          <Route path="promocoes" element={<Promotions />} />
          <Route path="roleta" element={<RouletteAdmin />} />
          <Route path="pagamentos" element={<Payments />} />
          <Route path="relatorios" element={<Reports />} />
          <Route path="configuracoes" element={<Settings />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <StoreProvider>
            <ScrollToTop />
            <AppRoutes />
          </StoreProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
