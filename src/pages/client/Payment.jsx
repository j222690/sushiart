import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Copy, Check, ExternalLink, ShieldCheck, RefreshCw, XCircle } from 'lucide-react';
import { Button, Card, Spinner } from '../../components/ui';
import Countdown from '../../components/Countdown';
import { orders as ordersApi } from '../../lib/api';
import { useRealtimeOrders } from '../../hooks/useRealtimeOrders';
import { useToast } from '../../context/ToastContext';
import { formatBRL } from '../../lib/format';

/**
 * Tela de pagamento de Pix e cartão.
 *
 * A confirmação chega por webhook → o banco atualiza o pedido → o Realtime
 * empurra a mudança pra cá. O polling de 12s é só uma rede de segurança para
 * o caso do WebSocket cair no meio da conexão do celular.
 */
export default function Payment() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [order, setOrder] = useState(null);
  const [charge, setCharge] = useState(null);
  const [starting, setStarting] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const startedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const fresh = await ordersApi.get(orderId);
      setOrder(fresh);
      return fresh;
    } catch (e) {
      setError(e.message);
      return null;
    }
  }, [orderId]);

  // Cria a cobrança no gateway uma única vez (StrictMode chama o efeito 2x).
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      const fresh = await refresh();
      if (!fresh) {
        setStarting(false);
        return;
      }

      if (fresh.payment_status === 'pago') {
        navigate(`/pedidos/${orderId}`, { replace: true });
        return;
      }

      try {
        const result = await ordersApi.startPayment(orderId);
        setCharge(result);
      } catch (e) {
        setError(e.message);
      } finally {
        setStarting(false);
      }
    })();
  }, [orderId, refresh, navigate]);

  const handleRealtime = useCallback(
    (row) => {
      setOrder((current) => ({ ...current, ...row }));
      if (row.payment_status === 'pago') {
        toast.success('Pagamento confirmado!');
        navigate(`/pedidos/${orderId}`, { replace: true });
      }
    },
    [navigate, orderId, toast]
  );

  useRealtimeOrders({ orderId, onChange: handleRealtime });

  useEffect(() => {
    const timer = setInterval(async () => {
      const fresh = await refresh();
      if (fresh?.payment_status === 'pago') {
        clearInterval(timer);
        navigate(`/pedidos/${orderId}`, { replace: true });
      }
    }, 12_000);
    return () => clearInterval(timer);
  }, [refresh, navigate, orderId]);

  function copyPix() {
    const code = charge?.pix_code || order?.payment_payload?.pix_code;
    if (!code) return;
    navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true);
        toast.success('Código Pix copiado.');
        setTimeout(() => setCopied(false), 4000);
      },
      () => toast.error('Não foi possível copiar. Selecione o código manualmente.')
    );
  }

  if (starting || !order) {
    return (
      <div className="flex flex-col items-center gap-3 py-24">
        <Spinner />
        <p className="text-sm text-cream-muted">Preparando seu pagamento...</p>
      </div>
    );
  }

  const pixCode = charge?.pix_code || order.payment_payload?.pix_code;
  const qrImage = charge?.qr_code_base64 || order.payment_payload?.qr_code_base64;
  const checkoutUrl = charge?.checkout_url || order.payment_url;
  const expiresAt = charge?.expires_at || order.payment_payload?.expires_at;

  return (
    <div className="px-4 pb-8 pt-6">
      <header className="mb-5 text-center">
        <p className="text-xs uppercase tracking-widest text-cream-faint">Pedido {order.code}</p>
        <h1 className="mt-1 font-brand text-2xl text-cream">
          {order.payment_method === 'pix' ? 'Pague com Pix' : 'Pagamento no cartão'}
        </h1>
        <p className="mt-1 text-3xl font-extrabold text-cream">{formatBRL(order.total_cents)}</p>
        {expiresAt && (
          <div className="mt-2 flex justify-center">
            <Countdown endsAt={expiresAt} onExpire={refresh} />
          </div>
        )}
      </header>

      {error && (
        <Card className="mb-4 flex items-start gap-3 border-danger/40 bg-danger/10 p-4">
          <XCircle size={18} className="mt-0.5 shrink-0 text-danger" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-cream">Não conseguimos iniciar o pagamento</p>
            <p className="mt-0.5 text-xs text-cream-muted">{error}</p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-3"
              onClick={() => {
                setError(null);
                setStarting(true);
                startedRef.current = false;
                window.location.reload();
              }}
            >
              <RefreshCw size={14} /> Tentar de novo
            </Button>
          </div>
        </Card>
      )}

      {/* Pix */}
      {order.payment_method === 'pix' && (pixCode || qrImage) && (
        <Card className="p-5">
          {qrImage && (
            <img
              src={qrImage.startsWith('data:') ? qrImage : `data:image/png;base64,${qrImage}`}
              alt="QR Code do Pix"
              className="mx-auto mb-4 h-52 w-52 rounded-xl bg-white p-2"
            />
          )}

          <p className="mb-2 text-center text-xs text-cream-muted">
            Escaneie o QR Code ou use o Pix copia e cola:
          </p>

          {pixCode && (
            <>
              <p className="max-h-24 overflow-y-auto break-all rounded-xl bg-ink-300 p-3 font-mono text-[11px] leading-relaxed text-cream-muted">
                {pixCode}
              </p>
              <Button className="mt-3 w-full" onClick={copyPix}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Código copiado' : 'Copiar código Pix'}
              </Button>
            </>
          )}
        </Card>
      )}

      {/* Cartão / checkout externo */}
      {checkoutUrl && order.payment_method !== 'pix' && (
        <Card className="p-5 text-center">
          <ShieldCheck size={30} className="mx-auto mb-3 text-success" />
          <p className="text-sm text-cream-muted">
            Você será levado ao ambiente seguro do nosso processador de pagamento para informar os
            dados do cartão. Nós não armazenamos o número do seu cartão.
          </p>
          <Button
            size="lg"
            className="mt-4 w-full"
            onClick={() => window.open(checkoutUrl, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink size={17} /> Pagar agora
          </Button>
        </Card>
      )}

      <div className="mt-5 flex items-center justify-center gap-2 text-xs text-cream-faint">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-vinho-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-vinho-500" />
        </span>
        Aguardando confirmação — esta tela muda sozinha.
      </div>

      <Button variant="ghost" className="mt-6 w-full" onClick={() => navigate(`/pedidos/${orderId}`)}>
        Ver detalhes do pedido
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="mt-1 w-full text-cream-faint"
        onClick={async () => {
          if (!window.confirm('Cancelar este pedido?')) return;
          try {
            await ordersApi.cancel(orderId, 'Cancelado pelo cliente antes do pagamento');
            toast.info('Pedido cancelado.');
            navigate('/pedidos', { replace: true });
          } catch (e) {
            toast.error(e.message);
          }
        }}
      >
        Cancelar pedido
      </Button>
    </div>
  );
}
