import { useEffect, useState } from 'react';
import { Button, Input, Select, Switch } from './ui';
import { useStore } from '../context/StoreContext';
import { formatZip, formatBRL } from '../lib/format';

const EMPTY = {
  label: 'Casa',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: 'Chapecó',
  state: 'SC',
  zip: '',
  reference: '',
  is_default: false,
};

/**
 * O bairro é um `select` das zonas de entrega cadastradas, não um campo livre:
 * assim o cliente não digita um bairro que o restaurante não atende e só
 * descobre na hora de fechar o pedido.
 */
export default function AddressForm({ address, onSave, onCancel, saving }) {
  const { zones } = useStore();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setForm(address ? { ...EMPTY, ...address } : EMPTY);
    setErrors({});
  }, [address]);

  const set = (field) => (event) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [field]: field === 'zip' ? formatZip(value) : value }));
  };

  const zone = zones.find((z) => z.neighborhood === form.neighborhood);

  function handleSubmit(event) {
    event.preventDefault();
    const next = {};
    if (!form.street.trim()) next.street = 'Informe a rua.';
    if (!form.number.trim()) next.number = 'Informe o número.';
    if (!form.neighborhood) next.neighborhood = 'Escolha o bairro.';

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    onSave({ ...form, zip: form.zip.replace(/\D/g, '') || null });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      <Input label="Identificação" value={form.label} onChange={set('label')} placeholder="Casa, Trabalho..." />

      <div className="grid grid-cols-[1fr_88px] gap-3">
        <Input label="Rua" value={form.street} onChange={set('street')} error={errors.street} required />
        <Input label="Número" value={form.number} onChange={set('number')} error={errors.number} required />
      </div>

      <Input label="Complemento" value={form.complement || ''} onChange={set('complement')} placeholder="Apto, bloco, casa dos fundos" />

      <Select label="Bairro" value={form.neighborhood} onChange={set('neighborhood')} required>
        <option value="">Selecione o bairro</option>
        {zones.map((z) => (
          <option key={z.id} value={z.neighborhood}>
            {z.neighborhood} — {z.fee_cents === 0 ? 'grátis' : formatBRL(z.fee_cents)}
          </option>
        ))}
      </Select>
      {errors.neighborhood && <p className="-mt-2 text-xs text-danger">{errors.neighborhood}</p>}
      {zone && (
        <p className="-mt-2 text-xs text-cream-faint">
          Entrega em ~{zone.eta_min} min
          {zone.min_order_cents > 0 && ` · pedido mínimo ${formatBRL(zone.min_order_cents)}`}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Input label="Cidade" value={form.city} onChange={set('city')} />
        <Input label="CEP" value={form.zip || ''} onChange={set('zip')} inputMode="numeric" placeholder="89800-000" />
      </div>

      <Input
        label="Ponto de referência"
        value={form.reference || ''}
        onChange={set('reference')}
        placeholder="Portão preto, ao lado da farmácia"
      />

      <div className="rounded-xl border border-line bg-ink-300 p-3.5">
        <Switch
          checked={form.is_default}
          onChange={(v) => setForm((c) => ({ ...c, is_default: v }))}
          label="Usar como endereço padrão"
          description="Vem selecionado nos próximos pedidos"
        />
      </div>

      <div className="flex gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" className="flex-1" loading={saving}>
          Salvar endereço
        </Button>
      </div>
    </form>
  );
}
