import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin, Plus, Ticket, X, QrCode, CreditCard, Banknote, Store, Sparkles, Check,
} from 'lucide-react';
import clsx from 'clsx';
import AddressForm from '../../components/AddressForm';
import CouponCard from '../../components/CouponCard';
import { Button, Card, Input, Sheet, Spinner } from '../../components/ui';
import { orders as ordersApi, profile, promo } from '../../lib/api';
import { useCart } from '../../store/cart';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { useToast } from '../../context/ToastContext';
import { formatBRL, installmentOptions, parseBRLToCents } from '../../lib/format';
import { ON_DELIVERY_KINDS } from '../../lib/constants';
import { trackInitiateCheckout } from '../../lib/analytics';

const METHOD_ICONS = {
  pix: QrCode,
  cartao_credito: CreditCard,
  cartao_debito: CreditCard,
  na_entrega: Banknote,
};

export default function Checkout() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, customer } = useAuth();
  const { methods, isOpen, restaurant, zoneFor } = useStore();

  const cart = useCart();
  const items = useCart((s) => s.items);
  const subtotal = useCart((s) => s.subtotal());
  const fulfillment = useCart((s) => s.fulfillment);
  const addressId = useCart((s) => s.addressId);
  const coupon = useCart((s) => s.coupon);
  const redeemLoyalty = useCart((s) => s.redeemLoyalty);

  const [addresses, setAddresses] = useState([]);
  const [addressSheet, setAddressSheet] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);

  const [couponSheet, setCouponSheet] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [checkingCoupon, setCheckingCoupon] = useState(false);

  const [method, setMethod] = useState(null);
  const [onDeliveryKind, setOnDeliveryKind] = useState(null);
  const [installments, setInstallments] = useState(1);
  const [changeFor, setChangeFor] = useState('');
  const [needsChange, setNeedsChange] = useState(false);
  const [orderNotes, setOrderNotes] = useState('');

  const [points, setPoints] = useState(0);
  const [loyalty, setLoyalty] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Sem login não dá para criar pedido — manda entrar e volta pra cá.
  useEffect(() => {
    if (!user) navigate('/entrar?next=/checkout', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    if (items.length === 0) navigate('/carrinho', { replace: true });
  }, [items.length, navigate]);

  useEffect(() => {
    if (!user) return;
    profile.addresses(user.id).then((rows) => {
      setAddresses(rows);
      if (!addressId) {
        const preferred = rows.find((a) => a.is_default) ?? rows[0];
        if (preferred) cart.setAddressId(preferred.id);
      }
    });
    promo.loyaltyBalance().then(setPoints).catch(() => setPoints(0));
    promo.loyaltyConfig().then(setLoyalty).catch(() => setLoyalty(null));
    promo.myCoupons(user.id).then(setAvailableCoupons).catch(() => setAvailableCoupons([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!methods.length || method) return;
    setMethod(methods[0].method);
  }, [methods, method]);

  const selectedAddress = addresses.find((a) => a.id === addressId) ?? null;
  const zone = fulfillment === 'entrega' ? zoneFor(selectedAddress?.neighborhood) : null;
  const deliveryFee = fulfillment === 'entrega' ? zone?.fee_cents ?? 0 : 0;

  // -------------------------------------------------------------------------
  // O cupom é revalidado sempre que o subtotal ou o frete muda: tirar um item
  // pode derrubar o pedido mínimo do cupom, e o cliente precisa saber ANTES
  // de tentar fechar o pedido (o servidor recusaria de qualquer forma).
  // -------------------------------------------------------------------------
  const revalidate = useCallback(async () => {
    if (!coupon?.code) return;
    try {
      const result = await promo.validateCoupon(coupon.code, subtotal, deliveryFee);
      if (result.valid) {
        cart.setCoupon(result);
      } else {
        cart.setCoupon(null);
        toast.info(`Cupom removido: ${result.reason}`);
      }
    } catch {
      cart.setCoupon(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, deliveryFee, coupon?.code]);

  useEffect(() => {
    revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, deliveryFee]);

  const loyaltyDiscount = useMemo(() => {
    if (!redeemLoyalty || !loyalty?.active) return 0;
    if (points < loyalty.points_to_reward) return 0;
    return loyalty.reward_kind === 'percentual'
      ? Math.floor((subtotal * Number(loyalty.reward_percent)) / 100)
      : loyalty.reward_cents ?? 0;
  }, [redeemLoyalty, loyalty, points, subtotal]);

  // InitiateCheckout: uma vez, quando a tela de fechamento aparece com
  // carrinho de verdade. `useRef` porque esta tela re-renderiza a cada
  // digitação de endereço e a cada troca de forma de pagamento — sem a trava
  // seriam dezenas de eventos para um único checkout.
  const checkoutContado = useRef(false);
  useEffect(() => {
    if (checkoutContado.current || items.length === 0) return;
    checkoutContado.current = true;
    trackInitiateCheckout({
      itens: items.map((i) => ({
        id: i.product_id,
        nome: i.name,
        precoCentavos: i.unit_price_cents,
        quantidade: i.quantity,
      })),
      totalCentavos: subtotal,
    });
  }, [items, subtotal]);

  const methodConfig = methods.find((m) => m.method === method);

  const couponDiscount = coupon?.valid ? coupon.discount_cents : 0;

  // Desconto por escolher a forma de pagamento (Pix costuma ter). Espelha
  // exatamente o que `create_order` faz no servidor — inclusive incidir só
  // sobre o subtotal e entrar antes do teto. Se as duas contas divergirem, o
  // cliente vê um total no resumo e é cobrado outro, que é o pior tipo de bug
  // de checkout: só aparece depois do dinheiro sair.
  const paymentDiscount = Math.floor(
    (subtotal * Number(methodConfig?.discount_percent ?? 0)) / 100
  );

  const discount = Math.min(
    couponDiscount + loyaltyDiscount + paymentDiscount,
    subtotal + deliveryFee
  );
  const total = subtotal + deliveryFee - discount;

  // No checkout hospedado da InfinitePay quem escolhe o parcelamento é o
  // cliente, na tela deles. Mostrar as parcelas aqui seria prometer uma escolha
  // que o nosso app não controla.
  const installmentsAtGateway = methodConfig?.provider === 'infinitepay';

  const installmentChoices = useMemo(() => {
    if (method !== 'cartao_credito' || installmentsAtGateway) return [];
    return installmentOptions(
      total,
      methodConfig?.options?.max_installments ?? 3,
      methodConfig?.options?.min_installment_cents ?? 2000
    );
  }, [method, total, methodConfig]);

  async function applyCoupon(code) {
    const value = String(code || '').trim();
    if (!value) return;

    setCheckingCoupon(true);
    try {
      const result = await promo.validateCoupon(value, subtotal, deliveryFee);
      if (!result.valid) {
        toast.error(result.reason);
        return;
      }
      cart.setCoupon(result);
      setCouponSheet(false);
      setCouponInput('');
      toast.success('Cupom aplicado!');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setCheckingCoupon(false);
    }
  }

  async function handleSaveAddress(data) {
    setSavingAddress(true);
    try {
      const saved = await profile.saveAddress(user.id, data);
      const rows = await profile.addresses(user.id);
      setAddresses(rows);
      cart.setAddressId(saved.id);
      setAddressSheet(false);
      toast.success('Endereço salvo.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingAddress(false);
    }
  }

  async function handleSubmit() {
    if (!isOpen) {
      toast.error('O restaurante está fechado no momento.');
      return;
    }
    if (fulfillment === 'entrega' && !selectedAddress) {
      toast.error('Escolha um endereço de entrega.');
      return;
    }
    if (fulfillment === 'entrega' && !zone) {
      toast.error('Ainda não entregamos nesse bairro.');
      return;
    }

    if (method === 'na_entrega' && !onDeliveryKind) {
      toast.error('Escolha como você vai pagar na entrega.');
      return;
    }

    const wantsChange = onDeliveryKind === 'dinheiro' && needsChange;
    const changeCents = wantsChange ? parseBRLToCents(changeFor) : null;

    if (wantsChange && changeCents < total) {
      toast.error('O valor do troco precisa ser maior que o total do pedido.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = cart.toOrderPayload({
        paymentMethod: method,
        onDeliveryKind: method === 'na_entrega' ? onDeliveryKind : null,
        installments,
        changeForCents: changeCents,
        notes: orderNotes,
      });

      const result = await ordersApi.create(payload);
      cart.clear();

      if (result.requires_payment) {
        navigate(`/pagamento/${result.order_id}`, { replace: true });
      } else {
        toast.success(`Pedido ${result.code} confirmado!`);
        navigate(`/pedidos/${result.order_id}`, { replace: true });
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!user || items.length === 0) {
    return (
      <div className="grid place-items-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="px-4 pb-6 pt-4">
      <h1 className="mb-4 font-brand text-2xl text-cream">Finalizar pedido</h1>

      {/* --------------------------- Entrega --------------------------- */}
      <section className="mb-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-cream">
          {fulfillment === 'entrega' ? <MapPin size={15} /> : <Store size={15} />}
          {fulfillment === 'entrega' ? 'Endereço de entrega' : 'Retirada no local'}
        </h2>

        {fulfillment === 'retirada' ? (
          <Card className="p-4 text-sm text-cream-muted">
            <p className="font-medium text-cream">{restaurant?.name}</p>
            <p className="mt-1">
              {restaurant?.address_street}, {restaurant?.address_number} —{' '}
              {restaurant?.address_neighborhood}
            </p>
            <p className="mt-1 text-xs text-cream-faint">
              Pronto em ~{restaurant?.prep_time_min} min após a confirmação.
            </p>
          </Card>
        ) : addresses.length === 0 ? (
          <Button variant="secondary" className="w-full" onClick={() => setAddressSheet(true)}>
            <Plus size={16} /> Cadastrar endereço
          </Button>
        ) : (
          <div className="space-y-2">
            {addresses.map((address) => {
              const addressZone = zoneFor(address.neighborhood);
              const active = address.id === addressId;
              return (
                <button
                  key={address.id}
                  type="button"
                  onClick={() => cart.setAddressId(address.id)}
                  className={clsx(
                    'flex w-full items-start gap-3 rounded-card border p-3.5 text-left transition-colors',
                    active ? 'border-vinho-500 bg-vinho-900/30' : 'border-line bg-ink-500'
                  )}
                >
                  <span
                    className={clsx(
                      'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border',
                      active ? 'border-vinho-400 bg-vinho-500' : 'border-cream-faint/40'
                    )}
                  >
                    {active && <Check size={10} className="text-cream" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-cream">
                      {address.label} · {address.street}, {address.number}
                    </span>
                    <span className="block text-xs text-cream-muted">
                      {address.neighborhood}
                      {address.complement ? ` · ${address.complement}` : ''}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-cream-faint">
                      {addressZone
                        ? `Taxa ${formatBRL(addressZone.fee_cents)} · ~${addressZone.eta_min} min`
                        : 'Bairro fora da área de entrega'}
                    </span>
                  </span>
                </button>
              );
            })}
            <Button variant="ghost" size="sm" onClick={() => setAddressSheet(true)}>
              <Plus size={14} /> Novo endereço
            </Button>
          </div>
        )}
      </section>

      {/* --------------------------- Cupom --------------------------- */}
      <section className="mb-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-cream">
          <Ticket size={15} /> Cupom de desconto
        </h2>

        {coupon?.valid ? (
          <div className="flex items-center gap-3 rounded-card border border-success/40 bg-success/5 p-3.5">
            <Check size={17} className="text-success" />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm font-bold text-cream">{coupon.code}</p>
              <p className="text-xs text-cream-muted">
                {coupon.kind === 'frete_gratis' ? 'Frete grátis' : `- ${formatBRL(coupon.discount_cents)}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => cart.setCoupon(null)}
              aria-label="Remover cupom"
              className="rounded-lg p-1.5 text-cream-faint hover:text-danger"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <Button variant="secondary" className="w-full" onClick={() => setCouponSheet(true)}>
            <Ticket size={16} /> Adicionar cupom
          </Button>
        )}
      </section>

      {/* --------------------------- Fidelidade --------------------------- */}
      {loyalty?.active && points >= loyalty.points_to_reward && (
        <button
          type="button"
          onClick={() => cart.setRedeemLoyalty(!redeemLoyalty)}
          className={clsx(
            'mb-5 flex w-full items-center gap-3 rounded-card border p-3.5 text-left transition-colors',
            redeemLoyalty ? 'border-ember/60 bg-ember/10' : 'border-line bg-ink-500'
          )}
        >
          <Sparkles size={18} className="text-ember" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-cream">
              Usar {loyalty.points_to_reward} pontos
            </span>
            <span className="block text-xs text-cream-muted">
              Você tem {points} pontos ·{' '}
              {loyalty.reward_kind === 'percentual'
                ? `${Number(loyalty.reward_percent)}% de desconto`
                : `${formatBRL(loyalty.reward_cents)} de desconto`}
            </span>
          </span>
          <span
            className={clsx(
              'grid h-5 w-5 place-items-center rounded-md border',
              redeemLoyalty ? 'border-ember bg-ember' : 'border-cream-faint/40'
            )}
          >
            {redeemLoyalty && <Check size={12} className="text-ink-900" />}
          </span>
        </button>
      )}

      {/* --------------------------- Pagamento --------------------------- */}
      <section className="mb-5">
        <h2 className="mb-2 text-sm font-semibold text-cream">Forma de pagamento</h2>

        <div className="space-y-2">
          {methods.map((option) => {
            const Icon = METHOD_ICONS[option.method] ?? CreditCard;
            const active = method === option.method;
            return (
              <button
                key={option.method}
                type="button"
                onClick={() => setMethod(option.method)}
                className={clsx(
                  'flex w-full items-center gap-3 rounded-card border p-3.5 text-left transition-colors',
                  active ? 'border-vinho-500 bg-vinho-900/30' : 'border-line bg-ink-500'
                )}
              >
                <Icon size={19} className={active ? 'text-vinho-200' : 'text-cream-muted'} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-cream">{option.label}</span>

                    {/* O Pix custa 0,99% e o débito 3,99%. Anunciar o desconto
                        aqui, na hora da escolha, é o que move o cliente para a
                        forma que sangra menos — dizer depois não move nada. */}
                    {Number(option.discount_percent) > 0 && (
                      <span className="rounded-md bg-success/15 px-1.5 py-0.5 text-[11px] font-bold leading-none text-success">
                        {Number(option.discount_percent)}% OFF
                      </span>
                    )}
                  </span>
                  {option.description && (
                    <span className="block text-xs text-cream-muted">{option.description}</span>
                  )}
                </span>
                <span
                  className={clsx(
                    'grid h-4 w-4 shrink-0 place-items-center rounded-full border',
                    active ? 'border-vinho-400 bg-vinho-500' : 'border-cream-faint/40'
                  )}
                >
                  {active && <Check size={10} className="text-cream" />}
                </span>
              </button>
            );
          })}
        </div>

        {method === 'cartao_credito' && installmentsAtGateway && (
          <p className="mt-3 rounded-xl border border-line bg-ink-300 px-3.5 py-2.5 text-xs text-cream-muted">
            Você escolhe em quantas vezes parcelar na próxima tela, no ambiente seguro do
            processador de pagamento.
          </p>
        )}

        {/* Parcelamento */}
        {method === 'cartao_credito' && installmentChoices.length > 1 && (
          <div className="mt-3 space-y-1.5">
            <p className="text-xs text-cream-muted">Parcelamento</p>
            {installmentChoices.map((option) => (
              <button
                key={option.n}
                type="button"
                onClick={() => setInstallments(option.n)}
                className={clsx(
                  'flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm transition-colors',
                  installments === option.n
                    ? 'border-vinho-500 bg-vinho-900/30 text-cream'
                    : 'border-line bg-ink-300 text-cream-muted'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        {/* Formas aceitas na entrega */}
        {method === 'na_entrega' && (
          <div className="mt-3 rounded-card border border-line bg-ink-500 p-3.5">
            <p className="mb-2.5 text-xs font-semibold text-cream">
              Como você vai pagar ao entregador?
            </p>

            <div className="grid grid-cols-2 gap-2">
              {(methodConfig?.options?.kinds ?? Object.keys(ON_DELIVERY_KINDS)).map((key) => {
                const kind = ON_DELIVERY_KINDS[key];
                if (!kind) return null;
                const Icon = kind.icon === 'qr' ? QrCode : kind.icon === 'card' ? CreditCard : Banknote;
                const active = onDeliveryKind === key;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setOnDeliveryKind(key);
                      // Troco não existe fora do dinheiro.
                      if (key !== 'dinheiro') setNeedsChange(false);
                    }}
                    className={clsx(
                      'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors',
                      active ? 'border-vinho-500 bg-vinho-900/30' : 'border-line bg-ink-300'
                    )}
                  >
                    <Icon size={16} className={active ? 'text-vinho-200' : 'text-cream-muted'} />
                    <span className="min-w-0 flex-1 text-xs text-cream">{kind.label}</span>
                    {active && <Check size={13} className="shrink-0 text-vinho-200" />}
                  </button>
                );
              })}
            </div>

            {onDeliveryKind && ON_DELIVERY_KINDS[onDeliveryKind]?.machine && (
              <p className="mt-2.5 text-[11px] text-cream-faint">
                O entregador leva a maquininha. Confira as bandeiras aceitas na entrega.
              </p>
            )}

            {/* Troco — só em dinheiro */}
            {onDeliveryKind === 'dinheiro' && (
              <div className="mt-3 border-t border-line pt-3">
                <label className="flex items-center gap-2.5 text-sm text-cream">
                  <input
                    type="checkbox"
                    checked={needsChange}
                    onChange={(e) => setNeedsChange(e.target.checked)}
                    className="h-4 w-4 accent-[#8B2635]"
                  />
                  Preciso de troco
                </label>

                {needsChange && (
                  <div className="mt-3">
                    <Input
                      label="Troco para quanto?"
                      inputMode="decimal"
                      placeholder="Ex: 100,00"
                      value={changeFor}
                      onChange={(e) => setChangeFor(e.target.value)}
                      hint={
                        parseBRLToCents(changeFor) > total
                          ? `Levamos ${formatBRL(parseBRLToCents(changeFor) - total)} de troco.`
                          : 'Informe o valor da nota que você vai entregar.'
                      }
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* --------------------------- Observações --------------------------- */}
      <section className="mb-5">
        <Input
          label="Observações do pedido"
          placeholder="Ex: interfone quebrado, ligar ao chegar"
          maxLength={200}
          value={orderNotes}
          onChange={(e) => setOrderNotes(e.target.value)}
        />
      </section>

      {/* --------------------------- Resumo --------------------------- */}
      <Card className="p-4">
        <h2 className="mb-3 font-brand text-base text-cream">Resumo</h2>

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-cream-muted">Subtotal</dt>
            <dd className="text-cream">{formatBRL(subtotal)}</dd>
          </div>

          {fulfillment === 'entrega' && (
            <div className="flex justify-between">
              <dt className="text-cream-muted">Taxa de entrega</dt>
              <dd className={clsx(coupon?.free_shipping ? 'text-success line-through' : 'text-cream')}>
                {deliveryFee === 0 ? 'Grátis' : formatBRL(deliveryFee)}
              </dd>
            </div>
          )}

          {couponDiscount > 0 && (
            <div className="flex justify-between">
              <dt className="text-cream-muted">Cupom {coupon.code}</dt>
              <dd className="text-success">− {formatBRL(couponDiscount)}</dd>
            </div>
          )}

          {loyaltyDiscount > 0 && (
            <div className="flex justify-between">
              <dt className="text-cream-muted">Pontos de fidelidade</dt>
              <dd className="text-success">− {formatBRL(loyaltyDiscount)}</dd>
            </div>
          )}

          {paymentDiscount > 0 && (
            <div className="flex justify-between">
              <dt className="text-cream-muted">Desconto no {methodConfig.label}</dt>
              <dd className="text-success">− {formatBRL(paymentDiscount)}</dd>
            </div>
          )}

          <div className="flex justify-between border-t border-line pt-2.5 text-base font-bold">
            <dt className="text-cream">Total</dt>
            <dd className="text-cream">{formatBRL(total)}</dd>
          </div>
        </dl>
      </Card>

      <Button
        size="lg"
        className="mt-4 w-full"
        loading={submitting}
        disabled={
          !isOpen ||
          !method ||
          (method === 'na_entrega' && !onDeliveryKind) ||
          (fulfillment === 'entrega' && !selectedAddress)
        }
        onClick={handleSubmit}
      >
        {method === 'na_entrega' ? 'Confirmar pedido' : `Pagar ${formatBRL(total)}`}
      </Button>

      {!isOpen && (
        <p className="mt-2 text-center text-xs text-warning">
          Estamos fechados — seu carrinho fica salvo para quando abrirmos.
        </p>
      )}

      {/* Sheets */}
      <Sheet open={addressSheet} onClose={() => setAddressSheet(false)} title="Novo endereço">
        <AddressForm
          onSave={handleSaveAddress}
          onCancel={() => setAddressSheet(false)}
          saving={savingAddress}
        />
      </Sheet>

      <Sheet open={couponSheet} onClose={() => setCouponSheet(false)} title="Cupom de desconto">
        <div className="flex gap-2">
          <Input
            placeholder="Digite o código"
            value={couponInput}
            onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
            className="flex-1 font-mono tracking-wider"
          />
          <Button onClick={() => applyCoupon(couponInput)} loading={checkingCoupon}>
            Aplicar
          </Button>
        </div>

        {availableCoupons.length > 0 && (
          <div className="mt-5">
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-cream-faint">
              Seus cupons
            </p>
            <div className="space-y-2.5">
              {availableCoupons.map((item) => (
                <CouponCard
                  key={item.id}
                  coupon={item}
                  onApply={(c) => applyCoupon(c.code)}
                  applied={coupon?.code === item.code}
                  disabled={checkingCoupon}
                />
              ))}
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
