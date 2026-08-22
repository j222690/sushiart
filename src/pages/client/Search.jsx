import { useEffect, useMemo, useState } from 'react';
import { Search as SearchIcon, X, SearchX } from 'lucide-react';
import ProductCard from '../../components/ProductCard';
import ProductSheet from '../../components/ProductSheet';
import { EmptyState, Skeleton } from '../../components/ui';
import { useMenu, useFavorites } from '../../hooks/useMenu';
import { useAuth } from '../../context/AuthContext';

const normalize = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export default function Search() {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState(null);
  const { products, bestsellers, loading } = useMenu();
  const { user } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 220);
    return () => clearTimeout(timer);
  }, [term]);

  /**
   * A busca roda sobre o cardápio já carregado: é instantânea e — porque
   * normalizamos os acentos dos dois lados — "maki" acha "Hossomaki" e
   * "sashimi" acha "Sashimi de Salmão" mesmo digitado sem acento.
   */
  const results = useMemo(() => {
    const q = normalize(debounced.trim());
    if (q.length < 2) return null;

    return products
      .filter((p) => {
        const haystack = normalize(`${p.name} ${p.description ?? ''} ${p.category_name ?? ''}`);
        return q.split(/\s+/).every((word) => haystack.includes(word));
      })
      .sort((a, b) => {
        // Quem tem o termo no nome vem antes de quem só tem na descrição.
        const aName = normalize(a.name).includes(q) ? 0 : 1;
        const bName = normalize(b.name).includes(q) ? 0 : 1;
        return aName - bName || a.sort_order - b.sort_order;
      });
  }, [debounced, products]);

  return (
    <div className="p-4">
      <div className="relative">
        <SearchIcon size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cream-faint" />
        <input
          type="search"
          value={term}
          autoFocus
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Buscar por temaki, poke, combo..."
          aria-label="Buscar no cardápio"
          className="h-12 w-full rounded-xl border border-line bg-ink-300 pl-11 pr-11 text-sm text-cream placeholder:text-cream-faint focus:border-vinho-400"
        />
        {term && (
          <button
            type="button"
            onClick={() => setTerm('')}
            aria-label="Limpar busca"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-cream-faint hover:text-cream"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {loading && (
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      )}

      {!loading && results === null && (
        <section className="mt-6">
          <h2 className="mb-3 font-brand text-base text-cream">Sugestões da casa</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {bestsellers.slice(0, 6).map((product) => (
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
      )}

      {results !== null && results.length === 0 && (
        <EmptyState
          icon={SearchX}
          title={`Nada encontrado para "${debounced}"`}
          description="Tente outro termo — ou dê uma olhada no cardápio completo."
        />
      )}

      {results !== null && results.length > 0 && (
        <section className="mt-4">
          <p className="mb-3 text-xs text-cream-muted">
            {results.length} {results.length === 1 ? 'resultado' : 'resultados'}
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {results.map((product) => (
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
      )}

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
