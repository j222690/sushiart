import { useCallback, useEffect, useState } from 'react';
import { QrCode, CreditCard, Banknote, ShieldCheck, AlertTriangle, Info } from 'lucide-react';
import clsx from 'clsx';
import { Badge, Button, Card, Input, Select, Skeleton, Switch } from '../../components/ui';
import { adminSettings } from '../../lib/adminApi';
import { useToast } from '../../context/ToastContext';
import { PAYMENT_PROVIDERS, ON_DELIVERY_KINDS } from '../../lib/constants';

const METHOD_META = {
  pix: { label: 'Pix', icon: QrCode, hint: 'Confirmação automática por webhook.' },
  cartao_credito: {
    label: 'Cartão de crédito',
    icon: CreditCard,
    hint: 'Checkout do gateway, com confirmação por webhook.',
  },
  cartao_debito: {
    label: 'Cartão de débito',
    icon: CreditCard,
    hint: 'Débito à vista, com confirmação por webhook.',
  },
  na_entrega: {
    label: 'Pagar na entrega',
    icon: Banknote,
    hint: 'Sem gateway: dinheiro, maquininha ou Pix direto com o entregador.',
  },
};

/**
 * Roteador de pagamentos.
 *
 * Cada método aponta para um provedor. Trocar de gateway no futuro é mudar o
 * `provider` aqui — o app do cliente não muda, porque ele só conhece "Pix",
 * "Cartão" e "Dinheiro". As chaves de API NÃO ficam nesta tela nem no banco:
 * vivem nos secrets das Edge Functions.
 */
export default function Payments() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [saving, setSaving] = useState(null);

  const load = useCallback(async () => {
    try {
      setRows(await adminSettings.paymentConfig());
    } catch (error) {
      toast.error(error.message);
      setRows([]);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(method, patch) {
    const row = rows.find((r) => r.method === method);
    const provider = patch.provider ?? row?.provider;

    // Barreira: ativar um método cujo gateway ainda não tem adapter jogaria o
    // cliente num checkout que nunca completa. Melhor recusar aqui.
    if (patch.is_active === true && PAYMENT_PROVIDERS[provider]?.implemented === false) {
      toast.error(
        `${PAYMENT_PROVIDERS[provider].label} ainda não tem integração escrita. ` +
          'Peça o adapter antes de ativar este método.'
      );
      return;
    }

    setSaving(method);
    setRows((current) => current.map((r) => (r.method === method ? { ...r, ...patch } : r)));
    try {
      await adminSettings.savePaymentConfig(method, patch);
      toast.success('Configuração salva.');
    } catch (error) {
      toast.error(error.message);
      await load();
    } finally {
      setSaving(null);
    }
  }

  if (rows === null) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    );
  }

  const noneActive = rows.every((r) => !r.is_active);

  return (
    <div>
      <header className="mb-5">
        <h1 className="font-brand text-2xl text-cream">Pagamentos</h1>
        <p className="text-sm text-cream-muted">
          Escolha qual gateway atende cada forma de pagamento.
        </p>
      </header>

      {noneActive && (
        <Card className="mb-4 flex items-start gap-3 border-danger/40 bg-danger/10 p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" />
          <p className="text-sm text-cream">
            Nenhuma forma de pagamento está ativa — o cliente não consegue fechar pedido.
          </p>
        </Card>
      )}

      <div className="space-y-3">
        {rows.map((row) => {
          const meta = METHOD_META[row.method];
          const Icon = meta?.icon ?? CreditCard;
          const compatible = Object.entries(PAYMENT_PROVIDERS).filter(([, p]) =>
            p.methods.includes(row.method)
          );

          return (
            <Card key={row.method} className={clsx('p-4', !row.is_active && 'opacity-70')}>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={clsx(
                    'grid h-11 w-11 shrink-0 place-items-center rounded-xl',
                    row.is_active ? 'bg-vinho-gradient text-white' : 'bg-ink-300 text-cream-faint'
                  )}
                >
                  <Icon size={20} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-cream">{meta?.label ?? row.method}</p>
                    <Badge tone={row.is_active ? 'success' : 'neutral'}>
                      {row.is_active ? '● Ativo' : '○ Inativo'}
                    </Badge>
                    <Badge tone="info">{PAYMENT_PROVIDERS[row.provider]?.label ?? row.provider}</Badge>
                    {PAYMENT_PROVIDERS[row.provider]?.implemented === false && (
                      <Badge tone="warning">Sem integração</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-cream-faint">{meta?.hint}</p>
                  {PAYMENT_PROVIDERS[row.provider]?.implemented === false && (
                    <p className="mt-1 text-xs text-warning">
                      O adapter de {PAYMENT_PROVIDERS[row.provider].label} ainda não foi escrito —
                      este método não pode ser ativado até isso ser feito.
                    </p>
                  )}
                </div>

                <div className="shrink-0">
                  <Switch
                    checked={row.is_active}
                    disabled={saving === row.method}
                    onChange={(v) => save(row.method, { is_active: v })}
                    label=""
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-3 border-t border-line pt-4 md:grid-cols-2">
                <Select
                  label="Provedor"
                  value={row.provider}
                  disabled={row.method === 'na_entrega'}
                  onChange={(e) => save(row.method, { provider: e.target.value })}
                >
                  {compatible.map(([value, provider]) => (
                    <option key={value} value={value}>
                      {provider.label} — {provider.note}
                    </option>
                  ))}
                </Select>

                <Input
                  label="Como o cliente vê"
                  defaultValue={row.label}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value !== row.label) {
                      save(row.method, { label: e.target.value.trim() });
                    }
                  }}
                />

                <Input
                  className="md:col-span-2"
                  label="Descrição no checkout"
                  defaultValue={row.description ?? ''}
                  onBlur={(e) => {
                    if (e.target.value !== row.description) {
                      save(row.method, { description: e.target.value.trim() || null });
                    }
                  }}
                />

                {row.method === 'cartao_credito' && (
                  <>
                    <Input
                      label="Máximo de parcelas"
                      type="number"
                      min={1}
                      max={12}
                      defaultValue={row.options?.max_installments ?? 3}
                      onBlur={(e) =>
                        save(row.method, {
                          options: {
                            ...row.options,
                            max_installments: Math.max(1, Number(e.target.value) || 1),
                          },
                        })
                      }
                    />
                    <Input
                      label="Parcela mínima (R$)"
                      type="number"
                      min={1}
                      defaultValue={(row.options?.min_installment_cents ?? 2000) / 100}
                      onBlur={(e) =>
                        save(row.method, {
                          options: {
                            ...row.options,
                            min_installment_cents: Math.round((Number(e.target.value) || 20) * 100),
                          },
                        })
                      }
                      hint="Abaixo disso, a opção de parcela some do checkout."
                    />
                  </>
                )}

                {row.method === 'pix' && (
                  <Input
                    label="Expiração do Pix (minutos)"
                    type="number"
                    min={5}
                    defaultValue={row.options?.expires_minutes ?? 30}
                    onBlur={(e) =>
                      save(row.method, {
                        options: {
                          ...row.options,
                          expires_minutes: Math.max(5, Number(e.target.value) || 30),
                        },
                      })
                    }
                  />
                )}

                {row.method === 'na_entrega' && (
                  <div className="space-y-3 rounded-xl border border-line bg-ink-300 p-3.5 md:col-span-2">
                    <p className="text-xs font-semibold text-cream">
                      Formas aceitas na entrega
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {Object.entries(ON_DELIVERY_KINDS).map(([key, kind]) => {
                        const enabled = (row.options?.kinds ?? []).includes(key);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              const current = row.options?.kinds ?? [];
                              const next = enabled
                                ? current.filter((k) => k !== key)
                                : [...current, key];
                              if (next.length === 0) {
                                toast.error('Deixe ao menos uma forma de pagamento na entrega.');
                                return;
                              }
                              save(row.method, { options: { ...row.options, kinds: next } });
                            }}
                            className={clsx(
                              'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                              enabled
                                ? 'border-vinho-500 bg-vinho-900/40 text-cream'
                                : 'border-line bg-ink-500 text-cream-faint'
                            )}
                          >
                            {kind.badge}
                          </button>
                        );
                      })}
                    </div>

                    <p className="text-[11px] text-cream-faint">
                      Crédito e débito na entrega exigem maquininha — a comanda avisa o entregador.
                    </p>

                    <Switch
                      checked={row.options?.ask_change ?? true}
                      onChange={(v) =>
                        save(row.method, { options: { ...row.options, ask_change: v } })
                      }
                      label="Perguntar sobre troco"
                      description='Mostra o campo "precisa de troco para quanto?" quando for dinheiro'
                    />
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Onde ficam as chaves */}
      <Card className="mt-5 p-4">
        <h2 className="mb-2 flex items-center gap-2 font-brand text-lg text-cream">
          <ShieldCheck size={17} className="text-success" /> Chaves de API
        </h2>
        <p className="text-sm text-cream-muted">
          Por segurança, as chaves dos gateways não ficam nesta tela nem no banco de dados. Elas são
          cadastradas como <em>secrets</em> das Edge Functions do Supabase:
        </p>

        <pre className="mt-3 overflow-x-auto rounded-xl bg-ink-800 p-3.5 text-[11px] leading-relaxed text-cream-muted">
{`supabase secrets set \\
  INFINITEPAY_API_KEY=...      # Pix
  INFINITEPAY_HANDLE=...       # seu @handle na InfinitePay
  INFINITEPAY_WEBHOOK_SECRET=...
  ASAAS_API_KEY=...            # Cartão
  ASAAS_WEBHOOK_TOKEN=...
  ASAAS_ENV=sandbox            # ou production`}
        </pre>

        <div className="mt-3 flex items-start gap-2 rounded-xl border border-line bg-ink-300 p-3">
          <Info size={15} className="mt-0.5 shrink-0 text-cream-faint" />
          <p className="text-xs text-cream-faint">
            Depois de trocar um provedor aqui, confirme que a URL de webhook correspondente está
            cadastrada no painel do gateway — sem isso o pedido fica preso em “aguardando pagamento”.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => {
            const base = import.meta.env.VITE_SUPABASE_URL;
            navigator.clipboard?.writeText(
              `InfinitePay: ${base}/functions/v1/webhook-infinitepay\nAsaas: ${base}/functions/v1/webhook-asaas`
            );
            toast.success('URLs de webhook copiadas.');
          }}
        >
          Copiar URLs de webhook
        </Button>
      </Card>
    </div>
  );
}
