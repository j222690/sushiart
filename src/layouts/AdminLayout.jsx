import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, UtensilsCrossed, Tag, Gift, CreditCard,
  BarChart3, Settings as SettingsIcon, LogOut, Menu, X, Store, Volume2, Megaphone,
} from 'lucide-react';
import clsx from 'clsx';
import { LogoMark } from '../components/Logo';
import { Badge } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import PushToggle from '../components/admin/PushToggle';
import { PAINEL, PAINEL_ENTRAR, rotaPainel } from '../lib/rotas';
import { desligarModoPainel } from '../lib/modoPainel';
import { useRealtimeOrders } from '../hooks/useRealtimeOrders';
import { useToast } from '../context/ToastContext';
import { liberarNoPrimeiroToque, prepararSino, sinoLiberado, sinoLigado, tocarSino } from '../lib/sinoDaCozinha';
import { impressaoAutomatica, imprimirComanda } from '../lib/comanda';
import { adminOrders } from '../lib/adminApi';
import { ACTIVE_STATUSES } from '../lib/constants';

const NAV = [
  { to: PAINEL, label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: rotaPainel('pedidos'), label: 'Pedidos', icon: ClipboardList },
  { to: rotaPainel('cardapio'), label: 'Cardápio', icon: UtensilsCrossed },
  { to: rotaPainel('promocoes'), label: 'Promoções', icon: Tag },
  { to: rotaPainel('campanhas'), label: 'Campanhas', icon: Megaphone },
  { to: rotaPainel('roleta'), label: 'Roleta e fidelidade', icon: Gift },
  { to: rotaPainel('pagamentos'), label: 'Pagamentos', icon: CreditCard },
  { to: rotaPainel('relatorios'), label: 'Relatórios', icon: BarChart3 },
  { to: rotaPainel('configuracoes'), label: 'Configurações', icon: SettingsIcon },
];

/**
 * O sino de pedido novo, montado no LAYOUT e não na tela de Pedidos.
 *
 * Antes o som existia só dentro de `/pedidos`. Numa cozinha real o painel fica
 * aberto onde parou — na Visão geral, no Cardápio conferindo um esgotado — e
 * ali o pedido entrava calado. Aqui embaixo do layout, toca em qualquer tela
 * do painel.
 *
 * Três toques, não um: um bipe sozinho se perde no barulho de uma cozinha em
 * movimento, e pedido não ouvido é pedido atrasado.
 */
function SinoDePedidoNovo() {
  const toast = useToast();
  const { restaurant } = useStore();
  const [bloqueado, setBloqueado] = useState(false);

  // Último status conhecido de cada pedido (Map<id, status>). Começa vazio e
  // é preenchido na primeira conferência — sem isso, ao abrir o painel com
  // dez pedidos na fila o sino tocaria dez vezes seguidas.
  //
  // É um Map de status, não um Set de ids, porque pedido com pagamento
  // pendente (Pix/cartão criado, esperando o gateway confirmar) precisa
  // ENTRAR na fila sem anunciar nada — e só anunciar depois, no momento em
  // que o pagamento for confirmado e o status mudar. Um Set só diria "já vi
  // esse id", que dispararia o anúncio cedo demais.
  const statusConhecido = useRef(null);

  // O navegador libera áudio no primeiro toque da pessoa. Enquanto isso não
  // acontece, o painel avisa — em vez de ficar mudo esperando alguém descobrir
  // no pedido perdido.
  //
  // A primeira checagem espera 6s (não 1,5s) de propósito: quem abre o painel
  // quase sempre clica em algo nesse intervalo (um pedido, uma aba) — e isso
  // já libera o som sozinho, sem o aviso chegar a aparecer. Só quem realmente
  // fica parado sem tocar em nada vê o aviso. As checagens seguintes voltam a
  // ser rápidas (1,5s), pra pegar o caso raro de o navegador suspender o som
  // no meio do uso (aba muito tempo em segundo plano, por exemplo).
  useEffect(() => {
    const solta = liberarNoPrimeiroToque();
    const primeira = setTimeout(() => setBloqueado(sinoLigado() && !sinoLiberado()), 6000);
    let conferir;
    const iniciarChecagemRapida = setTimeout(() => {
      conferir = setInterval(() => setBloqueado(sinoLigado() && !sinoLiberado()), 1500);
    }, 6000);
    return () => {
      solta();
      clearTimeout(primeira);
      clearTimeout(iniciarChecagemRapida);
      clearInterval(conferir);
    };
  }, []);

  /**
   * Anuncia um pedido novo: sino, aviso na tela e comanda.
   *
   * Num lugar só porque os dois caminhos chegam aqui — o evento do tempo real
   * e a conferência periódica. Duplicar isso seria duplicar a chance de um dos
   * dois esquecer de imprimir.
   */
  const anunciar = useCallback(
    (id, code) => {
      if (sinoLigado()) tocarSino();
      toast.success(`Pedido novo: ${code}`);

      if (impressaoAutomatica()) {
        adminOrders
          .get(id)
          .then((completo) => {
            const resultado = imprimirComanda(completo, restaurant);
            // window.open pode ser bloqueado pelo navegador (ex: pop-up sem
            // permissão fixa) sem lançar erro nenhum — sem este checagem,
            // a comanda falha e ninguém no balcão fica sabendo.
            if (!resultado.ok) {
              toast.error(
                `Não consegui imprimir a comanda do ${code} (${resultado.motivo}). Imprima pelo pedido.`
              );
            }
          })
          .catch(() => {
            toast.error(`Não consegui imprimir a comanda do ${code}. Imprima pelo pedido.`);
          });
      }
    },
    [toast, restaurant]
  );

  /**
   * Decide se ESTE pedido, NESTE status, deve anunciar — e atualiza o que a
   * gente sabe dele.
   *
   * A regra: anuncia só na transição pra um status que já vale pra cozinha
   * (tudo em ACTIVE_STATUSES exceto `aguardando_pagamento`). Isso cobre os
   * dois casos de uma vez: pedido pago na entrega/retirada, que já nasce
   * nesse status e anuncia na hora; e Pix/cartão, que nasce em
   * `aguardando_pagamento` (não anuncia nada) e só anuncia quando o webhook
   * confirma e o status muda pra `pago`. Depois disso, mudanças de status
   * seguintes (em_preparo, saiu_para_entrega…) não anunciam de novo.
   */
  const avaliar = useCallback(
    (id, code, status) => {
      const anterior = statusConhecido.current.get(id);
      statusConhecido.current.set(id, status);

      const jaValiaCozinha = anterior !== undefined && anterior !== 'aguardando_pagamento';
      const agoraValeCozinha = status !== 'aguardando_pagamento';

      if (agoraValeCozinha && !jaValiaCozinha) {
        anunciar(id, code);
      }
    },
    [anunciar]
  );

  /**
   * Confere a fila e anuncia o que for novo.
   *
   * É esta função que faz o sino funcionar mesmo quando o tempo real não
   * entrega — e ele falha de formas silenciosas demais para a cozinha depender
   * só dele. Um pedido não ouvido é um pedido atrasado.
   */
  const conferirFila = useCallback(async () => {
    try {
      const abertos = await adminOrders.list({ statuses: ACTIVE_STATUSES, limit: 40 });

      // Primeira passada só memoriza o status de cada um: o que já estava na
      // fila quando o painel abriu não é novidade — mas se algum deles
      // estiver aguardando pagamento, fica registrado como tal, e a
      // confirmação futura ainda vai anunciar normalmente.
      if (statusConhecido.current === null) {
        statusConhecido.current = new Map(abertos.map((o) => [o.id, o.status]));
        return;
      }

      for (const pedido of abertos) {
        avaliar(pedido.id, pedido.code, pedido.status);
      }
    } catch {
      // Falha de rede numa conferência não merece alarde: a próxima acontece
      // em segundos, e o tempo real pode ter pegado antes.
    }
  }, [avaliar]);

  const aoMudar = useCallback(
    (linha, evento) => {
      // O tempo real trouxe uma criação ou mudança de status: avalia na hora,
      // sem esperar a próxima conferência. UPDATE entra aqui também porque é
      // assim que a confirmação de pagamento (aguardando_pagamento → pago)
      // chega — é exatamente o evento que precisa anunciar.
      if ((evento === 'INSERT' || evento === 'UPDATE') && linha?.id) {
        if (statusConhecido.current === null) statusConhecido.current = new Map();
        avaliar(linha.id, linha.code, linha.status);
        return;
      }
      // Qualquer outra coisa (inclusive a conferência periódica): olha a fila.
      conferirFila();
    },
    [avaliar, conferirFila]
  );

  useRealtimeOrders({ onChange: aoMudar, pollMs: 10000 });

  if (!bloqueado) return null;

  return (
    <button
      type="button"
      onClick={() => {
        prepararSino();
        tocarSino(2); // duas voltas: confirmacao, nao o alarme inteiro
        setBloqueado(false);
      }}
      className="mb-4 flex w-full items-center gap-3 rounded-card border border-warning/40 bg-warning/10 px-4 py-3 text-left"
    >
      <Volume2 size={18} className="shrink-0 text-warning" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-cream">Som bloqueado pelo navegador</span>
        <span className="block text-xs text-cream-muted">
          Toque aqui para liberar o aviso de pedido novo neste aparelho.
        </span>
      </span>
    </button>
  );
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const { staff, signOut } = useAuth();
  const { isOpen, restaurant } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);

  const nav = (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-vinho-500 text-white'
                : 'text-cream-muted hover:bg-ink-300 hover:text-cream'
            )
          }
        >
          <Icon size={18} />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-ink">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-ink-600 p-4 lg:flex">
        <div className="mb-6 flex items-center gap-3 px-1">
          <LogoMark size={36} />
          <div className="min-w-0">
            <p className="font-script text-lg leading-none text-cream">Sushi Art</p>
            <p className="text-[10px] uppercase tracking-widest text-cream-faint">Painel</p>
          </div>
        </div>

        {nav}

        <div className="mt-auto space-y-3 pt-4">
          <PushToggle compact />

          <div className="rounded-xl border border-line bg-ink-500 p-3">
            <div className="flex items-center gap-2">
              <Store size={14} className="text-cream-muted" />
              <Badge tone={isOpen ? 'success' : 'danger'}>{isOpen ? 'Aberto' : 'Fechado'}</Badge>
            </div>
            <p className="mt-1.5 truncate text-[11px] text-cream-faint">{restaurant?.name}</p>
          </div>

          <div className="px-1">
            <p className="truncate text-xs font-medium text-cream">{staff?.name}</p>
            <p className="text-[11px] capitalize text-cream-faint">{staff?.role}</p>
          </div>

          <button
            type="button"
            onClick={async () => {
              await signOut();
              desligarModoPainel();
                  navigate(PAINEL_ENTRAR);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm text-cream-muted hover:bg-ink-300 hover:text-cream"
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>

      {/* Topo (mobile) */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-ink-600 px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
            className="rounded-lg p-1.5 text-cream-muted hover:bg-ink-300"
          >
            <Menu size={20} />
          </button>
          <LogoMark size={26} />
          <span className="font-script text-lg text-cream">Sushi Art</span>
          <Badge tone={isOpen ? 'success' : 'danger'} className="ml-auto">
            {isOpen ? 'Aberto' : 'Fechado'}
          </Badge>
        </header>

        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setMenuOpen(false)}
              className="absolute inset-0 bg-black/70"
            />
            <div className="relative h-full w-72 max-w-[85%] border-r border-line bg-ink-600 p-4">
              <div className="mb-6 flex items-center justify-between">
                <span className="font-script text-xl text-cream">Sushi Art</span>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Fechar menu"
                  className="rounded-lg p-1.5 text-cream-muted"
                >
                  <X size={20} />
                </button>
              </div>
              {nav}

              <div className="mt-4">
                <PushToggle compact />
              </div>

              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  desligarModoPainel();
                  navigate(PAINEL_ENTRAR);
                }}
                className="mt-6 flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm text-cream-muted"
              >
                <LogOut size={16} /> Sair
              </button>
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 p-4 lg:p-6">
          <SinoDePedidoNovo />
        <Outlet />
        </main>
      </div>
    </div>
  );
}
