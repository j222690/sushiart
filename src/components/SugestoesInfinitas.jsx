import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import ProductCard from './ProductCard';
import { LISTA_PRODUTOS } from '../lib/constants';

const POR_LEVA = 6;
const TETO = 60; // ~10 levas: passou disso, ninguém está mais escolhendo comida

/**
 * Embaralha uma cópia, com semente fixa por leva.
 *
 * `Math.random` direto dentro do render daria uma ordem nova a cada re-render e
 * os cards ficariam pulando de lugar enquanto o cliente rola. A semente amarra
 * a ordem à leva: a leva 3 é sempre a mesma leva 3 nesta sessão.
 */
function embaralhar(lista, semente) {
  const copia = [...lista];
  let s = semente * 9301 + 49297;
  for (let i = copia.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/**
 * "Que tal também?" — sugestões que vão carregando enquanto o cliente rola.
 *
 * Não é o cardápio repetido: é um bloco separado, com título próprio, depois do
 * cardápio ter terminado de verdade. A diferença importa. Repetir o catálogo
 * embaralhado faria o cliente ver o mesmo combo três vezes e concluir que o app
 * está quebrado — e ainda quebraria as abas de categoria, que deixariam de
 * apontar para um lugar só.
 *
 * Aqui as abas seguem funcionando, a busca segue funcionando, e quem quiser
 * continuar rolando encontra comida nova para olhar.
 */
export default function SugestoesInfinitas({ produtos, onSelect, isFavorite, onToggleFavorite }) {
  const [levas, setLevas] = useState(1);
  const sentinelaRef = useRef(null);

  // Sem foto o card vira fallback de marca; numa vitrine de sugestão, uma
  // sequência desses parece cardápio quebrado em vez de convite.
  const elegiveis = useMemo(() => produtos.filter((p) => p.image_url && p.active && !p.sold_out), [produtos]);

  const visiveis = useMemo(() => {
    const saida = [];
    for (let leva = 0; leva < levas; leva++) {
      const ordem = embaralhar(elegiveis, leva + 1);
      saida.push(...ordem.slice(0, POR_LEVA).map((p) => ({ produto: p, chave: `${leva}-${p.id}` })));
    }
    return saida;
  }, [elegiveis, levas]);

  const chegouAoTeto = visiveis.length >= TETO || elegiveis.length === 0;

  useEffect(() => {
    if (chegouAoTeto) return undefined;
    const alvo = sentinelaRef.current;
    if (!alvo) return undefined;

    // rootMargin adianta o carregamento: a próxima leva chega antes de o
    // cliente bater no fim, então ele nunca vê a lista parar.
    const observer = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) setLevas((n) => n + 1);
      },
      { rootMargin: '400px 0px' }
    );

    observer.observe(alvo);
    return () => observer.disconnect();
  }, [chegouAoTeto]);

  const abrir = useCallback((produto) => onSelect(produto), [onSelect]);

  if (elegiveis.length === 0) return null;

  return (
    <section className="px-4 pb-2 pt-8">
      <div className="mb-1 flex items-center gap-2">
        <Sparkles size={18} className="text-ember" />
        <h2 className="font-brand text-xl text-cream">Que tal também?</h2>
      </div>
      <p className="mb-3 text-xs text-cream-muted">Escolhidos da casa, sempre em ordem diferente.</p>

      <div className={LISTA_PRODUTOS}>
        {visiveis.map(({ produto, chave }) => (
          <ProductCard
            key={chave}
            product={produto}
            onClick={abrir}
            isFavorite={isFavorite(produto.id)}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </div>

      {chegouAoTeto ? (
        <p className="pt-6 text-center text-xs text-cream-faint">
          Você viu o cardápio inteiro. Bom apetite!
        </p>
      ) : (
        <div ref={sentinelaRef} className="grid place-items-center py-6">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-vinho-500" />
        </div>
      )}
    </section>
  );
}
