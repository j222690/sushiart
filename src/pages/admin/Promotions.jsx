import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Ticket, Flame, Image as ImageIcon } from 'lucide-react';
import clsx from 'clsx';
import ImageUpload from '../../components/admin/ImageUpload';
import { Badge, Button, Card, Input, Select, Sheet, Skeleton, Switch, Textarea } from '../../components/ui';
import { adminBanners, adminCoupons, adminOffers, adminProducts } from '../../lib/adminApi';
import { useToast } from '../../context/ToastContext';
import { centsToInput, formatBRL, formatDateTime, parseBRLToCents } from '../../lib/format';
import { DISCOUNT_KINDS } from '../../lib/constants';

/** ISO -> valor aceito por <input type="datetime-local"> (hora local). */
function toLocalInput(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null);

const EMPTY_COUPON = {
  code: '',
  description: '',
  discount_kind: 'percentual',
  discount_percent: '10',
  discount_cents: '',
  max_discount_cents: '',
  min_order_cents: '',
  valid_until: '',
  usage_limit: '',
  usage_limit_per_customer: 1,
  is_public: true,
  active: true,
};

export default function Promotions() {
  const toast = useToast();
  const [tab, setTab] = useState('cupons');

  const [coupons, setCoupons] = useState(null);
  const [offers, setOffers] = useState([]);
  const [banners, setBanners] = useState([]);
  const [products, setProducts] = useState([]);

  const [couponSheet, setCouponSheet] = useState(null);
  const [couponForm, setCouponForm] = useState(EMPTY_COUPON);
  const [offerSheet, setOfferSheet] = useState(null);
  const [offerForm, setOfferForm] = useState({});
  const [bannerSheet, setBannerSheet] = useState(null);
  const [bannerForm, setBannerForm] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, o, b, p] = await Promise.all([
        adminCoupons.list('created_at', false),
        adminOffers.list('sort_order'),
        adminBanners.list('sort_order'),
        adminProducts.listWithCategory(),
      ]);
      setCoupons(c);
      setOffers(o);
      setBanners(b);
      setProducts(p);
    } catch (error) {
      toast.error(error.message);
      setCoupons([]);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // ------------------------------------------------------------------ cupons
  function openCoupon(coupon) {
    if (coupon === 'novo') {
      setCouponForm(EMPTY_COUPON);
    } else {
      setCouponForm({
        ...coupon,
        discount_percent: coupon.discount_percent ?? '',
        discount_cents: centsToInput(coupon.discount_cents),
        max_discount_cents: centsToInput(coupon.max_discount_cents),
        min_order_cents: centsToInput(coupon.min_order_cents),
        valid_until: toLocalInput(coupon.valid_until),
        usage_limit: coupon.usage_limit ?? '',
      });
    }
    setCouponSheet(coupon);
  }

  async function saveCoupon() {
    const code = couponForm.code.trim().toUpperCase();
    if (!code) return toast.error('Informe o código do cupom.');

    const kind = couponForm.discount_kind;
    const payload = {
      code,
      description: couponForm.description?.trim() || null,
      discount_kind: kind,
      // Enviamos só o campo que corresponde ao tipo: o CHECK da tabela recusa
      // um cupom percentual sem percentual (ou fixo sem valor).
      discount_percent: kind === 'percentual' ? Number(couponForm.discount_percent) || null : null,
      discount_cents: kind === 'fixo' ? parseBRLToCents(couponForm.discount_cents) || null : null,
      max_discount_cents:
        kind === 'percentual' && couponForm.max_discount_cents
          ? parseBRLToCents(couponForm.max_discount_cents)
          : null,
      min_order_cents: parseBRLToCents(couponForm.min_order_cents) || 0,
      valid_until: fromLocalInput(couponForm.valid_until),
      usage_limit: couponForm.usage_limit ? Number(couponForm.usage_limit) : null,
      usage_limit_per_customer: Number(couponForm.usage_limit_per_customer) || 1,
      is_public: couponForm.is_public,
      active: couponForm.active,
    };

    if (kind === 'percentual' && !payload.discount_percent) {
      return toast.error('Informe o percentual de desconto.');
    }
    if (kind === 'fixo' && !payload.discount_cents) {
      return toast.error('Informe o valor do desconto.');
    }

    setSaving(true);
    try {
      if (couponSheet === 'novo') await adminCoupons.create(payload);
      else await adminCoupons.update(couponSheet.id, payload);
      toast.success('Cupom salvo.');
      setCouponSheet(null);
      await load();
    } catch (error) {
      toast.error(
        /duplicate key/i.test(error.message) ? 'Já existe um cupom com esse código.' : error.message
      );
    } finally {
      setSaving(false);
    }
  }

  // ------------------------------------------------------------------ ofertas
  function openOffer(offer) {
    setOfferForm(
      offer === 'nova'
        ? {
            product_id: products[0]?.id ?? '',
            title: '',
            badge: 'Oferta do dia',
            offer_price: '',
            starts_at: toLocalInput(new Date().toISOString()),
            ends_at: '',
            active: true,
            sort_order: offers.length + 1,
          }
        : {
            ...offer,
            offer_price: centsToInput(offer.offer_price_cents),
            starts_at: toLocalInput(offer.starts_at),
            ends_at: toLocalInput(offer.ends_at),
          }
    );
    setOfferSheet(offer);
  }

  async function saveOffer() {
    const priceCents = parseBRLToCents(offerForm.offer_price);
    const product = products.find((p) => p.id === offerForm.product_id);

    if (!product) return toast.error('Escolha o produto da oferta.');
    if (priceCents <= 0) return toast.error('Informe o preço promocional.');
    if (priceCents >= product.price_cents) {
      return toast.error(
        `O preço da oferta precisa ser menor que ${formatBRL(product.price_cents)}.`
      );
    }

    const payload = {
      product_id: offerForm.product_id,
      title: offerForm.title?.trim() || product.name,
      badge: offerForm.badge?.trim() || null,
      offer_price_cents: priceCents,
      image_url: offerForm.image_url ?? null,
      starts_at: fromLocalInput(offerForm.starts_at) ?? new Date().toISOString(),
      ends_at: fromLocalInput(offerForm.ends_at),
      active: offerForm.active,
      sort_order: Number(offerForm.sort_order) || 0,
    };

    setSaving(true);
    try {
      if (offerSheet === 'nova') await adminOffers.create(payload);
      else await adminOffers.update(offerSheet.id, payload);
      toast.success('Oferta salva.');
      setOfferSheet(null);
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  // ------------------------------------------------------------------ banners
  function openBanner(banner) {
    setBannerForm(
      banner === 'novo'
        ? {
            title: '',
            subtitle: '',
            link_type: 'ofertas',
            link_value: '',
            active: true,
            sort_order: banners.length + 1,
          }
        : { ...banner, starts_at: toLocalInput(banner.starts_at), ends_at: toLocalInput(banner.ends_at) }
    );
    setBannerSheet(banner);
  }

  async function saveBanner() {
    if (!bannerForm.title?.trim()) return toast.error('Informe o título do banner.');

    // Link externo só é aceito com esquema http(s): um `javascript:` salvo aqui
    // viraria execução no navegador de quem toca no banner.
    if (bannerForm.link_type === 'url' && !/^https?:\/\//i.test(bannerForm.link_value || '')) {
      return toast.error('O link precisa começar com http:// ou https://');
    }

    const payload = {
      title: bannerForm.title.trim(),
      subtitle: bannerForm.subtitle?.trim() || null,
      image_url: bannerForm.image_url ?? null,
      link_type: bannerForm.link_type,
      link_value: bannerForm.link_value?.trim() || null,
      starts_at: fromLocalInput(bannerForm.starts_at),
      ends_at: fromLocalInput(bannerForm.ends_at),
      active: bannerForm.active,
      sort_order: Number(bannerForm.sort_order) || 0,
    };

    setSaving(true);
    try {
      if (bannerSheet === 'novo') await adminBanners.create(payload);
      else await adminBanners.update(bannerSheet.id, payload);
      toast.success('Banner salvo.');
      setBannerSheet(null);
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  const TABS = [
    { key: 'cupons', label: 'Cupons', icon: Ticket },
    { key: 'ofertas', label: 'Ofertas', icon: Flame },
    { key: 'banners', label: 'Banners', icon: ImageIcon },
  ];

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-brand text-2xl text-cream">Promoções</h1>
          <p className="text-sm text-cream-muted">Cupons, ofertas em destaque e banners da home.</p>
        </div>

        <Button
          onClick={() =>
            tab === 'cupons' ? openCoupon('novo') : tab === 'ofertas' ? openOffer('nova') : openBanner('novo')
          }
        >
          <Plus size={15} />
          {tab === 'cupons' ? 'Novo cupom' : tab === 'ofertas' ? 'Nova oferta' : 'Novo banner'}
        </Button>
      </header>

      <div className="mb-4 flex gap-2 border-b border-line">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={clsx(
              '-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === key
                ? 'border-vinho-500 text-cream'
                : 'border-transparent text-cream-muted hover:text-cream'
            )}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* --------------------------------- Cupons --------------------------------- */}
      {tab === 'cupons' &&
        (coupons === null ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="space-y-2">
            {coupons.map((coupon) => {
              const expired = coupon.valid_until && new Date(coupon.valid_until) < new Date();
              return (
                <Card key={coupon.id} className="flex flex-wrap items-center gap-3 p-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold tracking-wider text-cream">
                        {coupon.code}
                      </span>
                      {!coupon.active && <Badge tone="neutral">Inativo</Badge>}
                      {expired && <Badge tone="danger">Expirado</Badge>}
                      {coupon.source !== 'admin' && <Badge tone="ember">{coupon.source}</Badge>}
                      {coupon.is_public && <Badge tone="info">Público</Badge>}
                    </div>

                    <p className="mt-1 text-xs text-cream-muted">
                      {coupon.discount_kind === 'percentual'
                        ? `${Number(coupon.discount_percent)}% OFF`
                        : coupon.discount_kind === 'fixo'
                          ? `${formatBRL(coupon.discount_cents)} OFF`
                          : DISCOUNT_KINDS[coupon.discount_kind]}
                      {coupon.min_order_cents > 0 && ` · mín. ${formatBRL(coupon.min_order_cents)}`}
                      {coupon.valid_until && ` · até ${formatDateTime(coupon.valid_until)}`}
                    </p>

                    <p className="text-[11px] text-cream-faint">
                      Usado {coupon.used_count}
                      {coupon.usage_limit ? ` de ${coupon.usage_limit}` : ''} vezes
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openCoupon(coupon)}>
                      <Pencil size={15} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger"
                      onClick={async () => {
                        if (!window.confirm(`Excluir o cupom ${coupon.code}?`)) return;
                        try {
                          await adminCoupons.remove(coupon.id);
                          await load();
                        } catch {
                          toast.error('Este cupom já foi usado. Desative-o em vez de excluir.');
                        }
                      }}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        ))}

      {/* --------------------------------- Ofertas --------------------------------- */}
      {tab === 'ofertas' && (
        <div className="space-y-2">
          {offers.map((offer) => {
            const product = products.find((p) => p.id === offer.product_id);
            const ended = offer.ends_at && new Date(offer.ends_at) < new Date();
            return (
              <Card key={offer.id} className="flex flex-wrap items-center gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-cream">{offer.title}</p>
                    {!offer.active && <Badge tone="neutral">Inativa</Badge>}
                    {ended && <Badge tone="danger">Encerrada</Badge>}
                    {offer.badge && <Badge tone="vinho">{offer.badge}</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-cream-muted">
                    {product?.name} ·{' '}
                    <span className="line-through">{formatBRL(product?.price_cents ?? 0)}</span>{' '}
                    <strong className="text-cream">{formatBRL(offer.offer_price_cents)}</strong>
                  </p>
                  {offer.ends_at && (
                    <p className="text-[11px] text-cream-faint">
                      Termina em {formatDateTime(offer.ends_at)}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openOffer(offer)}>
                    <Pencil size={15} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    onClick={async () => {
                      if (!window.confirm('Excluir esta oferta?')) return;
                      await adminOffers.remove(offer.id);
                      await load();
                    }}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              </Card>
            );
          })}
          {offers.length === 0 && (
            <p className="py-10 text-center text-sm text-cream-faint">Nenhuma oferta cadastrada.</p>
          )}
        </div>
      )}

      {/* --------------------------------- Banners --------------------------------- */}
      {tab === 'banners' && (
        <div className="space-y-2">
          {banners.map((banner) => (
            <Card key={banner.id} className="flex flex-wrap items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-cream">{banner.title}</p>
                  {!banner.active && <Badge tone="neutral">Inativo</Badge>}
                </div>
                <p className="text-xs text-cream-muted">{banner.subtitle}</p>
                <p className="text-[11px] text-cream-faint">
                  Leva para: {banner.link_type}
                  {banner.link_value ? ` → ${banner.link_value}` : ''}
                </p>
              </div>

              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" onClick={() => openBanner(banner)}>
                  <Pencil size={15} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger"
                  onClick={async () => {
                    if (!window.confirm('Excluir este banner?')) return;
                    await adminBanners.remove(banner.id);
                    await load();
                  }}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            </Card>
          ))}
          {banners.length === 0 && (
            <p className="py-10 text-center text-sm text-cream-faint">Nenhum banner cadastrado.</p>
          )}
        </div>
      )}

      {/* --------------------------------- Sheets --------------------------------- */}
      <Sheet
        open={Boolean(couponSheet)}
        onClose={() => setCouponSheet(null)}
        size="lg"
        title={couponSheet === 'novo' ? 'Novo cupom' : 'Editar cupom'}
        footer={
          <Button className="w-full" loading={saving} onClick={saveCoupon}>
            Salvar cupom
          </Button>
        }
      >
        <div className="space-y-4">
          <Input
            label="Código"
            value={couponForm.code}
            onChange={(e) => setCouponForm((c) => ({ ...c, code: e.target.value.toUpperCase() }))}
            placeholder="BEMVINDO10"
            className="font-mono tracking-wider"
          />

          <Textarea
            label="Descrição"
            value={couponForm.description ?? ''}
            onChange={(e) => setCouponForm((c) => ({ ...c, description: e.target.value }))}
            placeholder="Aparece no app para o cliente"
          />

          <Select
            label="Tipo de desconto"
            value={couponForm.discount_kind}
            onChange={(e) => setCouponForm((c) => ({ ...c, discount_kind: e.target.value }))}
          >
            {Object.entries(DISCOUNT_KINDS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>

          {couponForm.discount_kind === 'percentual' && (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Percentual (%)"
                type="number"
                min={1}
                max={100}
                value={couponForm.discount_percent}
                onChange={(e) => setCouponForm((c) => ({ ...c, discount_percent: e.target.value }))}
              />
              <Input
                label="Desconto máximo"
                inputMode="decimal"
                placeholder="opcional"
                value={couponForm.max_discount_cents}
                onChange={(e) => setCouponForm((c) => ({ ...c, max_discount_cents: e.target.value }))}
                hint="Teto em reais"
              />
            </div>
          )}

          {couponForm.discount_kind === 'fixo' && (
            <Input
              label="Valor do desconto"
              inputMode="decimal"
              placeholder="10,00"
              value={couponForm.discount_cents}
              onChange={(e) => setCouponForm((c) => ({ ...c, discount_cents: e.target.value }))}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Pedido mínimo"
              inputMode="decimal"
              placeholder="0,00"
              value={couponForm.min_order_cents}
              onChange={(e) => setCouponForm((c) => ({ ...c, min_order_cents: e.target.value }))}
            />
            <Input
              label="Válido até"
              type="datetime-local"
              value={couponForm.valid_until}
              onChange={(e) => setCouponForm((c) => ({ ...c, valid_until: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Limite total de usos"
              type="number"
              placeholder="ilimitado"
              value={couponForm.usage_limit}
              onChange={(e) => setCouponForm((c) => ({ ...c, usage_limit: e.target.value }))}
            />
            <Input
              label="Usos por cliente"
              type="number"
              min={1}
              value={couponForm.usage_limit_per_customer}
              onChange={(e) =>
                setCouponForm((c) => ({ ...c, usage_limit_per_customer: e.target.value }))
              }
            />
          </div>

          <div className="space-y-3 rounded-xl border border-line bg-ink-300 p-4">
            <Switch
              checked={couponForm.is_public}
              onChange={(v) => setCouponForm((c) => ({ ...c, is_public: v }))}
              label="Cupom público"
              description="Aparece clicável na tela de Ofertas"
            />
            <Switch
              checked={couponForm.active}
              onChange={(v) => setCouponForm((c) => ({ ...c, active: v }))}
              label="Ativo"
            />
          </div>
        </div>
      </Sheet>

      <Sheet
        open={Boolean(offerSheet)}
        onClose={() => setOfferSheet(null)}
        size="lg"
        title={offerSheet === 'nova' ? 'Nova oferta' : 'Editar oferta'}
        footer={
          <Button className="w-full" loading={saving} onClick={saveOffer}>
            Salvar oferta
          </Button>
        }
      >
        <div className="space-y-4">
          <Select
            label="Produto"
            value={offerForm.product_id ?? ''}
            onChange={(e) => setOfferForm((c) => ({ ...c, product_id: e.target.value }))}
          >
            <option value="">Selecione</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatBRL(p.price_cents)}
              </option>
            ))}
          </Select>

          <Input
            label="Título da oferta"
            value={offerForm.title ?? ''}
            onChange={(e) => setOfferForm((c) => ({ ...c, title: e.target.value }))}
            placeholder="Combo Art 24 em oferta"
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Preço promocional"
              inputMode="decimal"
              value={offerForm.offer_price ?? ''}
              onChange={(e) => setOfferForm((c) => ({ ...c, offer_price: e.target.value }))}
            />
            <Input
              label="Selo"
              value={offerForm.badge ?? ''}
              onChange={(e) => setOfferForm((c) => ({ ...c, badge: e.target.value }))}
              placeholder="Oferta do dia"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Começa em"
              type="datetime-local"
              value={offerForm.starts_at ?? ''}
              onChange={(e) => setOfferForm((c) => ({ ...c, starts_at: e.target.value }))}
            />
            <Input
              label="Termina em"
              type="datetime-local"
              value={offerForm.ends_at ?? ''}
              onChange={(e) => setOfferForm((c) => ({ ...c, ends_at: e.target.value }))}
              hint="Vazio = sem contagem regressiva"
            />
          </div>

          <ImageUpload
            label="Imagem da oferta (opcional)"
            folder="ofertas"
            value={offerForm.image_url}
            onChange={(url) => setOfferForm((c) => ({ ...c, image_url: url }))}
          />

          <div className="rounded-xl border border-line bg-ink-300 p-4">
            <Switch
              checked={offerForm.active ?? true}
              onChange={(v) => setOfferForm((c) => ({ ...c, active: v }))}
              label="Oferta ativa"
            />
          </div>
        </div>
      </Sheet>

      <Sheet
        open={Boolean(bannerSheet)}
        onClose={() => setBannerSheet(null)}
        size="lg"
        title={bannerSheet === 'novo' ? 'Novo banner' : 'Editar banner'}
        footer={
          <Button className="w-full" loading={saving} onClick={saveBanner}>
            Salvar banner
          </Button>
        }
      >
        <div className="space-y-4">
          <ImageUpload
            label="Imagem do banner"
            folder="banners"
            value={bannerForm.image_url}
            onChange={(url) => setBannerForm((c) => ({ ...c, image_url: url }))}
          />

          <Input
            label="Título"
            value={bannerForm.title ?? ''}
            onChange={(e) => setBannerForm((c) => ({ ...c, title: e.target.value }))}
          />
          <Input
            label="Subtítulo"
            value={bannerForm.subtitle ?? ''}
            onChange={(e) => setBannerForm((c) => ({ ...c, subtitle: e.target.value }))}
          />

          <Select
            label="Ao tocar, leva para"
            value={bannerForm.link_type ?? 'ofertas'}
            onChange={(e) => setBannerForm((c) => ({ ...c, link_type: e.target.value }))}
          >
            <option value="ofertas">Tela de ofertas</option>
            <option value="roleta">Roleta</option>
            <option value="categoria">Uma categoria</option>
            <option value="produto">Um produto</option>
            <option value="url">Link externo</option>
          </Select>

          {bannerForm.link_type === 'categoria' && (
            <Input
              label="Slug da categoria"
              value={bannerForm.link_value ?? ''}
              onChange={(e) => setBannerForm((c) => ({ ...c, link_value: e.target.value }))}
              placeholder="combos"
            />
          )}

          {bannerForm.link_type === 'produto' && (
            <Select
              label="Produto"
              value={bannerForm.link_value ?? ''}
              onChange={(e) => setBannerForm((c) => ({ ...c, link_value: e.target.value }))}
            >
              <option value="">Selecione</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}

          {bannerForm.link_type === 'url' && (
            <Input
              label="URL"
              value={bannerForm.link_value ?? ''}
              onChange={(e) => setBannerForm((c) => ({ ...c, link_value: e.target.value }))}
              placeholder="https://instagram.com/sushiartchapeco"
              hint="Precisa começar com http:// ou https://"
            />
          )}

          <div className="rounded-xl border border-line bg-ink-300 p-4">
            <Switch
              checked={bannerForm.active ?? true}
              onChange={(v) => setBannerForm((c) => ({ ...c, active: v }))}
              label="Banner ativo"
            />
          </div>
        </div>
      </Sheet>
    </div>
  );
}
