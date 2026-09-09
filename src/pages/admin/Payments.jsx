import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CreditCard, Link2, Unlink, CheckCircle2, AlertTriangle, ExternalLink, Pencil,
} from 'lucide-react';
import { Badge, Button, Card, Input, Sheet, Skeleton, Switch, Textarea } from '../../components/ui';
import { adminSettings } from '../../lib/adminApi';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../lib/format';

/**
 * Painel → Pagamentos.
 *
 * Duas coisas vivem aqui: a conta do Mercado Pago (de onde sai o link de
 * conexão OAuth — sem ela conectada, as cobranças caem na conta do
 * desenvolvedor) e o roteador de formas de pagamento (o que aparece ligado
 * ou desligado no checkout do cliente).
 *
 * Esta tela existiu por um bom tempo com o conteúdo ERRADO: era uma cópia da
 * tela de pagamento do cliente (Pix, "Pagar agora"...), que só fazia sentido
 * com um pedido de verdade na URL. Como a rota do painel não tem
 * `:orderId`, ela sempre caía em "Não conseguimos iniciar o pagamento".
 */
export default function AdminPayments() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [methods, setMethods] = useState(null);
  const [mpStatus, setMpStatus] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [editSheet, setEditSheet] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [rows, status] = await Promise.all([
        adminSettings.paymentConfig(),
        adminSettings.mercadoPagoStatus(),
      ]);
      setMethods(rows);
      setMpStatus(status);
    } catch (error) {
      toast.error(error.message);
      setMethods([]);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Volta do OAuth do Mercado Pago: ?mp=conectado ou ?mp=erro&mensagem=...
  useEffect(() => {
    const mp = params.get('mp');
    if (!mp) return;
    if (mp === 'conectado') toast.success('Conta do Mercado Pago conectada.');
    else toast.error(params.get('mensagem') || 'Não foi possível conectar ao Mercado Pago.');
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect() {
    setConnecting(true);
    try {
      const url = await adminSettings.mercadoPagoConnectUrl();
      window.location.href = url;
    } catch (error) {
      toast.error(error.message);
      setConnecting(false);
    }
  }

  async function disconnect() {
    if (!window.confirm('Desconectar a conta do Mercado Pago? As cobranças voltam a usar a conta padrão.')) {
      return;
    }
    setDisconnecting(true);
    try {
      await adminSettings.mercadoPagoDisconnect();
      toast.success('Conta desconectada.');
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setDisconnecting(false);
    }
  }

  async function toggleActive(method, value) {
    setMethods((current) =>
      current.map((m) => (m.method === method.method ? { ...m, is_active: value } : m))
    );
    try {
      await adminSettings.savePaymentConfig(method.method, { is_active: value });
    } catch (error) {
      toast.error(error.message);
      // Desfaz o toggle otimista se o servidor recusou.
      setMethods((current) =>
        current.map((m) => (m.method === method.method ? { ...m, is_active: !value } : m))
      );
    }
  }

  function openEdit(method) {
    setEditForm({ label: method.label, description: method.description ?? '' });
    setEditSheet(method);
  }

  async function saveEdit() {
    if (!editForm.label?.trim()) return toast.error('Informe o nome exibido ao cliente.');
    setSaving(true);
    try {
      await adminSettings.savePaymentConfig(editSheet.method, {
        label: editForm.label.trim(),
        description: editForm.description?.trim() || null,
      });
      toast.success('Forma de pagamento atualizada.');
      setEditSheet(null);
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  const expired = mpStatus?.connected && mpStatus.expired;

  return (
    <div>
      <header className="mb-5">
        <h1 className="font-brand text-2xl text-cream">Pagamentos</h1>
        <p className="text-sm text-cream-muted">Conta do Mercado Pago e formas de pagamento do checkout.</p>
      </header>

      {/* ----------------------------- Mercado Pago ----------------------------- */}
      <Card className="mb-6 p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-vinho-50 text-vinho">
            <CreditCard size={20} />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-brand text-lg text-cream">Conta do Mercado Pago</h2>
              {mpStatus === null ? null : mpStatus.connected ? (
                expired ? (
                  <Badge tone="danger">Conexão expirada</Badge>
                ) : (
                  <Badge tone="success">Conectada</Badge>
                )
              ) : (
                <Badge tone="neutral">Não conectada</Badge>
              )}
            </div>

            {mpStatus === null ? (
              <Skeleton className="mt-2 h-4 w-48" />
            ) : mpStatus.connected ? (
              <>
                <p className="mt-1 text-sm text-cream-muted">
                  {mpStatus.nickname || mpStatus.email || 'Conta conectada'}
                </p>
                <p className="mt-0.5 text-xs text-cream-faint">
                  Conectada em {formatDateTime(mpStatus.connected_at)}
                  {mpStatus.expires_at && ` · válida até ${formatDateTime(mpStatus.expires_at)}`}
                </p>
                {expired && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-danger">
                    <AlertTriangle size={13} />
                    A conexão expirou — conecte de novo para as cobranças continuarem caindo na sua conta.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-sm text-cream-muted">
                Sem conta conectada, as cobranças caem na conta padrão do sistema, não na sua. Conecte
                para o dinheiro cair direto na sua conta do Mercado Pago.
              </p>
            )}

            <div className="mt-3 flex gap-2">
              {mpStatus?.connected ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="text-danger"
                  loading={disconnecting}
                  onClick={disconnect}
                >
                  <Unlink size={14} /> Desconectar
                </Button>
              ) : (
                <Button size="sm" loading={connecting} onClick={connect} disabled={mpStatus === null}>
                  <Link2 size={14} /> Conectar conta
                  <ExternalLink size={13} />
                </Button>
              )}
              {expired && (
                <Button size="sm" loading={connecting} onClick={connect}>
                  <Link2 size={14} /> Conectar de novo
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* ------------------------------- Métodos -------------------------------- */}
      <h2 className="mb-3 font-brand text-lg text-cream">Formas de pagamento no checkout</h2>

      {methods === null ? (
        <div className="space-y-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : (
        <div className="space-y-2">
          {methods.map((method) => (
            <Card key={method.method} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-cream">{method.label}</p>
                  <Badge tone="neutral">{method.provider}</Badge>
                  {!method.is_active && <Badge tone="danger">Desligado</Badge>}
                </div>
                {method.description && (
                  <p className="mt-0.5 text-xs text-cream-muted">{method.description}</p>
                )}
              </div>

              <Button size="sm" variant="ghost" onClick={() => openEdit(method)}>
                <Pencil size={15} />
              </Button>

              <Switch checked={method.is_active} onChange={(v) => toggleActive(method, v)} />
            </Card>
          ))}
        </div>
      )}

      <Sheet
        open={Boolean(editSheet)}
        onClose={() => setEditSheet(null)}
        title="Editar forma de pagamento"
        footer={
          <Button className="w-full" loading={saving} onClick={saveEdit}>
            Salvar
          </Button>
        }
      >
        <div className="space-y-4">
          <Input
            label="Nome exibido ao cliente"
            value={editForm.label ?? ''}
            onChange={(e) => setEditForm((c) => ({ ...c, label: e.target.value }))}
          />
          <Textarea
            label="Descrição (opcional)"
            value={editForm.description ?? ''}
            onChange={(e) => setEditForm((c) => ({ ...c, description: e.target.value }))}
            rows={2}
          />
        </div>
      </Sheet>

      <p className="mt-4 flex items-start gap-1.5 text-xs text-cream-faint">
        <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
        Formas de pagamento sem integração pronta (cartão via Mercado Pago/PagBank, por exemplo) devem
        ficar desligadas até o processamento estar configurado — senão o cliente chega ao fim do
        checkout e a cobrança não completa.
      </p>
    </div>
  );
}
