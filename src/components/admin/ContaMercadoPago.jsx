import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Wallet, AlertTriangle, CheckCircle2, ExternalLink, Unlink } from 'lucide-react';
import { Button, Card } from '../ui';
import { adminSettings } from '../../lib/adminApi';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../lib/format';

/**
 * Conectar a conta do Mercado Pago do restaurante.
 *
 * O que está em jogo é para onde vai o dinheiro. Sem conexão, as cobranças
 * saem do token de ambiente — que é do desenvolvedor — e o valor de cada
 * pedido cai na conta DELE. O sistema funciona, o cliente paga, a cozinha
 * recebe o pedido, e nada denuncia o problema até alguém conferir o extrato.
 *
 * Por isso o aviso de "não conectado" é vermelho e não some: silêncio aqui
 * custa o faturamento inteiro.
 */
export default function ContaMercadoPago() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [conectando, setConectando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setStatus(await adminSettings.mercadoPagoStatus());
    } catch (error) {
      toast.error(error.message);
      setStatus({ connected: false });
    }
  }, [toast]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // O retorno do Mercado Pago cai nesta página com `?mp=conectado` ou
  // `?mp=erro&mensagem=...`. Lemos, avisamos e limpamos a URL — deixar o
  // parâmetro faria o aviso reaparecer a cada recarga.
  useEffect(() => {
    const resultado = params.get('mp');
    if (!resultado) return;

    if (resultado === 'conectado') {
      toast.success('Conta do Mercado Pago conectada.');
      carregar();
    } else {
      toast.error(params.get('mensagem') || 'Não foi possível conectar.');
    }

    setParams({}, { replace: true });
  }, [params, setParams, toast, carregar]);

  async function conectar() {
    setConectando(true);
    try {
      const url = await adminSettings.mercadoPagoConnectUrl();
      // Na mesma aba, de propósito: o Mercado Pago devolve o navegador para o
      // painel no fim, e numa aba nova o dono ficaria com duas telas abertas
      // sem saber qual é a boa.
      window.location.href = url;
    } catch (error) {
      toast.error(error.message);
      setConectando(false);
    }
  }

  async function desconectar() {
    if (!window.confirm('Desconectar a conta? As cobranças voltam a sair da conta do desenvolvedor.')) {
      return;
    }
    try {
      await adminSettings.mercadoPagoDisconnect();
      toast.success('Conta desconectada.');
      carregar();
    } catch (error) {
      toast.error(error.message);
    }
  }

  if (!status) return null;

  // -------------------------------------------------------------------------
  if (!status.connected) {
    return (
      <Card className="mb-4 border-danger/40 bg-danger/10 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-cream">
              O dinheiro está caindo na conta errada
            </p>
            <p className="mt-1 text-sm text-cream-muted">
              Nenhuma conta do Mercado Pago foi conectada, então as cobranças de Pix e cartão
              saem da conta do desenvolvedor. Conecte a conta do restaurante para o valor de
              cada pedido cair onde deve.
            </p>
            <Button className="mt-3" loading={conectando} onClick={conectar}>
              <Wallet size={16} /> Conectar Mercado Pago
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  // -------------------------------------------------------------------------
  return (
    <Card className={status.expired ? TOM_VENCIDO : TOM_OK}>
      <div className="flex flex-wrap items-start gap-3">
        {status.expired ? (
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" />
        ) : (
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" />
        )}

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-cream">
            {status.expired
              ? 'A autorização do Mercado Pago venceu'
              : 'Recebendo na conta do restaurante'}
          </p>

          <p className="mt-1 text-sm text-cream-muted">
            {status.nickname || status.email || `Conta ${status.mp_user_id}`}
            {status.connected_at && (
              <> · conectada em {formatDateTime(status.connected_at)}</>
            )}
          </p>

          {status.expired && (
            <p className="mt-1 text-sm text-warning">
              Reconecte: enquanto isso, as cobranças voltam para a conta do desenvolvedor.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" loading={conectando} onClick={conectar}>
              <ExternalLink size={14} /> {status.expired ? 'Reconectar' : 'Trocar de conta'}
            </Button>
            <Button variant="ghost" size="sm" onClick={desconectar}>
              <Unlink size={14} /> Desconectar
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Amarelo quando a autorização venceu, verde quando está tudo certo. */
const TOM_VENCIDO = 'mb-4 border-warning/40 bg-warning/10 p-4';
const TOM_OK = 'mb-4 border-success/40 bg-success/10 p-4';
