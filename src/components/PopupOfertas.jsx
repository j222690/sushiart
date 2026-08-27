import { useEffect, useState } from 'react';
import { X, Ticket, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui';
import { formatBRL } from '../lib/format';
import { home, promo } from '../lib/api';

const CHAVE_MEMORIA = 'sushiart:popup-ofertas';
const UMA_VEZ_POR_DIA = 24 * 3600 * 1000;

/**
 * Popup de boas-vindas com os cupons do dia e o convite da roleta.
 *
 * Aparece uma vez por dia, não a cada abertura: um popup que volta em toda
 * navegação deixa de ser oferta e vira obstáculo, e a pessoa aprende a fechá-lo
 * sem ler. A marca fica no `localStorage` do próprio aparelho — é preferência
 * de quem está olhando, não dado de conta.
 */
export default function PopupOfertas() {
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [cupons, setCupons] = useState([]);
  const [podeGirar, setPodeGirar] = useState(false);

  useEffect(() => {
    let visto = 0;
    try {
      visto = Number(localStorage.getItem(CHAVE_MEMORIA) || 0);
    } catch {
      // Aba anônima ou cookies bloqueados: sem memória, mostra e segue.
    }
    if (Date.now() - visto < UMA_VEZ_POR_DIA) return;

    // Só abre se houver algo a oferecer. Popup vazio é só um obstáculo.
    Promise.all([
      home.publicCoupons().catch(() => []),
      promo.canSpin().catch(() => null),
    ]).then(([lista, giro]) => {
      const temCupom = Array.isArray(lista) && lista.length > 0;
      const temGiro = Boolean(giro?.can_spin);
      if (!temCupom && !temGiro) return;

      setCupons((lista || []).slice(0, 3));
      setPodeGirar(temGiro);
      setAberto(true);
    });
  }, []);

  function fechar() {
    try {
      localStorage.setItem(CHAVE_MEMORIA, String(Date.now()));
    } catch {
      // Sem memória disponível: fecha assim mesmo.
    }
    setAberto(false);
  }

  function irPara(destino) {
    fechar();
    navigate(destino);
  }

  if (!aberto) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-black/55 p-0 sm:place-items-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Ofertas de hoje"
      onClick={fechar}
    >
      <div
        className="w-full max-w-md animate-slide-up overflow-hidden rounded-t-2xl bg-ink-500 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative bg-vinho-gradient px-5 pb-6 pt-5 text-center">
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/15 text-white"
          >
            <X size={16} />
          </button>

          <span className="block text-4xl leading-none">🎁</span>
          <p className="mt-2 font-brand text-xl text-white">Tem oferta esperando você</p>
          <p className="mt-1 text-xs text-white/80">
            {podeGirar ? 'Cupons do dia e um giro grátis na roleta' : 'Cupons para usar no pedido de hoje'}
          </p>
        </div>

        <div className="space-y-2.5 p-4">
          {cupons.map((cupom) => (
            <div key={cupom.id} className="flex items-center gap-3 rounded-xl border border-line bg-ink-300 p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-vinho-500 text-white">
                <Ticket size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-bold tracking-wide text-cream">{cupom.code}</p>
                <p className="line-clamp-1 text-[11px] text-cream-muted">
                  {cupom.description}
                  {cupom.min_order_cents > 0 && ` · a partir de ${formatBRL(cupom.min_order_cents)}`}
                </p>
              </div>
            </div>
          ))}

          {podeGirar && (
            <button
              type="button"
              onClick={() => irPara('/ofertas#roleta')}
              className="flex w-full items-center gap-3 rounded-xl border border-ember/40 bg-ember/10 p-3 text-left"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ember text-white text-lg">
                🎡
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-cream">Seu giro está liberado</p>
                <p className="text-[11px] text-cream-muted">Gire a roleta e ganhe mais um cupom</p>
              </div>
              <Sparkles size={16} className="shrink-0 text-ember" />
            </button>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="secondary" className="flex-1" onClick={fechar}>
              Agora não
            </Button>
            <Button className="flex-1" onClick={() => irPara('/ofertas')}>
              Ver ofertas
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
