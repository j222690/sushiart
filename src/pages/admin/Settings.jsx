import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Store, Clock, Bike, Save } from 'lucide-react';
import { Badge, Button, Card, Input, Skeleton, Switch } from '../../components/ui';
import ImageUpload from '../../components/admin/ImageUpload';
import { adminSettings, adminZones, adminHours } from '../../lib/adminApi';
import { useStore } from '../../context/StoreContext';
import { useToast } from '../../context/ToastContext';
import { centsToInput, formatBRL, parseBRLToCents, shortHour, WEEKDAYS } from '../../lib/format';

export default function Settings() {
  const toast = useToast();
  const { reload: reloadStore } = useStore();

  const [restaurant, setRestaurant] = useState(null);
  const [zones, setZones] = useState([]);
  const [hours, setHours] = useState([]);
  const [saving, setSaving] = useState(false);

  const [newZone, setNewZone] = useState({ neighborhood: '', fee: '', eta_min: 45, min_order: '' });
  const [newHour, setNewHour] = useState({ weekday: 2, opens_at: '18:30', closes_at: '23:30' });

  const load = useCallback(async () => {
    try {
      const [r, z, h] = await Promise.all([
        adminSettings.restaurant(),
        adminZones.list('neighborhood'),
        adminHours.list('weekday'),
      ]);
      setRestaurant({
        ...r,
        min_order_input: centsToInput(r.min_order_cents),
      });
      setZones(z);
      setHours(h);
    } catch (error) {
      toast.error(error.message);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveRestaurant() {
    setSaving(true);
    try {
      const { min_order_input, id, updated_at, ...rest } = restaurant;
      await adminSettings.saveRestaurant({
        ...rest,
        min_order_cents: parseBRLToCents(min_order_input) || 0,
        prep_time_min: Number(restaurant.prep_time_min) || 40,
        delivery_time_min: Number(restaurant.delivery_time_min) || 20,
      });
      await reloadStore();
      toast.success('Configurações salvas.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function addZone() {
    if (!newZone.neighborhood.trim()) return toast.error('Informe o bairro.');
    try {
      await adminZones.create({
        neighborhood: newZone.neighborhood.trim(),
        fee_cents: parseBRLToCents(newZone.fee),
        eta_min: Number(newZone.eta_min) || 45,
        min_order_cents: parseBRLToCents(newZone.min_order) || 0,
      });
      setNewZone({ neighborhood: '', fee: '', eta_min: 45, min_order: '' });
      await load();
      await reloadStore();
      toast.success('Bairro adicionado.');
    } catch (error) {
      toast.error(
        /duplicate key/i.test(error.message) ? 'Este bairro já está cadastrado.' : error.message
      );
    }
  }

  async function updateZone(zone, patch) {
    setZones((current) => current.map((z) => (z.id === zone.id ? { ...z, ...patch } : z)));
    try {
      await adminZones.update(zone.id, patch);
      await reloadStore();
    } catch (error) {
      toast.error(error.message);
      await load();
    }
  }

  async function addHour() {
    try {
      await adminHours.create({
        weekday: Number(newHour.weekday),
        opens_at: newHour.opens_at,
        closes_at: newHour.closes_at,
      });
      await load();
      await reloadStore();
      toast.success('Horário adicionado.');
    } catch (error) {
      toast.error(error.message);
    }
  }

  if (!restaurant) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const set = (field) => (e) => setRestaurant((c) => ({ ...c, [field]: e.target.value }));

  return (
    <div>
      <header className="mb-5">
        <h1 className="font-brand text-2xl text-cream">Configurações</h1>
        <p className="text-sm text-cream-muted">
          Dados do restaurante, horários e taxas de entrega.
        </p>
      </header>

      {/* Dados do restaurante */}
      <Card className="mb-5 p-4">
        <h2 className="mb-4 flex items-center gap-2 font-brand text-lg text-cream">
          <Store size={17} className="text-vinho-300" /> Dados do restaurante
        </h2>

        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Nome" value={restaurant.name} onChange={set('name')} />
          <Input label="Tagline" value={restaurant.tagline} onChange={set('tagline')} />

          <Input label="Telefone" value={restaurant.phone ?? ''} onChange={set('phone')} />
          <Input
            label="WhatsApp"
            value={restaurant.whatsapp ?? ''}
            onChange={set('whatsapp')}
            hint="Só números, com DDI e DDD: 5549999999999"
          />

          <Input
            className="md:col-span-2"
            label="Instagram"
            value={restaurant.instagram ?? ''}
            onChange={set('instagram')}
            hint="URL completa, começando com https://"
          />

          <Input label="Rua" value={restaurant.address_street ?? ''} onChange={set('address_street')} />
          <Input label="Número" value={restaurant.address_number ?? ''} onChange={set('address_number')} />
          <Input
            label="Bairro"
            value={restaurant.address_neighborhood ?? ''}
            onChange={set('address_neighborhood')}
          />
          <Input label="Cidade" value={restaurant.address_city ?? ''} onChange={set('address_city')} />

          <Input
            label="Pedido mínimo"
            inputMode="decimal"
            value={restaurant.min_order_input}
            onChange={(e) => setRestaurant((c) => ({ ...c, min_order_input: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Preparo (min)"
              type="number"
              value={restaurant.prep_time_min}
              onChange={set('prep_time_min')}
            />
            <Input
              label="Entrega (min)"
              type="number"
              value={restaurant.delivery_time_min}
              onChange={set('delivery_time_min')}
            />
          </div>

          <div className="md:col-span-2">
            <ImageUpload
              label="Logo (opcional — o app já traz a marca desenhada)"
              folder="marca"
              value={restaurant.logo_url}
              onChange={(url) => setRestaurant((c) => ({ ...c, logo_url: url }))}
            />
          </div>
        </div>

        <div className="mt-4 space-y-3 rounded-xl border border-line bg-ink-300 p-4">
          <Switch
            checked={restaurant.accepting_orders}
            onChange={(v) => setRestaurant((c) => ({ ...c, accepting_orders: v }))}
            label="Aceitando pedidos"
            description="Chave-geral: desligada, o app não deixa fechar pedido mesmo dentro do horário"
          />
          <Switch
            checked={restaurant.delivery_enabled}
            onChange={(v) => setRestaurant((c) => ({ ...c, delivery_enabled: v }))}
            label="Entrega disponível"
          />
          <Switch
            checked={restaurant.pickup_enabled}
            onChange={(v) => setRestaurant((c) => ({ ...c, pickup_enabled: v }))}
            label="Retirada no local disponível"
          />
        </div>

        <Button className="mt-4" loading={saving} onClick={saveRestaurant}>
          <Save size={15} /> Salvar dados
        </Button>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Horários */}
        <Card className="p-4">
          <h2 className="mb-4 flex items-center gap-2 font-brand text-lg text-cream">
            <Clock size={17} className="text-vinho-300" /> Horário de funcionamento
          </h2>

          <div className="mb-4 space-y-2">
            {WEEKDAYS.map((day, weekday) => {
              const slots = hours.filter((h) => h.weekday === weekday);
              return (
                <div key={day} className="rounded-xl border border-line bg-ink-300 p-3">
                  <div className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-sm text-cream">{day}</span>
                    <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                      {slots.length === 0 && (
                        <span className="text-xs text-cream-faint">Fechado</span>
                      )}
                      {slots.map((slot) => (
                        <span
                          key={slot.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-ink-100 px-2 py-1 text-xs text-cream-muted"
                        >
                          {shortHour(slot.opens_at)} – {shortHour(slot.closes_at)}
                          {!slot.active && <Badge tone="neutral">off</Badge>}
                          <button
                            type="button"
                            aria-label="Remover horário"
                            onClick={async () => {
                              await adminHours.remove(slot.id);
                              await load();
                              await reloadStore();
                            }}
                            className="text-cream-faint hover:text-danger"
                          >
                            <Trash2 size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
            <label className="flex-1">
              <span className="mb-1.5 block text-xs text-cream-muted">Dia</span>
              <select
                value={newHour.weekday}
                onChange={(e) => setNewHour((c) => ({ ...c, weekday: e.target.value }))}
                className="h-10 w-full rounded-xl border border-line bg-ink-300 px-2 text-sm text-cream"
              >
                {WEEKDAYS.map((day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-xs text-cream-muted">Abre</span>
              <input
                type="time"
                value={newHour.opens_at}
                onChange={(e) => setNewHour((c) => ({ ...c, opens_at: e.target.value }))}
                className="h-10 rounded-xl border border-line bg-ink-300 px-2 text-sm text-cream"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs text-cream-muted">Fecha</span>
              <input
                type="time"
                value={newHour.closes_at}
                onChange={(e) => setNewHour((c) => ({ ...c, closes_at: e.target.value }))}
                className="h-10 rounded-xl border border-line bg-ink-300 px-2 text-sm text-cream"
              />
            </label>
            <Button size="md" onClick={addHour}>
              <Plus size={15} />
            </Button>
          </div>

          <p className="mt-2 text-[11px] text-cream-faint">
            Para virada de madrugada (ex: 19h às 00h30), cadastre até 23:59 — o app usa o fuso de
            São Paulo para decidir se está aberto.
          </p>
        </Card>

        {/* Taxas de entrega */}
        <Card className="p-4">
          <h2 className="mb-4 flex items-center gap-2 font-brand text-lg text-cream">
            <Bike size={17} className="text-vinho-300" /> Taxas de entrega por bairro
          </h2>

          <p className="mb-3 text-xs text-cream-faint">
            Bairro não cadastrado = fora da área. O cliente vê isso antes de tentar fechar o pedido.
          </p>

          <div className="mb-4 max-h-96 space-y-2 overflow-y-auto pr-1">
            {zones.map((zone) => (
              <div
                key={zone.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-ink-300 p-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-cream">{zone.neighborhood}</span>

                <input
                  type="text"
                  inputMode="decimal"
                  defaultValue={centsToInput(zone.fee_cents)}
                  onBlur={(e) => {
                    const cents = parseBRLToCents(e.target.value);
                    if (cents !== zone.fee_cents) updateZone(zone, { fee_cents: cents });
                  }}
                  aria-label={`Taxa de ${zone.neighborhood}`}
                  className="h-9 w-20 rounded-lg border border-line bg-ink-500 px-2 text-right text-sm text-cream"
                />

                <input
                  type="number"
                  defaultValue={zone.eta_min}
                  onBlur={(e) => {
                    const eta = Number(e.target.value) || 45;
                    if (eta !== zone.eta_min) updateZone(zone, { eta_min: eta });
                  }}
                  aria-label={`Tempo de entrega em ${zone.neighborhood}`}
                  className="h-9 w-16 rounded-lg border border-line bg-ink-500 px-2 text-right text-sm text-cream"
                />
                <span className="text-[11px] text-cream-faint">min</span>

                <Switch
                  checked={zone.active}
                  onChange={(v) => updateZone(zone, { active: v })}
                  label=""
                />

                <button
                  type="button"
                  aria-label={`Excluir ${zone.neighborhood}`}
                  onClick={async () => {
                    if (!window.confirm(`Excluir o bairro ${zone.neighborhood}?`)) return;
                    try {
                      await adminZones.remove(zone.id);
                      await load();
                      await reloadStore();
                    } catch {
                      toast.error('Bairro usado em pedidos antigos. Desative-o em vez de excluir.');
                    }
                  }}
                  className="rounded p-1 text-cream-faint hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-line pt-4 sm:grid-cols-4">
            <Input
              className="col-span-2"
              placeholder="Bairro"
              value={newZone.neighborhood}
              onChange={(e) => setNewZone((c) => ({ ...c, neighborhood: e.target.value }))}
            />
            <Input
              placeholder="Taxa"
              inputMode="decimal"
              value={newZone.fee}
              onChange={(e) => setNewZone((c) => ({ ...c, fee: e.target.value }))}
            />
            <Input
              placeholder="Min"
              type="number"
              value={newZone.eta_min}
              onChange={(e) => setNewZone((c) => ({ ...c, eta_min: e.target.value }))}
            />
            <Button className="col-span-2 sm:col-span-4" onClick={addZone}>
              <Plus size={15} /> Adicionar bairro
            </Button>
          </div>

          <p className="mt-3 text-[11px] text-cream-faint">
            Total de {zones.filter((z) => z.active).length} bairros atendidos · taxa média{' '}
            {formatBRL(
              zones.length
                ? Math.round(zones.reduce((sum, z) => sum + z.fee_cents, 0) / zones.length)
                : 0
            )}
          </p>
        </Card>
      </div>

      {/* Equipe */}
      <Card className="mt-5 p-4">
        <h2 className="mb-2 font-brand text-lg text-cream">Acesso da equipe</h2>
        <p className="text-sm text-cream-muted">
          Quem entra no painel é definido na tabela <code className="text-vinho-200">staff</code>.
          Para liberar alguém: a pessoa cria a conta no app do cliente e você insere o usuário dela
          na tabela pelo SQL Editor do Supabase.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-ink-800 p-3.5 text-[11px] leading-relaxed text-cream-muted">
{`insert into staff (user_id, name, role)
select id, 'Nome da pessoa', 'operador'
from auth.users where email = 'pessoa@exemplo.com';`}
        </pre>
        <p className="mt-2 text-[11px] text-cream-faint">
          Use <strong>admin</strong> para acesso total e <strong>operador</strong> para a operação
          do dia a dia.
        </p>
      </Card>
    </div>
  );
}
