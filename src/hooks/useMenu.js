import { useCallback, useEffect, useMemo, useState } from 'react';
import { menu, profile } from '../lib/api';
import { useAuth } from '../context/AuthContext';

/** Cardápio completo + categorias, já agrupado por categoria. */
export function useMenu() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, prods] = await Promise.all([menu.categories(), menu.products()]);
      setCategories(cats);
      setProducts(prods);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byCategory = useMemo(() => {
    // Categoria sem nenhum produto ativo não vira aba vazia no cardápio.
    return categories
      .map((category) => ({
        ...category,
        products: products.filter((p) => p.category_id === category.id),
      }))
      .filter((c) => c.products.length > 0);
  }, [categories, products]);

  const bestsellers = useMemo(
    () => products.filter((p) => p.is_bestseller && !p.sold_out),
    [products]
  );

  return { categories, products, byCategory, bestsellers, loading, error, reload: load };
}

/** Favoritos como Set de ids, com toggle otimista. */
export function useFavorites() {
  const { user } = useAuth();
  const [ids, setIds] = useState(() => new Set());

  useEffect(() => {
    if (!user) {
      setIds(new Set());
      return;
    }
    profile
      .favorites(user.id)
      .then((rows) => setIds(new Set(rows.map((r) => r.id))))
      .catch(() => setIds(new Set()));
  }, [user]);

  const toggle = useCallback(
    async (product) => {
      if (!user) return false;
      const isFav = ids.has(product.id);

      // Atualiza a UI antes da rede; desfaz se o servidor recusar.
      setIds((current) => {
        const next = new Set(current);
        if (isFav) next.delete(product.id);
        else next.add(product.id);
        return next;
      });

      try {
        await profile.toggleFavorite(user.id, product.id, isFav);
      } catch {
        setIds((current) => {
          const next = new Set(current);
          if (isFav) next.add(product.id);
          else next.delete(product.id);
          return next;
        });
      }
      return !isFav;
    },
    [user, ids]
  );

  return { favoriteIds: ids, isFavorite: (id) => ids.has(id), toggleFavorite: toggle };
}
