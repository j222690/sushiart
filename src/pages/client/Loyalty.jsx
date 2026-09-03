import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Gift, TrendingUp, TrendingDown, Wallet, Award } from 'lucide-react';
import { Button, Card, EmptyState, Skeleton } from '../../components/ui';
import CartelaCarimbos from '../../components/CartelaCarimbos';
import Indicacao from '../../components/Indicacao';
import { promo } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatBRL, formatDateTime } from '../../lib/format';

export default function Loyalty() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, customer } = useAuth();

  const [balance, setBalance] = useState(null);
  const [config, setConfig] = useState(null);
  const [history, setHistory] = useState(null);
  const [redeeming, setRedeeming] = useState(false);

  // Cartela, crédito, nível e indicações. Todos com `catch` que zera em vez de
  // derrubar a tela: o programa que estiver desligado no painel simplesmente
  // não aparece, e uma consulta que falhou não pode esconder o saldo de
  // pontos, que é o motivo de a pessoa ter aberto esta tela.
  const [carimbos, setCarimbos] = useState(0);
  const [credito, setCredito] = useState(0);
  const [nivel, setNivel] = useState(null);
  const [indicacoes, setIndicacoes] = useState([]);

  const load = useCallback(() => {
    if (!user) return;
    promo.loyaltyBalance().then(setBalance).catch(() => setBalance(0));
    promo.loyaltyConfig().then(setConfig).catch(() => setConfig(null));
    promo.loyaltyHistory(user.id).then(setHistory).catch(() => setHistory([]));
    promo.stampCount().then(setCarimbos).catch(() => setCarimbos(0));
    promo.creditBalance().then(setCredito).catch(() => setCredito(0));
    promo.tier().then(setNivel).catch(() => setNivel(null));
    promo.myReferrals(user.id).then(setIndicacoes).catch(() => setIndicacoes([]));
  }, [user]);

  useEffect(() => {
    if (!user) navigate('/entrar?next=/fidelidade', { replace: true });
    else load();
  }, [user, load, navigate]);

  async function handleRedeem() {
    setRedeeming(true);
    try {
      const result = await promo.redeemLoyalty();
      toast.success(`Cupom ${result.coupon_code} gerado! Use no seu próximo pedido.`);
      load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setRedeeming(false);
    }
  }

  if (balance === null || !config) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-20" />
      </div>
    );
  }

  const goal = config.points_to_reward;
  const progress = Math.min(100, Math.round((balance / goal) * 100));
  const missing = Math.max(0, goal - balance);

  const rewardLabel =
    config.reward_kind === 'percentual'
      ? `${Number(config.reward_percent)}% de desconto`
      : `${formatBRL(config.reward_cents)} de desconto`;

  return (
    <div className="px-4 pb-8 pt-4">
      <button
        type="button"
        onClick={() => navigate('/perfil')}
        className="mb-4 flex items-center gap-1.5 text-sm text-cream-muted hover:text-cream"
      >
        <ArrowLeft size={16} /> Perfil
      </button>

      <h1 className="mb-1 font-brand text-2xl text-cream">Programa de fidelidade</h1>
      <p className="mb-5 text-sm text-cream-muted">
        A cada R$ 1 gasto você ganha {Number(config.points_per_real)}{' '}
        {Number(config.points_per_real) === 1 ? 'ponto' : 'pontos'}.
      </p>

      {/* Saldo e progresso */}
      <Card className="overflow-hidden bg-ember-glow p-5 text-center">
        <Sparkles size={26} className="mx-auto text-ember" />
        <p className="mt-2 text-4xl font-extrabold tabular-nums text-cream">{balance}</p>
        <p className="text-xs uppercase tracking-widest text-cream-muted">pontos</p>

        <div className="mt-5">
          <div className="h-2.5 overflow-hidden rounded-full bg-ink-300">
            <div
              className="h-full rounded-full bg-gradient-to-r from-vinho-500 to-ember transition-[width] duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-cream-muted">
            {missing > 0
              ? `Faltam ${missing} pontos para ${rewardLabel}`
              : `Você já pode resgatar ${rewardLabel}!`}
          </p>
        </div>

        <Button
          size="lg"
          variant={missing > 0 ? 'secondary' : 'ember'}
          className="mt-4 w-full"
          disabled={missing > 0}
          loading={redeeming}
          onClick={handleRedeem}
        >
          <Gift size={17} />
          {missing > 0 ? `Resgatar com ${goal} pontos` : 'Resgatar recompensa'}
        </Button>
      </Card>

      {/* Crédito e nível lado a lado: são dois números curtos, e empilhados
          empurrariam a cartela para fora da primeira tela. */}
      {(credito > 0 || nivel) && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {credito > 0 && (
            <Card className="p-4">
              <Wallet size={17} className="text-success" />
              <p className="mt-1.5 text-xl font-extrabold tabular-nums text-cream">
                {formatBRL(credito)}
              </p>
              <p className="text-[11px] uppercase tracking-wider text-cream-muted">
                em crédito
              </p>
            </Card>
          )}

          {nivel && (
            <Card className="p-4">
              <Award size={17} className="text-ember" />
              <p className="mt-1.5 truncate text-xl font-extrabold text-cream">{nivel.name}</p>
              <p className="truncate text-[11px] text-cream-muted">
                {nivel.perk || 'Seu nível atual'}
              </p>
            </Card>
          )}
        </div>
      )}

      <CartelaCarimbos carimbos={carimbos} config={config} />

      <Indicacao
        codigo={customer?.referral_code}
        indicacoes={indicacoes}
        config={config}
      />

      {config.expire_days && (
        <p className="mt-3 text-center text-[11px] text-cream-faint">
          Os pontos expiram em {config.expire_days} dias após serem creditados.
        </p>
      )}

      {/* Extrato */}
      <section className="mt-7">
        <h2 className="mb-3 font-brand text-lg text-cream">Extrato</h2>

        {history === null ? (
          <Skeleton className="h-24" />
        ) : history.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Sem movimentações"
            description="Faça um pedido e comece a acumular pontos."
          />
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {history.map((tx) => {
              const positive = tx.points > 0;
              return (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                  {positive ? (
                    <TrendingUp size={16} className="shrink-0 text-success" />
                  ) : (
                    <TrendingDown size={16} className="shrink-0 text-vinho-300" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-cream">{tx.description || tx.kind}</p>
                    <p className="text-[11px] text-cream-faint">{formatDateTime(tx.created_at)}</p>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-bold tabular-nums ${
                      positive ? 'text-success' : 'text-vinho-300'
                    }`}
                  >
                    {positive ? '+' : ''}
                    {tx.points}
                  </span>
                </div>
              );
            })}
          </Card>
        )}
      </section>
    </div>
  );
}
