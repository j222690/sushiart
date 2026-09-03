import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Banknote, QrCode, CreditCard, Bike, Store, Printer, Volume2, VolumeX, Check, X, Clock,
} from 'lucide-react';
import clsx from 'clsx';
import { Badge, Button, Card, Sheet, Spinner, Textarea } from '../../components/ui';
import { adminOrders } from '../../lib/adminApi';
import { useRealtimeOrders } from '../../hooks/useRealtimeOrders';
import { useToast } from '../../context/ToastContext';
import { useStore } from '../../context/StoreContext';
import { formatBRL, formatDateTime, timeAgo, formatPhone } from '../../lib/format';
import {
  ORDER_STATUS, KANBAN_COLUMNS, ACTIVE_STATUSES, ON_DELIVERY_KINDS, nextStatusFor, paymentLabel,
} from '../../lib/constants';
import { definirSino, prepararSino, sinoLigado, tocarSino } from '../../lib/sinoDaCozinha';
import {
  definirImpressaoAutomatica, impressaoAutomatica, imprimirComanda,
} from '../../lib/comanda';

const METHOD_ICONS = {
  pix: QrCode,
  cartao_credito: CreditCard,
  cartao_debito: CreditCard,
  na_entrega: Banknote,
};

export default function AdminOrders() {
  const toast = useToast();
  const { restaurant } = useStore();
  const [params, setParams] = useSearchParams();

  const [orders, setOrders] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [soundOn, setSoundOn] = useState(sinoLigado);
  const [autoPrint, setAutoPrint] = useState(impressaoAutomatica);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const knownIds = useRef(new Set());

  const load = useCallback(async () => {
    try {
      const rows = await adminOrders.list({
        statuses: [...ACTIVE_STATUSES, 'entregue', 'cancelado'],
        limit: 120,
      });
      setOrders(rows);
      knownIds.current = new Set(rows.map((o) => o.id));
    } catch (error) {
      toast.error(error.message);
      setOrders([]);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Abre direto o pedido quando vem do link do dashboard.
  useEffect(() => {
    const id = params.get('pedido');
    if (!id || !orders) return;
    const found = orders.find((o) => o.id === id);
    if (found) setDetail(found);
  }, [params, orders]);

  const onChange = useCallback(
    async (row, event) => {
      // Um pedido que ainda não estava na lista é venda nova: avisa a cozinha.
      const isNew = event === 'INSERT' && !knownIds.current.has(row.id);
      if (isNew) {
        knownIds.current.add(row.id);
        // O sino NÃO toca aqui: quem toca é o AdminLayout, que está montado em
        // toda tela do painel. Tocar nos dois lugares daria sino dobrado
        // quando a cozinha estivesse justamente nesta tela.
        toast.success(`Novo pedido ${row.code}!`);
      }
      await load();
    },
    [load, toast]
  );

  useRealtimeOrders({ onChange });

  async function advance(order) {
    const next = nextStatusFor(order);
    if (!next) return;

    setBusy(true);
    try {
      await adminOrders.setStatus(order.id, next);
      toast.success(`${order.code}: ${ORDER_STATUS[next].label}.`);
      await load();
      setDetail((current) => (current?.id === order.id ? { ...current, status: next } : current));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(order) {
    setCancelling(true);
    try {
      await adminOrders.setStatus(order.id, 'cancelado', cancelReason || 'Cancelado pelo restaurante');
      toast.info(`${order.code} cancelado.`);
      setCancelReason('');
      setDetail(null);
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setCancelling(false);
    }
  }

  async function confirmCashPayment(order) {
    setBusy(true);
    try {
      await adminOrders.markPaidManually(order.id);
      toast.success('Pagamento confirmado manualmente.');
      await load();
      setDetail(null);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  /** Comanda da cozinha: abre a janela de impressão só com o essencial. */
  function print(order) {
    const r = imprimirComanda(order, restaurant);
    if (!r.ok) toast.error(r.motivo);
  }

  if (orders === null) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-brand text-2xl text-cream">Pedidos</h1>
          <p className="text-sm text-cream-muted">Atualiza em tempo real conforme entram.</p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            const novo = !soundOn;
            setSoundOn(novo);
            definirSino(novo);
            // Ao LIGAR, toca uma vez: é o clique que libera o áudio no
            // navegador, e serve de confirmação de que o som funciona neste
            // aparelho — sem isso a pessoa só descobre no primeiro pedido.
            if (novo) {
              prepararSino();
              tocarSino(2); // duas voltas: confirmacao, nao o alarme inteiro
            }
          }}
        >
          {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
          {soundOn ? 'Som ligado' : 'Som desligado'}
        </Button>

        {/* Comanda saindo sozinha a cada pedido, como no iFood.
            Desligada por padrão: depende de impressora ligada e de o navegador
            deixar abrir janela. Ligada sem impressora do outro lado, o painel
            passaria o turno abrindo janelas para nada. */}
        <Button
          variant={autoPrint ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => {
            const novo = !autoPrint;
            setAutoPrint(novo);
            definirImpressaoAutomatica(novo);
            toast.info(
              novo
                ? 'A comanda vai sair sozinha a cada pedido novo.'
                : 'Impressão automática desligada.'
            );
          }}
        >
          <Printer size={15} />
          {autoPrint ? 'Imprime sozinho' : 'Imprimir manual'}
        </Button>
      </header>

      {/* Aguardando pagamento — fora do kanban: ainda não é trabalho da cozinha */}
      {orders.some((o) => o.status === 'aguardando_pagamento') && (
        <Card className="mb-5 border-warning/30 bg-warning/5 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-warning">
            <Clock size={15} /> Aguardando pagamento
          </h2>
          <div className="flex flex-wrap gap-2">
            {orders
              .filter((o) => o.status === 'aguardando_pagamento')
              .map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => setDetail(order)}
                  className="rounded-lg border border-line bg-ink-300 px-3 py-1.5 text-xs text-cream-muted hover:text-cream"
                >
                  {order.code} · {formatBRL(order.total_cents)} · {timeAgo(order.created_at)}
                </button>
              ))}
          </div>
        </Card>
      )}

      {/* Kanban */}
      <div className="grid gap-4 lg:grid-cols-4">
        {KANBAN_COLUMNS.map((column) => {
          const columnOrders = orders.filter((o) => column.statuses.includes(o.status));

          return (
            <section key={column.key} className="min-w-0">
              <header className="mb-2.5 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-cream">{column.title}</h2>
                <Badge tone={columnOrders.length > 0 ? 'vinho' : 'neutral'}>
                  {columnOrders.length}
                </Badge>
              </header>

              <div className="space-y-2.5">
                {columnOrders.length === 0 && (
                  <p className="rounded-card border border-dashed border-line py-6 text-center text-xs text-cream-faint">
                    Vazio
                  </p>
                )}

                {columnOrders.map((order) => {
                  const Icon = METHOD_ICONS[order.payment_method] ?? CreditCard;
                  const next = nextStatusFor(order);
                  const onDelivery = order.payment_method === 'na_entrega';
                  const kind = ON_DELIVERY_KINDS[order.on_delivery_kind];
                  // Só dinheiro vivo destaca em verde; maquininha é outro aviso.
                  const isCash = onDelivery && order.on_delivery_kind === 'dinheiro';

                  return (
                    <Card
                      key={order.id}
                      className={clsx('p-3.5', isCash && 'border-success/35')}
                    >
                      <button
                        type="button"
                        onClick={() => setDetail(order)}
                        className="w-full text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-cream">{order.code}</span>
                          <span className="ml-auto text-[11px] text-cream-faint">
                            {timeAgo(order.created_at)}
                          </span>
                        </div>

                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {/* Bairro fora do cadastro: alguém precisa ligar e
                              combinar o frete ANTES de o entregador sair. Se
                              este aviso passar batido, a entrega sai de graça. */}
                          {order.fee_to_arrange && <Badge tone="warning">Taxa a combinar</Badge>}

                          {onDelivery ? (
                            // Maquininha vira alerta laranja: se o entregador
                            // sair sem ela, a entrega não se completa.
                            <Badge tone={kind?.machine ? 'warning' : 'cash'}>
                              {kind?.badge ?? 'Na entrega'}
                            </Badge>
                          ) : (
                            <Badge tone="neutral">
                              <Icon size={11} />
                              {order.payment_method === 'pix' ? 'Pix' : 'Cartão'}
                            </Badge>
                          )}
                          <Badge tone="neutral">
                            {order.fulfillment === 'entrega' ? <Bike size={11} /> : <Store size={11} />}
                            {order.fulfillment === 'entrega' ? 'Entrega' : 'Retirada'}
                          </Badge>
                        </div>

                        <p className="mt-2 truncate text-xs text-cream-muted">
                          {order.customers?.name || 'Cliente'}
                          {order.address_snapshot?.neighborhood
                            ? ` · ${order.address_snapshot.neighborhood}`
                            : ''}
                        </p>

                        <ul className="mt-1.5 space-y-0.5">
                          {order.order_items.slice(0, 3).map((item) => (
                            <li key={item.id} className="truncate text-[11px] text-cream-faint">
                              {item.quantity}x {item.product_name}
                            </li>
                          ))}
                          {order.order_items.length > 3 && (
                            <li className="text-[11px] text-cream-faint">
                              + {order.order_items.length - 3} itens
                            </li>
                          )}
                        </ul>

                        <p className="mt-2 text-sm font-bold text-cream">
                          {formatBRL(order.total_cents)}
                          {order.change_for_cents ? (
                            <span className="ml-2 text-[11px] font-normal text-success">
                              troco p/ {formatBRL(order.change_for_cents)}
                            </span>
                          ) : null}
                        </p>
                      </button>

                      {next && (
                        <Button
                          size="sm"
                          className="mt-2.5 w-full"
                          disabled={busy}
                          onClick={() => advance(order)}
                        >
                          {ORDER_STATUS[next].label}
                        </Button>
                      )}
                    </Card>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Detalhe */}
      <Sheet
        open={Boolean(detail)}
        onClose={() => {
          setDetail(null);
          if (params.get('pedido')) setParams({}, { replace: true });
        }}
        title={detail ? `Pedido ${detail.code}` : ''}
        size="lg"
        footer={
          detail && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => print(detail)}>
                <Printer size={15} /> Imprimir comanda
              </Button>

              {detail.status === 'aguardando_pagamento' && (
                <Button variant="secondary" onClick={() => confirmCashPayment(detail)} disabled={busy}>
                  <Check size={15} /> Confirmar pagamento
                </Button>
              )}

              {nextStatusFor(detail) && (
                <Button className="flex-1" disabled={busy} onClick={() => advance(detail)}>
                  {ORDER_STATUS[nextStatusFor(detail)].label}
                </Button>
              )}
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge tone={ORDER_STATUS[detail.status].tone}>
                {ORDER_STATUS[detail.status].label}
              </Badge>
              {detail.payment_method === 'na_entrega' && (
                <Badge tone={ON_DELIVERY_KINDS[detail.on_delivery_kind]?.machine ? 'warning' : 'cash'}>
                  {ON_DELIVERY_KINDS[detail.on_delivery_kind]?.badge ?? 'Na entrega'}
                </Badge>
              )}
              <Badge tone="neutral">{formatDateTime(detail.created_at)}</Badge>
            </div>

            {/* Cliente */}
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-cream-faint">
                Cliente
              </h3>
              <p className="text-sm text-cream">{detail.customers?.name || '—'}</p>
              {detail.customers?.phone && (
                <a
                  href={`tel:${detail.customers.phone}`}
                  className="text-sm text-vinho-200 hover:underline"
                >
                  {formatPhone(detail.customers.phone)}
                </a>
              )}
            </section>

            {/* Entrega */}
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-cream-faint">
                {detail.fulfillment === 'entrega' ? 'Endereço' : 'Retirada'}
              </h3>
              {detail.fulfillment === 'entrega' && detail.address_snapshot ? (
                <div className="text-sm text-cream-muted">
                  <p className="text-cream">
                    {detail.address_snapshot.street}, {detail.address_snapshot.number}
                    {detail.address_snapshot.complement ? ` — ${detail.address_snapshot.complement}` : ''}
                  </p>
                  <p>{detail.address_snapshot.neighborhood}</p>
                  {detail.address_snapshot.reference && (
                    <p className="text-xs">Ref: {detail.address_snapshot.reference}</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-cream-muted">Cliente retira no balcão.</p>
              )}
            </section>

            {/* Itens */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-cream-faint">
                Itens
              </h3>
              <ul className="space-y-2.5">
                {detail.order_items.map((item) => (
                  <li key={item.id} className="flex gap-3 text-sm">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-ink-300 text-xs font-bold text-cream">
                      {item.quantity}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-cream">{item.product_name}</p>
                      {(item.addons ?? []).length > 0 && (
                        <p className="text-[11px] text-cream-muted">
                          + {item.addons.map((a) => a.name).join(', ')}
                        </p>
                      )}
                      {item.notes && (
                        <p className="mt-0.5 rounded bg-warning/10 px-2 py-1 text-[11px] font-medium text-warning">
                          {item.notes}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-cream">{formatBRL(item.total_cents)}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Valores */}
            <section className="rounded-xl border border-line bg-ink-300 p-3.5 text-sm">
              <div className="flex justify-between">
                <span className="text-cream-muted">Subtotal</span>
                <span className="text-cream">{formatBRL(detail.subtotal_cents)}</span>
              </div>
              {detail.delivery_fee_cents > 0 && (
                <div className="mt-1 flex justify-between">
                  <span className="text-cream-muted">Entrega</span>
                  <span className="text-cream">{formatBRL(detail.delivery_fee_cents)}</span>
                </div>
              )}
              {detail.discount_cents > 0 && (
                <div className="mt-1 flex justify-between">
                  <span className="text-cream-muted">
                    Desconto {detail.coupon_code ? `(${detail.coupon_code})` : ''}
                  </span>
                  <span className="text-success">− {formatBRL(detail.discount_cents)}</span>
                </div>
              )}
              <div className="mt-2 flex justify-between border-t border-line pt-2 text-base font-bold">
                <span className="text-cream">Total</span>
                <span className="text-cream">{formatBRL(detail.total_cents)}</span>
              </div>

              {detail.change_for_cents ? (
                <p className="mt-2 rounded-lg bg-success/10 px-2.5 py-1.5 text-xs text-success">
                  Troco para {formatBRL(detail.change_for_cents)} — levar{' '}
                  <strong>{formatBRL(detail.change_for_cents - detail.total_cents)}</strong>
                </p>
              ) : null}
            </section>

            {detail.notes && (
              <section>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-cream-faint">
                  Observações do pedido
                </h3>
                <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">{detail.notes}</p>
              </section>
            )}

            {/* Cancelamento */}
            {!['entregue', 'cancelado'].includes(detail.status) && (
              <section className="border-t border-line pt-4">
                <Textarea
                  label="Cancelar pedido"
                  placeholder="Motivo do cancelamento (o cliente é avisado)"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
                <Button
                  variant="danger"
                  size="sm"
                  className="mt-2"
                  loading={cancelling}
                  onClick={() => cancel(detail)}
                >
                  <X size={15} /> Cancelar pedido
                </Button>
              </section>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}

/** Escapa o que vai para a janela de impressão (nome de produto, observação). */
