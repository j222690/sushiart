import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronRight, Gift, Flame, Sparkles, Clock, Bike } from 'lucide-react';
import ProductCard from '../../components/ProductCard';
import ProductSheet from '../../components/ProductSheet';
import OfferCard from '../../components/OfferCard';
import SugestoesInfinitas from '../../components/SugestoesInfinitas';
import PopupOfertas from '../../components/PopupOfertas';
import ProductImage from '../../components/ProductImage';
import { Badge, Button, Card, Skeleton } from '../../components/ui';
import { home, menu, promo } from '../../lib/api';
import { useMenu, useFavorites } from '../../hooks/useMenu';
import { useStore } from '../../context/StoreContext';
import { useAuth } from '../../context/AuthContext';
import { formatBRL } from '../../lib/format';
import { emojiCategoria, fundoCategoria } from '../../lib/emojiCategoria';

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
  const { byCategory, products, bestsellers, loading } = useMenu();
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

  // Estável: o ProductCard é `memo`, e função nova a cada render anularia isso.
  const abrirProduto = useCallback((product) => setSelected(product), []);

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
      {/* Só na home: é a porta de entrada. Nas outras telas o cliente já está
          fazendo alguma coisa, e interromper ali custa pedido. */}
      <PopupOfertas />

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
              className="relative flex h-36 w-[85%] shrink-0 flex-col justify-end overflow-hidden rounded-card bg-vinho-gradient p-5 text-left shadow-card transition-transform active:scale-[0.99]"
            >
              {/* Sem foto de propósito. As fotos do cardápio são quadradas e de
                  400 px; esticadas numa faixa larga elas cortam o prato pela
                  metade e ficam moles. Faixa da marca com tipografia forte lê
                  melhor em qualquer tela e não depende de foto boa — que é
                  justamente o que falta aqui. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 rounded-full bg-white/10"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-10 -left-4 h-24 w-24 rounded-full bg-black/10"
              />

              <p className="relative font-brand text-xl leading-tight text-white">{banner.title}</p>
              {banner.subtitle && (
                <p className="relative mt-1 line-clamp-2 text-xs leading-relaxed text-white/85">
                  {banner.subtitle}
                </p>
              )}
              <span className="relative mt-2.5 inline-flex w-fit items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white">
                Ver agora
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Chamada da roleta */}
      {spinState && (
        <div className="mt-5 px-4">
          {/* Com giro disponível a chamada ocupa a largura toda e pulsa; sem
              giro ela encolhe para uma linha. O convite só merece a tela
              enquanto ele vale — depois de girado, virar mobília seria pior do
              que sumir. */}
          <Card
            className={clsx(
              'relative overflow-hidden bg-vinho-gradient',
              spinState.can_spin ? 'p-5' : 'flex items-center gap-3 p-4'
            )}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10"
            />

            {spinState.can_spin ? (
              <div className="relative flex items-center gap-4">
                <span className="grid h-16 w-16 shrink-0 animate-pulse-glow place-items-center rounded-full bg-white/15 text-4xl">
                  🎡
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-brand text-lg leading-tight text-white">Seu giro está liberado!</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-white/80">
                    Gire e ganhe desconto para usar hoje mesmo
                  </p>
                  <Button
                    size="sm"
                    variant="ember"
                    className="mt-2.5"
                    onClick={() => navigate('/ofertas#roleta')}
                  >
                    <Gift size={15} /> Girar agora
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/15 text-2xl">
                  🎡
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white">Roleta de prêmios</p>
                  <p className="line-clamp-1 text-xs text-white/75">{spinState.reason}</p>
                </div>
                <Button size="sm" variant="ember" disabled>
                  Girar
                </Button>
              </>
            )}
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
            <ProductCard key={product.id} product={product} variant="grid" onClick={abrirProduto} />
          ))}
        </Rail>
      )}

      {/* Mais vendidos */}
      {bestsellers.length > 0 && (
        <Rail title="Mais vendidos" icon={Flame}>
          {bestsellers.map((product) => (
            <ProductCard key={product.id} product={product} variant="grid" onClick={abrirProduto} />
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
            {byCategory.map((category, i) => (
              <button
                key={category.id}
                type="button"
                onClick={() => navigate(`/cardapio?categoria=${category.slug}`)}
                // Sem foto, como as faixas do topo. A foto de um prato recortada
                // num retângulo de 96 px não mostra prato nenhum — vira mancha
                // colorida. Emoji grande diz a categoria de longe, e o fundo em
                // cor cheia dá o destaque que a foto não estava dando.
                className={clsx(
                  'relative h-24 overflow-hidden rounded-card bg-gradient-to-br p-3 text-left shadow-card',
                  'transition-transform active:scale-[0.98]',
                  fundoCategoria(i)
                )}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-3 -top-2 select-none text-[56px] leading-none opacity-25"
                >
                  {emojiCategoria(category)}
                </span>
                <span aria-hidden="true" className="relative block text-2xl leading-none">
                  {emojiCategoria(category)}
                </span>
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <p className="font-brand text-sm text-white">{category.name}</p>
                  <p className="text-[10px] text-white/70">
                    {category.products.length} itens · a partir de{' '}
                    {formatBRL(Math.min(...category.products.map((p) => p.effective_price_cents)))}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Fecha a home com lista que não acaba, para quem rolou tudo e ainda
          está decidindo. Mesmo componente do cardápio: são a mesma vitrine e
          devem continuar iguais quando uma mudar. */}
      <SugestoesInfinitas
        produtos={products}
        onSelect={abrirProduto}
        isFavorite={isFavorite}
        onToggleFavorite={user ? toggleFavorite : null}
      />

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
