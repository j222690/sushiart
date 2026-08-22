import { useCallback, useEffect, useState } from 'react';
import { Info, MapPinned } from 'lucide-react';
import { Button, Input, Select, Switch } from './ui';
import MapPicker from './MapPicker';
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
  lat: null,
  lng: null,
  is_default: false,
};

/** Valor sentinela do select: bairro que o restaurante ainda não cadastrou. */
const FORA = '__fora_da_lista__';

const normalizar = (texto) =>
  (texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

/**
 * Endereço de entrega, com mapa.
 *
 * O mapa preenche rua, número, CEP e SUGERE o bairro; o pino guarda o ponto
 * exato que o entregador vai seguir. Mas quem confirma o bairro é a pessoa, no
 * select — porque é o bairro que define a taxa, e geocodificação erra nome com
 * frequência. O mapa sugere, o humano decide.
 *
 * Bairro fora da lista não bloqueia mais o pedido: ele entra com a taxa a
 * combinar e a equipe fecha por telefone (ver `create_order` na 0009). Uma
 * venda perdida por um bairro que ninguém cadastrou é pior que um telefonema.
 */
export default function AddressForm({ address, onSave, onCancel, saving }) {
  const { zones } = useStore();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [foraDaLista, setForaDaLista] = useState(false);
  const [sugestao, setSugestao] = useState(null);

  useEffect(() => {
    const inicial = address ? { ...EMPTY, ...address } : EMPTY;
    setForm(inicial);
    setErrors({});
    setSugestao(null);
    // Endereço salvo cujo bairro não está (ou não está mais) entre as zonas.
    setForaDaLista(
      Boolean(inicial.neighborhood) &&
        !zones.some((z) => normalizar(z.neighborhood) === normalizar(inicial.neighborhood))
    );
  }, [address, zones]);

  const set = (field) => (event) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [field]: field === 'zip' ? formatZip(value) : value }));
  };

  /** O mapa devolveu um ponto: preenche o que dá e sugere o bairro. */
  const aplicarDoMapa = useCallback(
    (ponto) => {
      setForm((current) => ({
        ...current,
        lat: ponto.lat,
        lng: ponto.lng,
        // Não sobrescreve o que a pessoa já digitou — só preenche o que falta.
        street: current.street || ponto.street || '',
        number: current.number || ponto.number || '',
        city: ponto.city || current.city,
        zip: current.zip || (ponto.zip ? formatZip(ponto.zip) : ''),
      }));

      const detectado = ponto.neighborhood?.trim();
      if (!detectado) return;

      const zona = zones.find((z) => normalizar(z.neighborhood) === normalizar(detectado));

      if (zona) {
        // Casou com uma zona: pode selecionar sozinho, o preço é conhecido.
        setForaDaLista(false);
        setSugestao(null);
        setForm((current) => ({ ...current, neighborhood: zona.neighborhood }));
      } else {
        // Não casou. NÃO seleciona nada por conta própria — só mostra o que o
        // mapa achou e deixa a pessoa confirmar ou corrigir na lista.
        setSugestao(detectado);
      }
    },
    [zones]
  );

  const zone = zones.find((z) => normalizar(z.neighborhood) === normalizar(form.neighborhood));

  function trocarBairro(event) {
    const valor = event.target.value;
    if (valor === FORA) {
      setForaDaLista(true);
      setForm((current) => ({ ...current, neighborhood: sugestao || '' }));
    } else {
      setForaDaLista(false);
      setForm((current) => ({ ...current, neighborhood: valor }));
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    const next = {};
    if (!form.street.trim()) next.street = 'Informe a rua.';
    if (!form.number.trim()) next.number = 'Informe o número.';
    if (!form.neighborhood.trim()) next.neighborhood = 'Escolha ou informe o bairro.';

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    onSave({
      ...form,
      neighborhood: form.neighborhood.trim(),
      zip: form.zip.replace(/\D/g, '') || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      <MapPicker lat={form.lat} lng={form.lng} onChange={aplicarDoMapa} />

      <Input label="Identificação" value={form.label} onChange={set('label')} placeholder="Casa, Trabalho..." />

      <div className="grid grid-cols-[1fr_88px] gap-3">
        <Input label="Rua" value={form.street} onChange={set('street')} error={errors.street} required />
        <Input label="Número" value={form.number} onChange={set('number')} error={errors.number} required />
      </div>

      <Input label="Complemento" value={form.complement || ''} onChange={set('complement')} placeholder="Apto, bloco, casa dos fundos" />

      <Select
        label="Bairro"
        value={foraDaLista ? FORA : form.neighborhood}
        onChange={trocarBairro}
        required
      >
        <option value="">Selecione o bairro</option>
        {zones.map((z) => (
          <option key={z.id} value={z.neighborhood}>
            {z.neighborhood} — {z.fee_cents === 0 ? 'grátis' : formatBRL(z.fee_cents)}
          </option>
        ))}
        <option value={FORA}>Meu bairro não está na lista</option>
      </Select>
      {errors.neighborhood && <p className="-mt-2 text-xs text-danger">{errors.neighborhood}</p>}

      {sugestao && !foraDaLista && !zone && (
        <p className="-mt-2 flex items-start gap-1.5 rounded-lg bg-ink-300 p-2.5 text-[11px] text-cream-muted">
          <MapPinned size={13} className="mt-0.5 shrink-0 text-vinho-300" />
          <span>
            Pelo mapa, você está em <span className="text-cream">{sugestao}</span> — que não está
            na nossa lista. Confirme o bairro acima ou escolha “não está na lista”.
          </span>
        </p>
      )}

      {foraDaLista && (
        <>
          <Input
            label="Qual o bairro?"
            value={form.neighborhood}
            onChange={set('neighborhood')}
            placeholder="Nome do bairro"
            error={errors.neighborhood}
          />
          <p className="-mt-2 flex items-start gap-1.5 rounded-lg border border-ember/30 bg-ember/10 p-2.5 text-[11px] text-cream-muted">
            <Info size={13} className="mt-0.5 shrink-0 text-ember" />
            <span>
              Ainda não temos taxa fechada para este bairro. Seu pedido entra normalmente e a
              gente combina o valor da entrega por telefone antes de sair.
            </span>
          </p>
        </>
      )}

      {zone && !foraDaLista && (
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
