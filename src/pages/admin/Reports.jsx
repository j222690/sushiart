import { useCallback, useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Download, Banknote, Ticket, Users, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import { Badge, Button, Card, Skeleton } from '../../components/ui';
import { adminReports } from '../../lib/adminApi';
import { useToast } from '../../context/ToastContext';
import { formatBRL, formatDateTime } from '../../lib/format';
import { PAYMENT_METHODS, ON_DELIVERY_KINDS } from '../../lib/constants';

/** "Pagar na entrega" precisa aparecer quebrado por forma, senão esconde
 *  quanto foi dinheiro vivo e quanto foi maquininha. */
function paymentRowLabel(row) {
  if (row.method === 'na_entrega') {
    const kind = ON_DELIVERY_KINDS[row.on_delivery_kind];
    return kind ? `${kind.label} na entrega` : 'Pagar na entrega';
  }
  return PAYMENT_METHODS[row.method]?.label ?? row.method;
}

const RANGES = [
  { key: 'hoje', label: 'Hoje', days: 0 },
  { key: '7d', label: '7 dias', days: 6 },
  { key: '30d', label: '30 dias', days: 29 },
  { key: '90d', label: '90 dias', days: 89 },
];

const PIE_COLORS = ['#8B2635', '#C9803F', '#3FA66A', '#611A1B', '#A34450'];

function rangeToDates(days) {
  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  return [from.toISOString(), to.toISOString()];
}

function Stat({ label, value, hint }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-cream-muted">{label}</p>
      <p className="mt-1.5 text-xl font-bold tabular-nums text-cream">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-cream-faint">{hint}</p>}
    </Card>
  );
}

export default function Reports() {
  const toast = useToast();
  const [range, setRange] = useState('7d');
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    const days = RANGES.find((r) => r.key === range)?.days ?? 6;
    const [from, to] = rangeToDates(days);
    setData(null);

    try {
      const [summary, byPayment, daily, top, promotions, customers, cash] = await Promise.all([
        adminReports.summary(from, to),
        adminReports.byPayment(from, to),
        adminReports.daily(from, to),
        adminReports.topProducts(from, to, 12),
        adminReports.promotions(from, to),
        adminReports.customers(from, to),
        adminReports.cash(from, to),
      ]);
      setData({ summary, byPayment, daily, top, promotions, customers, cash, from, to });
    } catch (error) {
      toast.error(error.message);
      setData(null);
    }
  }, [range, toast]);

  useEffect(() => {
    load();
  }, [load]);

  /** Exporta o resumo do período em CSV para abrir no Excel. */
  function exportCsv() {
    if (!data) return;

    const lines = [
      ['Relatório Sushi Art'],
      ['Período', formatDateTime(data.from), formatDateTime(data.to)],
      [],
      ['Faturamento', formatBRL(data.summary.revenue_cents)],
      ['Pedidos', data.summary.orders_count],
      ['Ticket médio', formatBRL(data.summary.avg_ticket_cents)],
      ['Descontos', formatBRL(data.summary.discount_cents)],
      ['Cancelados', data.summary.canceled_orders],
      [],
      ['Forma de pagamento', 'Provedor', 'Pedidos', 'Faturamento'],
      ...data.byPayment.map((r) => [
        paymentRowLabel(r),
        r.provider,
        r.orders_count,
        formatBRL(r.revenue_cents),
      ]),
      [],
      ['Produto', 'Unidades', 'Faturamento'],
      ...data.top.map((r) => [r.product_name, r.units, formatBRL(r.revenue_cents)]),
    ];

    // ; como separador e BOM: é o que o Excel em pt-BR abre sem bagunçar.
    const csv = lines
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\n');

    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sushiart-relatorio-${range}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-brand text-2xl text-cream">Relatórios</h1>
          <p className="text-sm text-cream-muted">Faturamento, produtos, promoções e clientes.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-line bg-ink-300 p-1">
            {RANGES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setRange(item.key)}
                className={clsx(
                  'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                  range === item.key ? 'bg-vinho-500 text-cream' : 'text-cream-muted hover:text-cream'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!data}>
            <Download size={15} /> CSV
          </Button>
        </div>
      </header>

      {!data ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Faturamento"
              value={formatBRL(data.summary.revenue_cents)}
              hint={`${data.summary.orders_count} pedidos`}
            />
            <Stat
              label="Ticket médio"
              value={formatBRL(data.summary.avg_ticket_cents)}
              hint={`${data.summary.delivery_orders} entregas · ${data.summary.pickup_orders} retiradas`}
            />
            <Stat
              label="Descontos concedidos"
              value={formatBRL(data.summary.discount_cents)}
              hint={`${data.promotions.coupons_redeemed} cupons resgatados`}
            />
            <Stat
              label="Taxas de entrega"
              value={formatBRL(data.summary.delivery_cents)}
              hint={`${data.summary.canceled_orders} cancelados · ${data.summary.pending_payment} não pagos`}
            />
          </div>

          {/* Evolução */}
          <Card className="mt-5 p-4">
            <h2 className="mb-4 flex items-center gap-2 font-brand text-lg text-cream">
              <TrendingUp size={17} className="text-vinho-300" /> Faturamento no período
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data.daily.map((d) => ({
                    dia: new Date(`${d.day}T12:00:00`).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                    }),
                    valor: Number(d.revenue_cents) / 100,
                    pedidos: Number(d.orders_count),
                  }))}
                  margin={{ top: 4, right: 8, bottom: 0, left: -18 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(245,241,234,0.06)" vertical={false} />
                  <XAxis dataKey="dia" stroke="#6B6660" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#6B6660" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
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
                  <Line
                    type="monotone"
                    dataKey="valor"
                    stroke="#8B2635"
                    strokeWidth={2.5}
                    dot={{ fill: '#8B2635', r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {/* Formas de pagamento */}
            <Card className="p-4">
              <h2 className="mb-3 font-brand text-lg text-cream">Por forma de pagamento</h2>

              {data.byPayment.length === 0 ? (
                <p className="py-10 text-center text-sm text-cream-faint">Sem vendas no período.</p>
              ) : (
                <>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.byPayment.map((r) => ({
                            name: paymentRowLabel(r),
                            value: Number(r.revenue_cents) / 100,
                          }))}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={45}
                          outerRadius={78}
                          paddingAngle={3}
                        >
                          {data.byPayment.map((_, index) => (
                            <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Legend
                          verticalAlign="bottom"
                          formatter={(value) => <span style={{ color: '#A8A29A', fontSize: 12 }}>{value}</span>}
                        />
                        <Tooltip
                          contentStyle={{
                            background: '#1A1A1A',
                            border: '1px solid rgba(245,241,234,0.08)',
                            borderRadius: 12,
                            color: '#F5F1EA',
                            fontSize: 12,
                          }}
                          formatter={(value) => formatBRL(value * 100)}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <ul className="mt-2 divide-y divide-line">
                    {data.byPayment.map((row) => (
                      <li
                        key={`${row.method}-${row.on_delivery_kind ?? ''}-${row.provider}`}
                        className="flex items-center gap-2 py-2 text-sm"
                      >
                        <span className="min-w-0 flex-1 truncate text-cream">
                          {paymentRowLabel(row)}
                        </span>
                        <Badge tone="neutral">{row.provider}</Badge>
                        <span className="text-xs text-cream-muted">{row.orders_count}x</span>
                        <span className="font-semibold tabular-nums text-cream">
                          {formatBRL(row.revenue_cents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>

            {/* Conferência de caixa */}
            <Card className="p-4">
              <h2 className="mb-3 flex items-center gap-2 font-brand text-lg text-cream">
                <Banknote size={17} className="text-success" /> Caixa em dinheiro
              </h2>
              <p className="mb-3 text-xs text-cream-faint">
                Total que deve voltar com o entregador — só pedidos entregues.
              </p>

              <div className="rounded-xl border border-success/30 bg-success/5 p-4 text-center">
                <p className="text-3xl font-extrabold tabular-nums text-cream">
                  {formatBRL(data.cash.total_cents)}
                </p>
                <p className="mt-1 text-xs text-cream-muted">
                  {data.cash.orders_count} pedidos · {data.cash.needs_change} pediram troco
                </p>
                {data.cash.change_due_cents > 0 && (
                  <p className="mt-1 text-[11px] text-cream-faint">
                    Troco previsto a levar: {formatBRL(data.cash.change_due_cents)}
                  </p>
                )}
              </div>

              {(data.cash.orders ?? []).length > 0 && (
                <ul className="mt-3 max-h-52 divide-y divide-line overflow-y-auto">
                  {data.cash.orders.map((order) => (
                    <li key={order.code} className="flex items-center gap-2 py-2 text-sm">
                      <span className="font-mono text-xs text-cream-muted">{order.code}</span>
                      <span className="flex-1 text-[11px] text-cream-faint">
                        {formatDateTime(order.created_at)}
                      </span>
                      {order.change_for_cents ? (
                        <span className="text-[11px] text-cream-faint">
                          troco p/ {formatBRL(order.change_for_cents)}
                        </span>
                      ) : null}
                      <span className="font-semibold tabular-nums text-cream">
                        {formatBRL(order.total_cents)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Produtos */}
          <Card className="mt-5 p-4">
            <h2 className="mb-3 font-brand text-lg text-cream">Produtos mais vendidos</h2>

            {data.top.length === 0 ? (
              <p className="py-10 text-center text-sm text-cream-faint">Sem vendas no período.</p>
            ) : (
              <ol className="divide-y divide-line">
                {data.top.map((item, index) => (
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

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {/* Promoções */}
            <Card className="p-4">
              <h2 className="mb-3 flex items-center gap-2 font-brand text-lg text-cream">
                <Ticket size={17} className="text-ember" /> Roleta e cupons
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <Stat label="Giros na roleta" value={data.promotions.spins} hint={`${data.promotions.unique_spinners} clientes`} />
                <Stat label="Prêmios ganhos" value={data.promotions.prizes_won} hint={`${data.promotions.coupons_redeemed} cupons usados`} />
              </div>

              <div className="mt-3 rounded-xl border border-line bg-ink-300 p-3.5">
                <p className="text-xs text-cream-muted">Ticket médio</p>
                <div className="mt-2 flex items-end gap-4">
                  <div>
                    <p className="text-[11px] text-cream-faint">com cupom</p>
                    <p className="text-lg font-bold tabular-nums text-cream">
                      {formatBRL(data.promotions.avg_ticket_with_coupon_cents)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-cream-faint">sem cupom</p>
                    <p className="text-lg font-bold tabular-nums text-cream-muted">
                      {formatBRL(data.promotions.avg_ticket_without_coupon_cents)}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-cream-faint">
                  Se o ticket com cupom for maior, o desconto está puxando pedido maior — e não só
                  dando desconto a quem já ia comprar.
                </p>
              </div>

              {(data.promotions.by_coupon ?? []).length > 0 && (
                <ul className="mt-3 divide-y divide-line">
                  {data.promotions.by_coupon.map((row) => (
                    <li key={row.code} className="flex items-center gap-2 py-2 text-sm">
                      <span className="font-mono text-xs text-cream">{row.code}</span>
                      <Badge tone="neutral">{row.source}</Badge>
                      <span className="flex-1 text-right text-xs text-cream-muted">{row.uses}x</span>
                      <span className="text-xs tabular-nums text-danger">
                        −{formatBRL(row.discount_cents)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {(data.promotions.by_prize ?? []).length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cream-faint">
                    Prêmios sorteados
                  </p>
                  <ul className="space-y-1.5">
                    {data.promotions.by_prize.map((row) => (
                      <li key={row.label} className="flex items-center gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate text-cream-muted">{row.label}</span>
                        <span className="tabular-nums text-cream">{row.times}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            {/* Clientes */}
            <Card className="p-4">
              <h2 className="mb-3 flex items-center gap-2 font-brand text-lg text-cream">
                <Users size={17} className="text-vinho-300" /> Clientes
              </h2>

              <div className="grid grid-cols-3 gap-3">
                <Stat label="Total" value={data.customers.total_customers} />
                <Stat label="Novos" value={data.customers.new_customers} />
                <Stat label="Recorrentes" value={data.customers.returning_customers} />
              </div>

              <p className="mt-3 text-xs text-cream-faint">
                Média de {Number(data.customers.avg_orders_per_customer)} pedidos por cliente no período.
              </p>

              {(data.customers.top_customers ?? []).length > 0 && (
                <ol className="mt-3 divide-y divide-line">
                  {data.customers.top_customers.map((customer, index) => (
                    <li key={`${customer.name}-${index}`} className="flex items-center gap-3 py-2 text-sm">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-300 text-[11px] font-bold text-cream-muted">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-cream">{customer.name}</span>
                      <span className="text-xs text-cream-muted">{customer.orders}x</span>
                      <span className="font-semibold tabular-nums text-cream">
                        {formatBRL(customer.spent_cents)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
