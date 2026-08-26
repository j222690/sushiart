import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Gift, Flame, Sparkles, Clock, Bike } from 'lucide-react';
import ProductCard from '../../components/ProductCard';
import ProductSheet from '../../components/ProductSheet';
import OfferCard from '../../components/OfferCard';
import ProductImage from '../../components/ProductImage';
import { Badge, Button, Card, Skeleton } from '../../components/ui';
import { home, menu, promo } from '../../lib/api';
import { useMenu, useFavorites } from '../../hooks/useMenu';
import { useStore } from '../../context/StoreContext';
import { useAuth } from '../../context/AuthContext';
import { formatBRL } from '../../lib/format';

/** Faixa horizontal reutilizada nos vários carrosséis da home. */
function Rail({ title, subtitle, icon: Icon, action, children }) {
  return (
    <section className="mt-7">
      <header className="mb-3 flex items-end justify-between gap-3 px-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-brand text-lg text-cream">
            {Icon && <Icon size={17} className="text-vinho-300" />}
            {title}
          </h2>
          {subtitle && <p className="text-xs text-cream-muted">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-1">{children}</div>
    </section>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { user, customer } = useAuth();
  const { restaurant, isOpen } = useStore();
  const { byCategory, bestsellers, loading } = useMenu();
  const { isFavorite, toggleFavorite } = useFavorites();

  const [banners, setBanners] = useState([]);
  const [offers, setOffers] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [spinState, setSpinState] = useState(null);
  const [points, setPoints] = useState(null);
  const [selected, setSelected] = useState(null);

  const loadOffers = useCallback(() => {
    home.offers().then(setOffers).catch(() => setOffers([]));
  }, []);

  useEffect(() => {
    home.banners().then(setBanners).catch(() => setBanners([]));
    loadOffers();
    menu.recommended(10).then(setRecommended).catch(() => setRecommended([]));
  }, [loadOffers]);

  useEffect(() => {
    if (!user) {
      setSpinState(null);
      setPoints(null);
      return;
    }
    promo.canSpin().then(setSpinState).catch(() => setSpinState(null));
    promo.loyaltyBalance().then(setPoints).catch(() => setPoints(null));
  }, [user]);

  const firstName = (customer?.name || '').trim().split(' ')[0];

  function handleBanner(banner) {
    switch (banner.link_type) {
      case 'categoria':
        return navigate(`/cardapio?categoria=${banner.link_value}`);
      case 'produto':
        return navigate(`/cardapio?produto=${banner.link_value}`);
      case 'roleta':
        return navigate('/ofertas#roleta');
      case 'url':
        // Só seguimos links http(s) — um valor `javascript:` salvo no admin
        // não pode virar execução no navegador do cliente.
        if (/^https?:\/\//i.test(banner.link_value || '')) {
          window.open(banner.link_value, '_blank', 'noopener,noreferrer');
        }
        return undefined;
      default:
        return navigate('/ofertas');
    }
  }

  return (
    <div className="pb-4">
      {/* Saudação + tempo de entrega */}
      <section className="bg-ember-glow px-4 pb-2 pt-4">
        <p className="font-brand text-xl text-cream">
          {firstName ? `Olá, ${firstName}` : 'Bem-vindo ao Sushi Art'}
        </p>
        <p className="mt-0.5 font-script text-2xl text-vinho-200">
          {restaurant?.tagline || 'Amor em forma de sushi'}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={isOpen ? 'success' : 'danger'}>{isOpen ? 'Aberto agora' : 'Fechado'}</Badge>
          {restaurant && (
            <>
              <Badge tone="neutral">
                <Clock size={11} />
                {restaurant.prep_time_min}–{restaurant.prep_time_min + restaurant.delivery_time_min} min
              </Badge>
              <Badge tone="neutral">
                <Bike size={11} /> Entrega e retirada
              </Badge>
            </>
          )}
        </div>
      </section>

      {/* Banners */}
      {banners.length > 0 && (
        <div className="no-scrollbar mt-4 flex gap-3 overflow-x-auto px-4">
          {banners.map((banner) => (
            <button
              key={banner.id}
              type="button"
              onClick={() => handleBanner(banner)}
              className="relative h-36 w-[85%] shrink-0 overflow-hidden rounded-card border border-line text-left shadow-card"
            >
              <ProductImage
                src={banner.image_url}
                alt={banner.title}
                className="absolute inset-0 h-full w-full"
                rounded="rounded-none"
              />
              {/* Escuro e texto claro, não o contrário. `ink-900` virou bege na
                  virada para o tema claro, então este degradê passou a clarear
                  a foto e apagar o texto escuro por cima dela. Sobre fotografia
                  o par que sempre lê é véu escuro com letra clara — vale para
                  qualquer foto que o restaurante venha a subir. */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <p className="font-brand text-lg leading-tight text-white drop-shadow-sm">{banner.title}</p>
                {banner.subtitle && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-white/85">{banner.subtitle}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Chamada da roleta */}
      {spinState && (
        <div className="mt-5 px-4">
          <Card className="flex items-center gap-3 overflow-hidden bg-vinho-gradient p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink-900/40">
              <Gift size={22} className="text-ember" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-cream">
                {spinState.can_spin ? 'Seu giro está liberado!' : 'Roleta de prêmios'}
              </p>
              <p className="line-clamp-1 text-xs text-cream/75">
                {spinState.can_spin
                  ? 'Gire e ganhe desconto no pedido de hoje'
                  : spinState.reason}
              </p>
            </div>
            <Button
              size="sm"
              variant="ember"
              onClick={() => navigate('/ofertas#roleta')}
              disabled={!spinState.can_spin}
            >
              Girar
            </Button>
          </Card>
        </div>
      )}

      {/* Fidelidade */}
      {points !== null && points > 0 && (
        <button
          type="button"
          onClick={() => navigate('/fidelidade')}
          className="mt-3 flex w-[calc(100%-2rem)] items-center gap-2 rounded-card border border-ember/25 bg-ember/5 px-4 py-2.5 mx-4 text-left"
        >
          <Sparkles size={15} className="text-ember" />
          <span className="flex-1 text-xs text-cream-muted">
            Você tem <strong className="text-ember">{points} pontos</strong> acumulados
          </span>
          <ChevronRight size={16} className="text-cream-faint" />
        </button>
      )}

      {/* Ofertas */}
      {offers.length > 0 && (
        <Rail
          title="Ofertas do dia"
          subtitle="Por tempo limitado"
          icon={Flame}
          action={
            <button
              type="button"
              onClick={() => navigate('/ofertas')}
              className="flex items-center gap-0.5 text-xs font-medium text-vinho-200"
            >
              Ver todas <ChevronRight size={14} />
            </button>
          }
        >
          {offers.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              onClick={setSelected}
              onExpire={loadOffers}
            />
          ))}
        </Rail>
      )}

      {/* Recomendados */}
      {recommended.length > 0 && (
        <Rail
          title={user ? 'Recomendados pra você' : 'Os mais pedidos'}
          subtitle={user ? 'Com base no que você já pediu' : 'O que sai mais da nossa cozinha'}
          icon={Sparkles}
        >
          {recommended.map((product) => (
            <ProductCard key={product.id} product={product} variant="grid" onClick={() => setSelected(product)} />
          ))}
        </Rail>
      )}

      {/* Mais vendidos */}
      {bestsellers.length > 0 && (
        <Rail title="Mais vendidos" icon={Flame}>
          {bestsellers.map((product) => (
            <ProductCard key={product.id} product={product} variant="grid" onClick={() => setSelected(product)} />
          ))}
        </Rail>
      )}

      {/* Categorias */}
      <section className="mt-8 px-4">
        <h2 className="mb-3 font-brand text-lg text-cream">Nosso cardápio</h2>

        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {byCategory.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => navigate(`/cardapio?categoria=${category.slug}`)}
                className="relative h-24 overflow-hidden rounded-card border border-line text-left shadow-card"
              >
                <ProductImage
                  src={category.image_url || category.products[0]?.image_url}
                  alt={category.name}
                  className="absolute inset-0 h-full w-full"
                  rounded="rounded-none"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink-900/90 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <p className="font-brand text-sm text-cream">{category.name}</p>
                  <p className="text-[10px] text-cream-muted">
                    {category.products.length} itens · a partir de{' '}
                    {formatBRL(Math.min(...category.products.map((p) => p.effective_price_cents)))}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

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
