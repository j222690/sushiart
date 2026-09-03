import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { LogoMark } from '../../components/Logo';
import { Button, Card, Input } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PAINEL } from '../../lib/rotas';

export default function AdminLogin() {
  const navigate = useNavigate();
  const toast = useToast();
  const { signInWithPassword, isStaff, loading, user, signOut } = useAuth();

  const [form, setForm] = useState({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && isStaff) navigate(PAINEL, { replace: true });
  }, [loading, isStaff, navigate]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await signInWithPassword(form.email.trim(), form.password);
      // A checagem de staff acontece no AuthContext logo após o login;
      // o efeito acima redireciona quando confirmar.
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Cliente comum que chegou aqui: mostra o motivo em vez de tela branca.
  const loggedButNotStaff = !loading && user && !isStaff;

  return (
    <div className="grid min-h-screen place-items-center bg-ink bg-ember-glow px-5">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark size={72} />
          <p className="mt-4 font-script text-3xl text-cream">Sushi Art</p>
          <p className="text-[10px] uppercase tracking-[0.3em] text-cream-faint">
            Painel do restaurante
          </p>
        </div>

        <Card className="p-5">
          {loggedButNotStaff ? (
            <div className="text-center">
              <ShieldCheck size={28} className="mx-auto mb-3 text-warning" />
              <p className="text-sm text-cream">
                Esta conta não tem acesso ao painel.
              </p>
              <p className="mt-1 text-xs text-cream-muted">
                Peça a um administrador para cadastrar seu usuário na equipe.
              </p>
              <Button variant="secondary" className="mt-4 w-full" onClick={signOut}>
                Entrar com outra conta
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <Input
                label="E-mail"
                type="email"
                autoComplete="username"
                value={form.email}
                onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))}
                required
              />
              <Input
                label="Senha"
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => setForm((c) => ({ ...c, password: e.target.value }))}
                required
              />
              <Button type="submit" size="lg" className="w-full" loading={submitting || loading}>
                Entrar no painel
              </Button>

              {/* Sem entrada pelo Google aqui, de propósito — ela continua no app
                  do cliente, que é onde faz sentido.
                  O painel é conta de trabalho, criada por um administrador. Botão
                  do Google numa tela dessas convida quem passa a tentar entrar
                  com a conta pessoal, não consegue, e acha que o sistema quebrou.
                  Entrar nunca ia funcionar mesmo: o acesso é liberado pela tabela
                  de equipe, não por ter feito login. */}
              <p className="text-center text-[11px] leading-relaxed text-cream-faint">
                O acesso ao painel é liberado por um administrador.
              </p>
            </form>
          )}
        </Card>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-5 block w-full text-center text-xs text-cream-faint hover:text-cream-muted"
        >
          Ir para o app do cliente
        </button>
      </div>
    </div>
  );
}
