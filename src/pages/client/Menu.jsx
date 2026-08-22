import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UtensilsCrossed } from 'lucide-react';
import clsx from 'clsx';
import ProductCard from '../../components/ProductCard';
import ProductSheet from '../../components/ProductSheet';
import { EmptyState, Skeleton } from '../../components/ui';
import { useMenu, useFavorites } from '../../hooks/useMenu';
import { useAuth } from '../../context/AuthContext';
import { menu as menuApi } from '../../lib/api';

export default function Menu() {
  const [params, setParams] = useSearchParams();
  const { byCategory, loading } = useMenu();
  const { user } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();
  const [selected, setSelected] = useState(null);
  const [activeSlug, setActiveSlug] = useState(null);

  const sectionRefs = useRef({});
  const slugFromUrl = params.get('categoria');
  const productFromUrl = params.get('produto');

  // Link direto para um produto (banner ou compartilhamento) abre o detalhe.
  useEffect(() => {
    if (!productFromUrl) return;
    menuApi
      .product(productFromUrl)
      .then(setSelected)
      .catch(() => undefined);
  }, [productFromUrl]);

  // Rola até a categoria pedida na URL assim que o cardápio carrega.
  useEffect(() => {
    if (!slugFromUrl || loading) return;
    const node = sectionRefs.current[slugFromUrl];
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSlug(slugFromUrl);
    }
  }, [slugFromUrl, loading, byCategory.length]);

  // Destaca a aba da categoria visível enquanto o cliente rola a lista.
  useEffect(() => {
    if (loading) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveSlug(visible.target.dataset.slug);
      },
      { rootMargin: '-120px 0px -70% 0px' }
    );

    Object.values(sectionRefs.current).forEach((node) => node && observer.observe(node));
    return () => observer.disconnect();
  }, [loading, byCategory.length]);

  const tabs = useMemo(() => byCategory.map((c) => ({ slug: c.slug, name: c.name })), [byCategory]);

  function goToCategory(slug) {
    setParams({ categoria: slug }, { replace: true });
    sectionRefs.current[slug]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  if (byCategory.length === 0) {
    return (
      <EmptyState
        icon={UtensilsCrossed}
        title="Cardápio em atualização"
        description="Estamos ajustando os pratos. Volte em instantes."
      />
    );
  }

  return (
    <div>
      {/* Abas de categoria */}
      <nav
        aria-label="Categorias"
        className="no-scrollbar sticky top-[57px] z-20 flex gap-2 overflow-x-auto border-b border-line bg-ink-600/95 px-4 py-2.5 backdrop-blur"
      >
        {tabs.map((tab) => (
          <button
            key={tab.slug}
            type="button"
            onClick={() => goToCategory(tab.slug)}
            className={clsx(
              'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
              activeSlug === tab.slug
                ? 'bg-vinho-500 text-white'
                : 'bg-ink-300 text-cream-muted hover:text-cream'
            )}
          >
            {tab.name}
          </button>
        ))}
      </nav>

      {byCategory.map((category) => (
        <section
          key={category.id}
          data-slug={category.slug}
          ref={(node) => {
            sectionRefs.current[category.slug] = node;
          }}
          className="scroll-mt-28 px-4 pt-6"
        >
          <h2 className="mb-3 font-brand text-xl text-cream">{category.name}</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {category.products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onClick={() => setSelected(product)}
                isFavorite={isFavorite(product.id)}
                onToggleFavorite={user ? toggleFavorite : null}
              />
            ))}
          </div>
        </section>
      ))}

      <ProductSheet
        product={selected}
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null);
          if (productFromUrl) setParams({}, { replace: true });
        }}
        isFavorite={selected ? isFavorite(selected.id) : false}
        onToggleFavorite={user ? toggleFavorite : null}
      />
    </div>
  );
}
