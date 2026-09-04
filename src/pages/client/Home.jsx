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
import Noren from '../../components/Noren';
import Lanternas from '../../components/Lanternas';
import Sakura from '../../components/Sakura';
import PedirDeNovo from '../../components/PedirDeNovo';
import AvisosDoPedido from '../../components/AvisosDoPedido';
import { Badge, Button, Card, Skeleton } from '../../components/ui';
import { home, menu, promo } from '../../lib/api';
import { useMenu, useFavorites } from '../../hooks/useMenu';
import { useStore } from '../../context/StoreContext';
import { useAuth } from '../../context/AuthContext';
import { formatBRL } from '../../lib/format';
import { fundoCategoria } from '../../lib/emojiCategoria';
import { iconeCategoria } from '../../lib/iconesCategoria';

/**
 * A diagonal que dissolve a foto do card de categoria na cor de fundo.
 *
 * 115° em vez de 90°: a 90° a divisa fica vertical e o card lê como duas
 * metades coladas. Inclinada, os dois lados parecem uma coisa só.
 *
 * A transição é longa de propósito (de 18% a 78%) — corte curto vira uma borda
 * dura no meio da foto, que é o mesmo defeito de recorte que se queria evitar.
 */
const DIAGONAL =
  'linear-gradient(115deg, transparent 30%, rgba(0,0,0,0.45) 52%, rgba(0,0,0,0.9) 72%, #000 82%)';

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

      {/* Pétalas só quando o painel liga — florada, Ano-Novo, semana de
          promoção. Ver o comentário do componente. */}
      <Sakura ativa={Boolean(restaurant?.sakura_ativa)} />

      {/* Noren: cortina pendurada quer dizer casa aberta. Lê o mesmo `isOpen`
          do selo logo abaixo, então nunca discordam. */}
      <Noren isOpen={isOpen} />

      {/* Saudação + tempo de entrega */}
      <section className="relative bg-ember-glow px-4 pb-2 pt-4">
        <Lanternas />

        <p className="relative font-brand text-xl text-cream">
          {firstName ? `Olá, ${firstName}` : 'Bem-vindo ao Sushi Art'}
        </p>
        {/* いらっしゃいませ — o "bem-vindo" que se grita quando alguém entra
            no restaurante. Com a tradução do lado, para não virar enfeite
            ilegível para quem não conhece. */}
        <p className="relative mt-1 font-brand text-[11px] tracking-[0.18em] text-aizome-500">
          いらっしゃいませ <span className="text-cream-faint">· bem-vindo</span>
        </p>
        <p className="relative mt-0.5 font-script text-2xl text-vinho-200">
          {restaurant?.tagline || 'Amor em forma de sushi'}
        </p>

        <div className="relative mt-3 flex flex-wrap items-center gap-2">
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

      {/* Convite para ligar os avisos, na PRIMEIRA tela.
          No Perfil ele existia, mas muita gente nunca abre o Perfil — e aí
          faz o pedido e não recebe aviso nenhum do andamento. Aqui aparece
          para quem ainda não ligou e some sozinho depois de ligado. */}
      {user && (
        <div className="mt-4 px-4">
          <AvisosDoPedido userId={user.id} compacto />
        </div>
      )}

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
              {/* Fibras de papel washi por cima do vinho: é o que resolve o
                  card grande sem foto sem precisar de imagem nenhuma. Versão
                  clara, porque sobre o vinho a fibra escura não aparece. */}
              <span aria-hidden="true" className="washi-claro pointer-events-none absolute inset-0" />
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

      {/* Antes das ofertas: quem já pediu costuma vir para repetir, e fazer
          essa pessoa rolar a home inteira até achar os mesmos itens é o
          atrito que o botão existe para remover. */}
      <PedirDeNovo userId={user?.id} produtos={products} />

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
            {byCategory.map((category, i) => {
              const Icone = iconeCategoria(category);
              // Uma foto de prato desta categoria, para o card dizer do que se
              // trata sem depender só do ícone. A primeira que existir serve:
              // os produtos já vêm na ordem definida no painel, então é a que
              // o restaurante escolheu mostrar primeiro.
              const foto = category.products.find((p) => p.image_url)?.image_url;

              return (
              <button
                key={category.id}
                type="button"
                onClick={() => navigate(`/cardapio?categoria=${category.slug}`)}
                // Foto de um lado, cor do outro, com o encontro em diagonal.
                //
                // A versão anterior não tinha foto nenhuma, porque um prato
                // recortado num retângulo baixo vira mancha colorida. Só que o
                // que resolve não é tirar a foto: é não deixar a foto ocupar a
                // parte onde vai o texto. Ela entra pela direita e se dissolve
                // na diagonal, então o nome e o preço caem sempre sobre cor
                // cheia — legíveis com qualquer foto — e o prato aparece do
                // outro lado dizendo do que é a categoria.
                // Coluna com o texto empurrado para baixo, em vez do texto solto
                // em `absolute bottom-0`: naquele arranjo a figura ficava no
                // fluxo e o título fora dele, então num card de 96 px os dois se
                // encontravam e o nome passava por cima da figura. Em coluna
                // eles não têm como se sobrepor, em qualquer altura de card.
                className={clsx(
                  'relative flex h-28 flex-col overflow-hidden rounded-card bg-gradient-to-br p-3 text-left shadow-card',
                  'transition-transform active:scale-[0.98]',
                  fundoCategoria(i)
                )}
              >
                {/* Ondas seigaiha por cima do gradiente: o card deixa de ser
                    um retângulo de cor chapada e ganha tecido. */}
                <span
                  aria-hidden="true"
                  className="seigaiha pointer-events-none absolute inset-0 text-white opacity-[0.09]"
                />

                {foto ? (
                  <img
                    src={foto}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                    // A máscara é o que faz a diagonal: onde ela é transparente
                    // a foto some e sobra a cor; onde é opaca, a foto aparece.
                    // Com `-webkit-` junto porque o Safari ainda pede.
                    style={{ maskImage: DIAGONAL, WebkitMaskImage: DIAGONAL }}
                    className="pointer-events-none absolute inset-y-0 right-0 h-full w-[58%] object-cover"
                  />
                ) : (
                  // Sem foto, o ícone grande volta a preencher o canto.
                  <Icone className="pointer-events-none absolute -right-3 -top-2 h-[62px] w-[62px] text-white opacity-[0.18]" />
                )}

                {/* Véu no canto de baixo à esquerda, só quando há foto.
                    Sem ele o nome e o preço caem sobre a parte clara de
                    algumas fotos e somem — testei e "Sobremesas" e "Bebidas"
                    ficaram ilegíveis. A diagonal sozinha não garante: depende
                    de como cada prato foi fotografado, e isso muda a cada foto
                    que o restaurante trocar. */}
                {foto && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-black/60 via-black/15 to-transparent"
                  />
                )}

                <Icone className="relative h-5 w-5 text-white drop-shadow" />

                <div className="relative mt-auto min-w-0">
                  <p className="truncate font-brand text-sm leading-tight text-white">
                    {category.name}
                  </p>
                  <p className="truncate text-[10px] text-white/70">
                    {category.products.length} itens · a partir de{' '}
                    {formatBRL(Math.min(...category.products.map((p) => p.effective_price_cents)))}
                  </p>
                </div>
              </button>
              );
            })}
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
