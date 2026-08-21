import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Pencil, Gift, Sparkles } from 'lucide-react';
import { Badge, Button, Card, Input, Select, Sheet, Skeleton, Switch } from '../../components/ui';
import { adminPrizes, adminSettings } from '../../lib/adminApi';
import { useToast } from '../../context/ToastContext';
import { centsToInput, formatBRL, parseBRLToCents } from '../../lib/format';

const PRIZE_KINDS = {
  percentual: 'Desconto percentual',
  fixo: 'Desconto em reais',
  frete_gratis: 'Frete grátis',
  brinde: 'Brinde',
  nada: 'Não foi dessa vez',
};

const EMPTY_PRIZE = {
  label: '',
  prize_kind: 'percentual',
  discount_percent: '10',
  discount_cents: '',
  gift_description: '',
  min_order_cents: '',
  weight: 10,
  color: '#8B2635',
  active: true,
  sort_order: 0,
};

export default function RouletteAdmin() {
  const toast = useToast();

  const [prizes, setPrizes] = useState(null);
  const [config, setConfig] = useState(null);
  const [loyalty, setLoyalty] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [form, setForm] = useState(EMPTY_PRIZE);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, c, l] = await Promise.all([
        adminPrizes.list('sort_order'),
        adminSettings.rouletteConfig(),
        adminSettings.loyaltyConfig(),
      ]);
      setPrizes(p);
      setConfig(c);
      setLoyalty({
        ...l,
        reward_cents_input: centsToInput(l.reward_cents),
      });
    } catch (error) {
      toast.error(error.message);
      setPrizes([]);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  /** Peso é relativo: a chance real é peso ÷ soma dos pesos ativos. */
  const totalWeight = useMemo(
    () => (prizes ?? []).filter((p) => p.active).reduce((sum, p) => sum + p.weight, 0),
    [prizes]
  );

  function openPrize(prize) {
    if (prize === 'novo') {
      setForm({ ...EMPTY_PRIZE, sort_order: (prizes?.length ?? 0) + 1 });
    } else {
      setForm({
        ...prize,
        prize_kind: prize.prize_kind ?? 'nada',
        discount_percent: prize.discount_percent ?? '',
        discount_cents: centsToInput(prize.discount_cents),
        min_order_cents: centsToInput(prize.min_order_cents),
      });
    }
    setSheet(prize);
  }

  async function savePrize() {
    if (!form.label.trim()) return toast.error('Dê um nome ao prêmio (aparece na roda).');

    const kind = form.prize_kind === 'nada' ? null : form.prize_kind;
    const payload = {
      label: form.label.trim(),
      prize_kind: kind,
      discount_percent: kind === 'percentual' ? Number(form.discount_percent) || null : null,
      discount_cents: kind === 'fixo' ? parseBRLToCents(form.discount_cents) || null : null,
      gift_description: kind === 'brinde' ? form.gift_description?.trim() || null : null,
      min_order_cents: parseBRLToCents(form.min_order_cents) || 0,
      weight: Math.max(0, Number(form.weight) || 0),
      color: form.color,
      active: form.active,
      sort_order: Number(form.sort_order) || 0,
    };

    if (kind === 'percentual' && !payload.discount_percent) {
      return toast.error('Informe o percentual do prêmio.');
    }
    if (kind === 'fixo' && !payload.discount_cents) {
      return toast.error('Informe o valor do prêmio.');
    }

    setSaving(true);
    try {
      if (sheet === 'novo') await adminPrizes.create(payload);
      else await adminPrizes.update(sheet.id, payload);
      toast.success('Prêmio salvo.');
      setSheet(null);
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveConfig(patch) {
    setConfig((c) => ({ ...c, ...patch }));
    try {
      await adminSettings.saveRouletteConfig(patch);
    } catch (error) {
      toast.error(error.message);
      await load();
    }
  }

  async function saveLoyalty() {
    setSaving(true);
    try {
      await adminSettings.saveLoyaltyConfig({
        active: loyalty.active,
        points_per_real: Number(loyalty.points_per_real) || 1,
        points_to_reward: Number(loyalty.points_to_reward) || 100,
        reward_kind: loyalty.reward_kind,
        reward_percent: loyalty.reward_kind === 'percentual' ? Number(loyalty.reward_percent) || null : null,
        reward_cents:
          loyalty.reward_kind === 'fixo' ? parseBRLToCents(loyalty.reward_cents_input) || null : null,
        expire_days: loyalty.expire_days ? Number(loyalty.expire_days) : null,
      });
      toast.success('Programa de fidelidade salvo.');
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  if (prizes === null || !config || !loyalty) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div>
      <header className="mb-5">
        <h1 className="font-brand text-2xl text-cream">Roleta e fidelidade</h1>
        <p className="text-sm text-cream-muted">
          Configure os prêmios, as probabilidades e como o cliente acumula pontos.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Configuração da roleta */}
        <Card className="space-y-4 p-4">
          <h2 className="flex items-center gap-2 font-brand text-lg text-cream">
            <Gift size={17} className="text-vinho-300" /> Regras da roleta
          </h2>

          <Switch
            checked={config.active}
            onChange={(v) => saveConfig({ active: v })}
            label="Roleta ativa"
            description="Desligada, some do app do cliente"
          />

          <Select
            label="Quando o cliente pode girar"
            value={config.spin_rule}
            onChange={(e) => saveConfig({ spin_rule: e.target.value })}
          >
            <option value="dia">A cada X horas</option>
            <option value="pedido">Um giro por pedido entregue</option>
          </Select>

          {config.spin_rule === 'dia' && (
            <Input
              label="Intervalo entre giros (horas)"
              type="number"
              min={1}
              value={config.cooldown_hours}
              onChange={(e) => saveConfig({ cooldown_hours: Number(e.target.value) || 24 })}
            />
          )}

          <Input
            label="Validade do cupom ganho (horas)"
            type="number"
            min={1}
            value={config.prize_validity_hours}
            onChange={(e) => saveConfig({ prize_validity_hours: Number(e.target.value) || 48 })}
            hint="Prazo curto cria urgência e traz o cliente de volta."
          />
        </Card>

        {/* Prêmios */}
        <Card className="p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-brand text-lg text-cream">Prêmios da roda</h2>
            <Button size="sm" onClick={() => openPrize('novo')}>
              <Plus size={14} /> Novo prêmio
            </Button>
          </div>

          <p className="mb-3 text-xs text-cream-faint">
            A chance de cada prêmio é o peso dividido pela soma dos pesos ativos
            {totalWeight > 0 ? ` (hoje: ${totalWeight})` : ''}.
          </p>

          <div className="space-y-2">
            {prizes.map((prize) => {
              const chance = totalWeight > 0 && prize.active ? (prize.weight / totalWeight) * 100 : 0;
              return (
                <div
                  key={prize.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-ink-300 p-3"
                >
                  <span
                    className="h-8 w-8 shrink-0 rounded-lg border border-line"
                    style={{ background: prize.color }}
                    aria-hidden="true"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-cream">{prize.label}</p>
                      {!prize.active && <Badge tone="neutral">Inativo</Badge>}
                      {!prize.prize_kind && <Badge tone="neutral">Sem prêmio</Badge>}
                    </div>
                    <p className="text-[11px] text-cream-faint">
                      {prize.min_order_cents > 0 && `mín. ${formatBRL(prize.min_order_cents)} · `}
                      peso {prize.weight}
                    </p>
                  </div>

                  <div className="w-28 shrink-0">
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className="h-full rounded-full bg-vinho-500"
                        style={{ width: `${Math.min(100, chance)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-right text-[11px] tabular-nums text-cream-muted">
                      {chance.toFixed(1)}%
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openPrize(prize)}>
                      <Pencil size={14} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger"
                      onClick={async () => {
                        if (!window.confirm(`Excluir o prêmio "${prize.label}"?`)) return;
                        try {
                          await adminPrizes.remove(prize.id);
                          await load();
                        } catch {
                          toast.error('Prêmio já sorteado. Desative-o em vez de excluir.');
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Fidelidade */}
      <Card className="mt-5 p-4">
        <h2 className="mb-4 flex items-center gap-2 font-brand text-lg text-cream">
          <Sparkles size={17} className="text-ember" /> Programa de fidelidade
        </h2>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="md:col-span-2 xl:col-span-4">
            <Switch
              checked={loyalty.active}
              onChange={(v) => setLoyalty((c) => ({ ...c, active: v }))}
              label="Programa ativo"
              description="Pontos são creditados quando o pedido é marcado como entregue"
            />
          </div>

          <Input
            label="Pontos por R$ 1"
            type="number"
            step="0.5"
            min={0.5}
            value={loyalty.points_per_real}
            onChange={(e) => setLoyalty((c) => ({ ...c, points_per_real: e.target.value }))}
          />

          <Input
            label="Pontos para a recompensa"
            type="number"
            min={1}
            value={loyalty.points_to_reward}
            onChange={(e) => setLoyalty((c) => ({ ...c, points_to_reward: e.target.value }))}
          />

          <Select
            label="Tipo de recompensa"
            value={loyalty.reward_kind}
            onChange={(e) => setLoyalty((c) => ({ ...c, reward_kind: e.target.value }))}
          >
            <option value="fixo">Desconto em reais</option>
            <option value="percentual">Desconto percentual</option>
            <option value="frete_gratis">Frete grátis</option>
          </Select>

          {loyalty.reward_kind === 'fixo' && (
            <Input
              label="Valor do desconto"
              inputMode="decimal"
              value={loyalty.reward_cents_input ?? ''}
              onChange={(e) => setLoyalty((c) => ({ ...c, reward_cents_input: e.target.value }))}
            />
          )}

          {loyalty.reward_kind === 'percentual' && (
            <Input
              label="Percentual (%)"
              type="number"
              min={1}
              max={100}
              value={loyalty.reward_percent ?? ''}
              onChange={(e) => setLoyalty((c) => ({ ...c, reward_percent: e.target.value }))}
            />
          )}

          <Input
            label="Validade dos pontos (dias)"
            type="number"
            placeholder="sem expiração"
            value={loyalty.expire_days ?? ''}
            onChange={(e) => setLoyalty((c) => ({ ...c, expire_days: e.target.value }))}
          />
        </div>

        <Button className="mt-4" loading={saving} onClick={saveLoyalty}>
          Salvar fidelidade
        </Button>
      </Card>

      {/* Sheet do prêmio */}
      <Sheet
        open={Boolean(sheet)}
        onClose={() => setSheet(null)}
        title={sheet === 'novo' ? 'Novo prêmio' : 'Editar prêmio'}
        footer={
          <Button className="w-full" loading={saving} onClick={savePrize}>
            Salvar prêmio
          </Button>
        }
      >
        <div className="space-y-4">
          <Input
            label="Texto na roda"
            value={form.label}
            onChange={(e) => setForm((c) => ({ ...c, label: e.target.value }))}
            placeholder="10% OFF"
            hint="Curto: textos longos são cortados no gomo."
          />

          <Select
            label="Tipo de prêmio"
            value={form.prize_kind}
            onChange={(e) => setForm((c) => ({ ...c, prize_kind: e.target.value }))}
          >
            {Object.entries(PRIZE_KINDS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>

          {form.prize_kind === 'percentual' && (
            <Input
              label="Percentual (%)"
              type="number"
              min={1}
              max={100}
              value={form.discount_percent}
              onChange={(e) => setForm((c) => ({ ...c, discount_percent: e.target.value }))}
            />
          )}

          {form.prize_kind === 'fixo' && (
            <Input
              label="Valor do desconto"
              inputMode="decimal"
              value={form.discount_cents}
              onChange={(e) => setForm((c) => ({ ...c, discount_cents: e.target.value }))}
            />
          )}

          {form.prize_kind === 'brinde' && (
            <Input
              label="Descrição do brinde"
              value={form.gift_description ?? ''}
              onChange={(e) => setForm((c) => ({ ...c, gift_description: e.target.value }))}
              placeholder="Hot roll (8 peças) grátis"
              hint="Aparece na comanda para a cozinha incluir."
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Pedido mínimo"
              inputMode="decimal"
              placeholder="0,00"
              value={form.min_order_cents}
              onChange={(e) => setForm((c) => ({ ...c, min_order_cents: e.target.value }))}
            />
            <Input
              label="Peso (chance)"
              type="number"
              min={0}
              value={form.weight}
              onChange={(e) => setForm((c) => ({ ...c, weight: e.target.value }))}
              hint="Maior = mais provável"
            />
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-cream-muted">Cor do gomo</span>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm((c) => ({ ...c, color: e.target.value }))}
                className="h-11 w-16 cursor-pointer rounded-lg border border-line bg-ink-300"
              />
              <div className="flex gap-1.5">
                {['#8B2635', '#611A1B', '#C9803F', '#1E1E1E'].map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setForm((c) => ({ ...c, color }))}
                    aria-label={`Usar a cor ${color}`}
                    className="h-8 w-8 rounded-lg border border-line"
                    style={{ background: color }}
                  />
                ))}
              </div>
            </div>
          </label>

          <div className="rounded-xl border border-line bg-ink-300 p-4">
            <Switch
              checked={form.active}
              onChange={(v) => setForm((c) => ({ ...c, active: v }))}
              label="Prêmio ativo"
              description="Inativo sai da roda e do sorteio"
            />
          </div>
        </div>
      </Sheet>
    </div>
  );
}
