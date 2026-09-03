import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  TrendingUp, ShoppingBag, Users, Banknote, Clock, Power, ChevronRight,
} from 'lucide-react';
import { Badge, Button, Card, Skeleton, Switch } from '../../components/ui';
import { adminReports, adminOrders, adminSettings } from '../../lib/adminApi';
import { useStore } from '../../context/StoreContext';
import { useToast } from '../../context/ToastContext';
import { useRealtimeOrders } from '../../hooks/useRealtimeOrders';
import { formatBRL, timeAgo } from '../../lib/format';
import { ORDER_STATUS, ACTIVE_STATUSES } from '../../lib/constants';
import { rotaPainel } from '../../lib/rotas';

/** Início e fim do dia de hoje no fuso local, em ISO. */
function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return [start.toISOString(), end.toISOString()];
}

function last7Range() {
  const start = new Date();
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return [start.toISOString(), new Date().toISOString()];
}

function Stat({ icon: Icon, label, value, hint, tone = 'vinho' }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-cream-muted">
        <Icon size={15} className={tone === 'ember' ? 'text-ember' : 'text-vinho-300'} />
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-cream">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-cream-faint">{hint}</p>}
    </Card>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const { restaurant, reload: reloadStore } = useStore();

  const [today, setToday] = useState(null);
  const [week, setWeek] = useState([]);
  const [top, setTop] = useState([]);
  const [live, setLive] = useState([]);
  const [accepting, setAccepting] = useState(true);

  const load = useCallback(async () => {
    const [from, to] = todayRange();
    const [weekFrom, weekTo] = last7Range();

    const [summary, daily, topProducts, activeOrders] = await Promise.all([
      adminReports.summary(from, to).catch(() => null),
      adminReports.daily(weekFrom, weekTo).catch(() => []),
      adminReports.topProducts(from, to, 5).catch(() => []),
      adminOrders.list({ statuses: ACTIVE_STATUSES, limit: 30 }).catch(() => []),
    ]);

    setToday(summary);
    setWeek(
      daily.map((d) => ({
        dia: new Date(`${d.day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }),
        valor: Number(d.revenue_cents) / 100,
        pedidos: Number(d.orders_count),
      }))
    );
    setTop(topProducts);
    setLive(activeOrders);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (restaurant) setAccepting(restaurant.accepting_orders);
  }, [restaurant]);

  // Pedido novo entrando: atualiza sem precisar recarregar a página.
  const onOrderChange = useCallback(() => load(), [load]);
  useRealtimeOrders({ onChange: onOrderChange });

  async function toggleAccepting(value) {
    setAccepting(value);
    try {
      await adminSettings.saveRestaurant({ accepting_orders: value });
      await reloadStore();
      toast.success(value ? 'Recebendo pedidos.' : 'Pedidos pausados.');
    } catch (error) {
      setAccepting(!value);
      toast.error(error.message);
    }
  }

  const pendingKitchen = live.filter((o) =>
    ['pago', 'confirmado_entrega', 'em_preparo'].includes(o.status)
  );

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-brand text-2xl text-cream">Visão geral</h1>
          <p className="text-sm text-cream-muted">Como está o movimento hoje.</p>
        </div>

        <Card className="flex items-center gap-3 px-4 py-2.5">
          <Power size={16} className={accepting ? 'text-success' : 'text-danger'} />
          <Switch
            checked={accepting}
            onChange={toggleAccepting}
            label="Aceitando pedidos"
            description="Chave-geral do app"
          />
        </Card>
      </header>

      {/* Números do dia */}
      {today === null ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            icon={TrendingUp}
            label="Faturamento hoje"
            value={formatBRL(today.revenue_cents)}
            hint={`${today.orders_count} pedidos`}
          />
          <Stat
            icon={ShoppingBag}
            label="Ticket médio"
            value={formatBRL(today.avg_ticket_cents)}
            hint={`${today.delivery_orders} entregas · ${today.pickup_orders} retiradas`}
          />
          <Stat
            icon={Clock}
            label="Na cozinha agora"
            value={pendingKitchen.length}
            hint={`${today.pending_payment} aguardando pagamento`}
            tone="ember"
          />
          <Stat
            icon={Banknote}
            label="Desconto concedido"
            value={formatBRL(today.discount_cents)}
            hint={`${today.canceled_orders} cancelados`}
          />
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {/* Gráfico */}
        <Card className="p-4 lg:col-span-2">
          <h2 className="mb-4 font-brand text-lg text-cream">Últimos 7 dias</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={week} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(245,241,234,0.06)" vertical={false} />
                <XAxis
                  dataKey="dia"
                  stroke="#6B6660"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis stroke="#6B6660" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(139,38,53,0.12)' }}
                  contentStyle={{
                    background: '#1A1A1A',
                    border: '1px solid rgba(245,241,234,0.08)',
                    borderRadius: 12,
                    color: '#F5F1EA',
                    fontSize: 12,
                  }}
                  formatter={(value, name) =>
                    name === 'valor' ? [formatBRL(value * 100), 'Faturamento'] : [value, 'Pedidos']
                  }
                />
                <Bar dataKey="valor" fill="#8B2635" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Fila ao vivo */}
        <Card className="flex flex-col p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-brand text-lg text-cream">Fila agora</h2>
            <Button size="sm" variant="ghost" onClick={() => navigate(rotaPainel('pedidos'))}>
              Abrir <ChevronRight size={14} />
            </Button>
          </div>

          {live.length === 0 ? (
            <p className="py-8 text-center text-sm text-cream-faint">Nenhum pedido em aberto.</p>
          ) : (
            <ul className="space-y-2">
              {live.slice(0, 6).map((order) => (
                <li key={order.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`${rotaPainel('pedidos')}?pedido=${order.id}`)}
                    className="flex w-full items-center gap-3 rounded-xl border border-line bg-ink-300 px-3 py-2.5 text-left hover:border-vinho-500/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-cream">
                        {order.code} · {formatBRL(order.total_cents)}
                      </p>
                      <p className="text-[11px] text-cream-faint">{timeAgo(order.created_at)}</p>
                    </div>
                    <Badge tone={ORDER_STATUS[order.status].tone}>
                      {ORDER_STATUS[order.status].short}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Mais vendidos hoje */}
      <Card className="mt-5 p-4">
        <h2 className="mb-3 flex items-center gap-2 font-brand text-lg text-cream">
          <Users size={17} className="text-vinho-300" /> Mais vendidos hoje
        </h2>

        {top.length === 0 ? (
          <p className="py-6 text-center text-sm text-cream-faint">
            Ainda sem vendas registradas hoje.
          </p>
        ) : (
          <ol className="divide-y divide-line">
            {top.map((item, index) => (
              <li key={item.product_id ?? item.product_name} className="flex items-center gap-3 py-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-vinho-900 text-xs font-bold text-vinho-100">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-cream">{item.product_name}</span>
                <span className="shrink-0 text-xs text-cream-muted">{item.units} un</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-cream">
                  {formatBRL(item.revenue_cents)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
