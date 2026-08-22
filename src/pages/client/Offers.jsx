import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tag, Gift, PartyPopper, Copy, Check } from 'lucide-react';
import Roulette from '../../components/Roulette';
import OfferCard from '../../components/OfferCard';
import CouponCard from '../../components/CouponCard';
import ProductSheet from '../../components/ProductSheet';
import { Button, Card, EmptyState, Sheet, Skeleton } from '../../components/ui';
import { home, promo } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useFavorites } from '../../hooks/useMenu';
import { formatBRL, formatDateTime } from '../../lib/format';

export default function Offers() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const { isFavorite, toggleFavorite } = useFavorites();

  const [offers, setOffers] = useState(null);
  const [publicCoupons, setPublicCoupons] = useState([]);
  const [myCoupons, setMyCoupons] = useState([]);
  const [prizes, setPrizes] = useState([]);
  const [spinState, setSpinState] = useState(null);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState(null);
  const rouletteRef = useRef(null);

  const loadOffers = useCallback(() => {
    home.offers().then(setOffers).catch(() => setOffers([]));
  }, []);

  const loadCoupons = useCallback(() => {
    home
      .publicCoupons()
      .then((rows) => {
        // A policy já devolve só cupons válidos; separamos os públicos dos
        // pessoais (prêmios de roleta e fidelidade) para exibir em blocos.
        setPublicCoupons(rows.filter((c) => c.is_public && !c.customer_id));
        setMyCoupons(rows.filter((c) => c.customer_id));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadOffers();
    loadCoupons();
    promo.prizes().then(setPrizes).catch(() => setPrizes([]));
  }, [loadOffers, loadCoupons]);

  useEffect(() => {
    if (!user) return;
    promo.canSpin().then(setSpinState).catch(() => setSpinState(null));
  }, [user]);

  // Link "#roleta" (vindo da home) rola direto até a roda.
  useEffect(() => {
    if (window.location.hash === '#roleta' && rouletteRef.current) {
      rouletteRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [prizes.length]);

  async function handleSpin() {
    try {
      const spin = await promo.spin();
      // O modal só aparece depois da roda parar, senão estraga a surpresa.
      setTimeout(() => {
        setResult(spin);
        setCopied(false);
        loadCoupons();
        promo.canSpin().then(setSpinState).catch(() => undefined);
      }, 4700);
      return spin;
    } catch (error) {
      toast.error(error.message);
      throw error;
    }
  }

  function copyCode(code) {
    navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true);
        toast.success('Código copiado.');
      },
      () => toast.error('Não foi possível copiar. Anote o código.')
    );
  }

  return (
    <div className="px-4 pb-6 pt-4">
      <header className="mb-5">
        <h1 className="font-brand text-2xl text-cream">Ofertas</h1>
        <p className="text-sm text-cream-muted">Descontos, cupons e a roleta da sorte.</p>
      </header>

      {/* ---------------- Roleta ---------------- */}
      <section ref={rouletteRef} className="scroll-mt-24">
        <Card className="overflow-hidden bg-ember-glow p-5">
          <div className="mb-4 text-center">
            <h2 className="font-brand text-lg text-cream">Roleta da sorte</h2>
            <p className="text-xs text-cream-muted">
              {spinState?.rule === 'pedido'
                ? 'Um giro a cada pedido concluído'
                : 'Um giro por dia, todo dia'}
            </p>
          </div>

          {prizes.length === 0 ? (
            <Skeleton className="mx-auto h-[300px] w-[300px] rounded-full" />
          ) : !user ? (
            <div className="flex flex-col items-center gap-4">
              <Roulette prizes={prizes} canSpin={false} reason="" onSpin={() => {}} />
              <Button onClick={() => navigate('/entrar?next=/ofertas')}>
                Entrar para girar
              </Button>
            </div>
          ) : (
            <Roulette
              prizes={prizes}
              canSpin={Boolean(spinState?.can_spin)}
              reason={
                spinState?.next_spin_at
                  ? `${spinState.reason} Próximo giro: ${formatDateTime(spinState.next_spin_at)}.`
                  : spinState?.reason
              }
              onSpin={handleSpin}
            />
          )}
        </Card>
      </section>

      {/* ---------------- Meus cupons ---------------- */}
      {myCoupons.length > 0 && (
        <section className="mt-7">
          <h2 className="mb-3 flex items-center gap-2 font-brand text-lg text-cream">
            <Gift size={17} className="text-ember" /> Seus cupons
          </h2>
          <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {myCoupons.map((coupon) => (
              <CouponCard key={coupon.id} coupon={coupon} />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-cream-faint">
            Aplique no checkout — eles aparecem lá automaticamente.
          </p>
        </section>
      )}

      {/* ---------------- Ofertas em destaque ---------------- */}
      <section className="mt-7">
        <h2 className="mb-3 flex items-center gap-2 font-brand text-lg text-cream">
          <Tag size={17} className="text-vinho-300" /> Ofertas em destaque
        </h2>

        {offers === null ? (
          <div className="flex gap-3">
            <Skeleton className="h-56 w-64" />
            <Skeleton className="h-56 w-64" />
          </div>
        ) : offers.length === 0 ? (
          <Card className="p-5 text-center text-sm text-cream-muted">
            Nenhuma oferta ativa agora. Volte mais tarde — elas mudam sempre.
          </Card>
        ) : (
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">
            {offers.map((offer) => (
              <OfferCard key={offer.id} offer={offer} onClick={setSelected} onExpire={loadOffers} />
            ))}
          </div>
        )}
      </section>

      {/* ---------------- Cupons públicos ---------------- */}
      <section className="mt-7">
        <h2 className="mb-3 font-brand text-lg text-cream">Cupons disponíveis</h2>

        {publicCoupons.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="Nenhum cupom no momento"
            description="Gire a roleta acima — ela solta cupom todo dia."
          />
        ) : (
          <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {publicCoupons.map((coupon) => (
              <CouponCard key={coupon.id} coupon={coupon} />
            ))}
          </div>
        )}
      </section>

      {/* ---------------- Resultado do giro ---------------- */}
      <Sheet open={Boolean(result)} onClose={() => setResult(null)} title={null}>
        {result && (
          <div className="py-4 text-center">
            {result.won ? (
              <>
                <PartyPopper size={44} className="mx-auto mb-3 text-ember" />
                <h3 className="font-brand text-2xl text-cream">Você ganhou!</h3>
                <p className="mt-1 text-3xl font-extrabold text-vinho-200">{result.label}</p>

                <button
                  type="button"
                  onClick={() => copyCode(result.coupon_code)}
                  className="mx-auto mt-5 flex items-center gap-2 rounded-xl border border-dashed border-ember/50 bg-ember/10 px-4 py-3 font-mono text-lg font-bold tracking-widest text-cream"
                >
                  {result.coupon_code}
                  {copied ? <Check size={17} className="text-success" /> : <Copy size={17} className="text-ember" />}
                </button>

                <p className="mt-3 text-xs text-cream-muted">
                  Válido até {formatDateTime(result.valid_until)}
                  {result.min_order_cents > 0 && ` · pedido mínimo ${formatBRL(result.min_order_cents)}`}
                </p>

                <Button size="lg" className="mt-5 w-full" onClick={() => navigate('/cardapio')}>
                  Usar agora
                </Button>
              </>
            ) : (
              <>
                <Gift size={44} className="mx-auto mb-3 text-cream-faint" />
                <h3 className="font-brand text-xl text-cream">{result.label}</h3>
                <p className="mt-2 text-sm text-cream-muted">
                  Amanhã tem outro giro esperando por você.
                </p>
                <Button variant="secondary" className="mt-5 w-full" onClick={() => setResult(null)}>
                  Fechar
                </Button>
              </>
            )}
          </div>
        )}
      </Sheet>

      <ProductSheet
        product={selected}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        isFavorite={selected ? isFavorite(selected.id) : false}
        onToggleFavorite={user ? toggleFavorite : null}
      />
    </div>
  );
}
