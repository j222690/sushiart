import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Plus, Pencil, Trash2, Star } from 'lucide-react';
import AddressForm from '../../components/AddressForm';
import { Badge, Button, Card, EmptyState, Sheet, Skeleton } from '../../components/ui';
import { profile } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { useToast } from '../../context/ToastContext';
import { formatBRL } from '../../lib/format';

export default function Addresses() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { zoneFor } = useStore();

  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null); // objeto = editar, 'novo' = criar
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/entrar?next=/enderecos', { replace: true });
      return;
    }
    profile.addresses(user.id).then(setRows).catch(() => setRows([]));
  }, [user, navigate]);

  async function reload() {
    setRows(await profile.addresses(user.id));
  }

  async function handleSave(data) {
    setSaving(true);
    try {
      await profile.saveAddress(user.id, editing === 'novo' ? data : { ...data, id: editing.id });
      await reload();
      setEditing(null);
      toast.success('Endereço salvo.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(address) {
    if (!window.confirm(`Excluir o endereço "${address.label}"?`)) return;
    try {
      await profile.deleteAddress(address.id);
      await reload();
      toast.info('Endereço excluído.');
    } catch (error) {
      toast.error(error.message);
    }
  }

  return (
    <div className="px-4 pb-8 pt-4">
      <button
        type="button"
        onClick={() => navigate('/perfil')}
        className="mb-4 flex items-center gap-1.5 text-sm text-cream-muted hover:text-cream"
      >
        <ArrowLeft size={16} /> Perfil
      </button>

      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-brand text-2xl text-cream">Meus endereços</h1>
        <Button size="sm" onClick={() => setEditing('novo')}>
          <Plus size={15} /> Novo
        </Button>
      </div>

      {rows === null ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Nenhum endereço salvo"
          description="Cadastre um endereço para agilizar seus próximos pedidos."
          action={
            <Button className="mt-2" onClick={() => setEditing('novo')}>
              Cadastrar endereço
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {rows.map((address) => {
            const zone = zoneFor(address.neighborhood);
            return (
              <Card key={address.id} className="p-4">
                <div className="flex items-start gap-3">
                  <MapPin size={18} className="mt-0.5 shrink-0 text-cream-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-cream">{address.label}</p>
                      {address.is_default && (
                        <Badge tone="vinho">
                          <Star size={10} /> Padrão
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-cream-muted">
                      {address.street}, {address.number}
                      {address.complement ? ` — ${address.complement}` : ''}
                    </p>
                    <p className="text-xs text-cream-faint">
                      {address.neighborhood} · {address.city}
                    </p>
                    <p className="mt-1 text-[11px]">
                      {zone ? (
                        <span className="text-cream-faint">
                          Taxa {formatBRL(zone.fee_cents)} · ~{zone.eta_min} min
                        </span>
                      ) : (
                        <span className="text-warning">Fora da área de entrega</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex gap-2 border-t border-line pt-3">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(address)}>
                    <Pencil size={13} /> Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    onClick={() => handleDelete(address)}
                  >
                    <Trash2 size={13} /> Excluir
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Sheet
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === 'novo' ? 'Novo endereço' : 'Editar endereço'}
      >
        <AddressForm
          address={editing === 'novo' ? null : editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
          saving={saving}
        />
      </Sheet>
    </div>
  );
}
