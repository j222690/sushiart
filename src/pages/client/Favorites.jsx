import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Heart } from 'lucide-react';
import ProductCard from '../../components/ProductCard';
import ProductSheet from '../../components/ProductSheet';
import { Button, EmptyState, Skeleton } from '../../components/ui';
import { menu, profile } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useFavorites } from '../../hooks/useMenu';

export default function Favorites() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();
  const [rows, setRows] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!user) return;
    profile
      .favorites(user.id)
      .then(setRows)
      .catch(() => setRows([]));
  }, [user]);

  /**
   * `favorites` traz a linha crua de `products`, sem o preço promocional.
   * Buscamos a versão pública para o card mostrar a oferta vigente.
   */
  async function openProduct(product) {
    try {
      setSelected(await menu.product(product.id));
    } catch {
      setSelected(product);
    }
  }

  if (!user) {
    return (
      <EmptyState
        icon={Heart}
        title="Entre para salvar favoritos"
        description="Guarde seus pratos preferidos e peça em dois toques."
        action={
          <Button className="mt-2" onClick={() => navigate('/entrar?next=/favoritos')}>
            Entrar
          </Button>
        }
      />
    );
  }

  return (
    <div className="px-4 pb-8 pt-4">
      <button
        type="button"
        onClick={() => navigate('/perfil')}
        className="mb-4 flex items-center gap-1.5 text-sm text-cream-muted hover:text-cream"
      >
        <ArrowLeft size={16} /> Perfil
      </button>

      <h1 className="mb-4 font-brand text-2xl text-cream">Favoritos</h1>

      {rows === null ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Nenhum favorito ainda"
          description="Toque no coração de um prato para guardá-lo aqui."
          action={
            <Button className="mt-2" onClick={() => navigate('/cardapio')}>
              Ver cardápio
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {rows
            // Some da lista assim que o cliente desmarca, sem precisar recarregar.
            .filter((product) => isFavorite(product.id))
            .map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onClick={() => openProduct(product)}
                isFavorite
                onToggleFavorite={toggleFavorite}
              />
            ))}
        </div>
      )}

      <ProductSheet
        product={selected}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        isFavorite={selected ? isFavorite(selected.id) : false}
        onToggleFavorite={toggleFavorite}
      />
    </div>
  );
}
