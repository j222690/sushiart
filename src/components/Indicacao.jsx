import { useState } from 'react';
import { Copy, Check, Share2 } from 'lucide-react';
import { Button, Card } from './ui';
import { useToast } from '../context/ToastContext';
import { formatBRL } from '../lib/format';

/**
 * Indicação premiada.
 *
 * Os dois lados ganham, e o texto diz isso na primeira linha: premiar só quem
 * indica faz o programa soar a corrente, e quem recebe o convite não tem
 * motivo nenhum para usar.
 *
 * O botão principal é o compartilhar do celular, não "copiar código" — a
 * pessoa está no WhatsApp de qualquer jeito, e cada toque a menos entre a
 * vontade de indicar e a mensagem enviada é indicação que acontece.
 */
export default function Indicacao({ codigo, indicacoes = [], config }) {
  const toast = useToast();
  const [copiado, setCopiado] = useState(false);

  if (!config?.referral_active || !codigo) return null;

  const premiadas = indicacoes.filter((i) => i.qualified_at).length;
  const pendentes = indicacoes.length - premiadas;

  const mensagem =
    `Pede sushi comigo! Usa meu código ${codigo} no Sushi Art e você já ganha ` +
    `${formatBRL(config.referral_referred_cents)} de desconto no primeiro pedido: ` +
    'https://www.sushiarts.online';

  async function compartilhar() {
    // `navigator.share` só existe em contexto seguro e na maioria dos
    // celulares. No desktop cai na cópia, que é o que dá para fazer ali.
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Sushi Art', text: mensagem });
        return;
      } catch {
        // A pessoa fechou a folha de compartilhar. Não é erro: não avisa nada.
        return;
      }
    }
    copiar(mensagem);
  }

  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      toast.success('Copiado!');
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error('Não foi possível copiar. Anote o código: ' + codigo);
    }
  }

  return (
    <Card className="mt-4 p-5">
      <h2 className="font-brand text-lg text-cream">Indique e ganhe</h2>
      <p className="mt-1 text-xs text-cream-muted">
        Seu amigo ganha {formatBRL(config.referral_referred_cents)} no primeiro pedido, e você
        ganha {formatBRL(config.referral_referrer_cents)} de crédito quando ele receber.
      </p>

      <button
        type="button"
        onClick={() => copiar(codigo)}
        className="mt-4 flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-vinho/40 bg-vinho-50 px-4 py-3 transition-colors hover:border-vinho"
      >
        <span className="font-mono text-xl font-bold tracking-[0.2em] text-vinho">{codigo}</span>
        {copiado ? (
          <Check size={17} className="shrink-0 text-success" />
        ) : (
          <Copy size={17} className="shrink-0 text-cream-muted" />
        )}
      </button>

      <Button className="mt-3 w-full" onClick={compartilhar}>
        <Share2 size={16} /> Enviar convite
      </Button>

      {indicacoes.length > 0 && (
        <p className="mt-3 text-center text-xs text-cream-muted">
          {premiadas > 0 && (
            <>
              <span className="font-semibold text-success">{premiadas}</span>{' '}
              {premiadas === 1 ? 'indicação rendeu' : 'indicações renderam'} crédito
            </>
          )}
          {premiadas > 0 && pendentes > 0 && ' · '}
          {pendentes > 0 && (
            <>
              {pendentes} {pendentes === 1 ? 'aguarda' : 'aguardam'} o primeiro pedido
            </>
          )}
        </p>
      )}
    </Card>
  );
}
