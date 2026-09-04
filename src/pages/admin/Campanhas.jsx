import { useCallback, useEffect, useState } from 'react';
import { Megaphone, Sparkles, Send, Check, Users } from 'lucide-react';
import clsx from 'clsx';
import { Button, Card, Input, Skeleton, Textarea } from '../../components/ui';
import { adminCampanhas } from '../../lib/adminApi';
import { useToast } from '../../context/ToastContext';

/**
 * Disparar um aviso para a base de clientes.
 *
 * A biblioteca tem 25 mensagens escritas, mas escolher uma no meio do serviço
 * é trabalho que ninguém faz. Por isso a tela abre com uma JÁ ESCOLHIDA pelo
 * sistema, com o motivo à mostra — o restaurante só confere e envia.
 *
 * A automação sugere; ela não decide. Trocar de mensagem ou escrever a própria
 * está a um clique, e o texto sugerido é editável antes de sair.
 */
export default function Campanhas() {
  const toast = useToast();

  const [sugestao, setSugestao] = useState(null);
  const [modelos, setModelos] = useState(null);
  const [form, setForm] = useState({ titulo: '', corpo: '', link: '/ofertas' });
  const [enviando, setEnviando] = useState(false);
  const [enviadas, setEnviadas] = useState(null);
  const [verBiblioteca, setVerBiblioteca] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [s, m, h] = await Promise.all([
        adminCampanhas.sugerir(),
        adminCampanhas.modelos(),
        adminCampanhas.historico(),
      ]);
      setSugestao(s);
      setModelos(m);
      setEnviadas(h);
      // Abre já preenchida com a sugestão: o caminho de menor esforço deve ser
      // o de mandar algo bom, não o de mandar nada.
      if (s) setForm({ titulo: s.titulo, corpo: s.corpo, link: s.link || '/ofertas' });
    } catch (error) {
      toast.error(error.message);
      setModelos([]);
      setEnviadas([]);
    }
  }, [toast]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function usarModelo(m) {
    setForm({ titulo: m.titulo, corpo: m.corpo, link: m.link || '/ofertas' });
    setVerBiblioteca(false);
  }

  async function enviar() {
    if (!form.titulo.trim() || !form.corpo.trim()) {
      toast.error('Escreva um título e uma mensagem.');
      return;
    }
    // Campanha vai para TODA a base e não dá para desfazer. Uma confirmação
    // aqui custa um clique e evita o aviso mandado por engano no meio do
    // serviço — que chega em todo mundo e não volta atrás.
    if (!window.confirm(`Enviar "${form.titulo}" para todos os clientes que aceitam avisos?`)) {
      return;
    }

    setEnviando(true);
    try {
      await adminCampanhas.enviar(form);
      toast.success('Campanha enviada.');
      carregar();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setEnviando(false);
    }
  }

  if (modelos === null) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  const porCategoria = modelos.reduce((acc, m) => {
    (acc[m.categoria] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div>
      <header className="mb-5">
        <h1 className="font-brand text-2xl text-cream">Campanhas</h1>
        <p className="text-sm text-cream-muted">
          Um aviso para quem tem o app e aceita receber ofertas.
        </p>
      </header>

      {/* A sugestão do sistema, com o motivo. Mostrar o porquê é o que faz o
          restaurante confiar (ou discordar com razão) em vez de só obedecer. */}
      {sugestao && (
        <Card className="mb-4 border-vinho/30 bg-vinho-50 p-4">
          <div className="flex items-start gap-3">
            <Sparkles size={18} className="mt-0.5 shrink-0 text-vinho" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-cream">
                Sugestão de agora · {sugestao.categoria}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-cream-muted">{sugestao.motivo}</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setForm({
                  titulo: sugestao.titulo,
                  corpo: sugestao.corpo,
                  link: sugestao.link || '/ofertas',
                })
              }
            >
              Usar
            </Button>
          </div>
        </Card>
      )}

      <Card className="mb-4 p-4">
        <div className="space-y-3.5">
          <Input
            label="Título"
            value={form.titulo}
            onChange={(e) => setForm((c) => ({ ...c, titulo: e.target.value }))}
            maxLength={60}
            hint={`${form.titulo.length}/60 · aparece em negrito na notificação`}
          />
          <Textarea
            label="Mensagem"
            rows={3}
            value={form.corpo}
            onChange={(e) => setForm((c) => ({ ...c, corpo: e.target.value }))}
            maxLength={160}
            hint={`${form.corpo.length}/160 · o celular corta o que passar disso`}
          />
          <Input
            label="Abre em"
            value={form.link}
            onChange={(e) => setForm((c) => ({ ...c, link: e.target.value }))}
            hint="Para onde vai quem tocar no aviso. Ex: /ofertas, /cardapio"
          />
        </div>

        {/* Prévia: é assim que chega no celular. Ver antes de mandar evita o
            título cortado no meio e o texto que só fazia sentido na cabeça de
            quem escreveu. */}
        <div className="mt-4 rounded-xl border border-line bg-ink-300 p-3.5">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-cream-faint">
            Como vai chegar
          </p>
          <div className="flex gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-vinho-gradient text-xs font-bold text-white">
              SA
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-cream">
                {form.titulo || 'Título do aviso'}
              </p>
              <p className="text-xs leading-snug text-cream-muted">
                {form.corpo || 'A mensagem aparece aqui.'}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button loading={enviando} onClick={enviar}>
            <Send size={15} /> Enviar para os clientes
          </Button>
          <Button variant="secondary" onClick={() => setVerBiblioteca((v) => !v)}>
            <Megaphone size={15} />
            {verBiblioteca ? 'Fechar biblioteca' : `Escolher outra (${modelos.length})`}
          </Button>
        </div>

        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-cream-faint">
          <Users size={13} className="mt-0.5 shrink-0" />
          Só recebe quem instalou o app, ligou os avisos e não desmarcou &ldquo;avisos de
          ofertas&rdquo; no perfil. Aviso de pedido é outra coisa e chega sempre.
        </p>
      </Card>

      {/* A biblioteca */}
      {verBiblioteca && (
        <div className="mb-4 space-y-4">
          {Object.entries(porCategoria).map(([categoria, itens]) => (
            <Card key={categoria} className="p-4">
              <h2 className="mb-2.5 font-brand text-base text-cream">{categoria}</h2>
              <div className="space-y-2">
                {itens.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => usarModelo(m)}
                    className={clsx(
                      'w-full rounded-xl border border-line bg-ink-300 p-3 text-left transition-colors',
                      'hover:border-vinho/40'
                    )}
                  >
                    <p className="text-sm font-semibold text-cream">{m.titulo}</p>
                    <p className="mt-0.5 text-xs text-cream-muted">{m.corpo}</p>
                    {m.dica_horario && (
                      <p className="mt-1.5 text-[11px] text-cream-faint">
                        Melhor hora: {m.dica_horario}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Histórico: serve para não repetir e para ver o que já foi tentado. */}
      <Card className="p-4">
        <h2 className="mb-3 font-brand text-base text-cream">Últimos envios</h2>
        {enviadas?.length ? (
          <ul className="divide-y divide-line">
            {enviadas.map((n) => (
              <li key={n.id} className="flex items-start gap-2.5 py-2.5">
                <Check size={14} className="mt-0.5 shrink-0 text-success" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-cream">{n.title}</p>
                  <p className="truncate text-xs text-cream-muted">{n.body}</p>
                </div>
                <span className="shrink-0 text-[11px] text-cream-faint">
                  {new Date(n.created_at).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                  })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-cream-muted">Nenhuma campanha enviada ainda.</p>
        )}
      </Card>
    </div>
  );
}
