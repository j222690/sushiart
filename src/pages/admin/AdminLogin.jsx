import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { LogoMark } from '../../components/Logo';
import { Button, Card, Input } from '../../components/ui';
import GoogleButton from '../../components/GoogleButton';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export default function AdminLogin() {
  const navigate = useNavigate();
  const toast = useToast();
  const { signInWithPassword, signInWithGoogle, isStaff, loading, user, signOut } = useAuth();

  const [form, setForm] = useState({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && isStaff) navigate('/admin', { replace: true });
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

  // Cliente comum que digitou /admin: mostra o motivo em vez de tela branca.
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

              <div className="flex items-center gap-3 pt-1">
                <span className="h-px flex-1 bg-line" />
                <span className="text-[11px] uppercase tracking-wider text-cream-faint">ou</span>
                <span className="h-px flex-1 bg-line" />
              </div>

              {/* Volta para /admin/entrar, não para a home: se a conta não for da
                  equipe, é aqui que está a explicação. Quem entra pelo painel no
                  meio do movimento não pode cair no app do cliente sem entender
                  por quê. */}
              <GoogleButton
                disabled={submitting || loading}
                onClick={() => signInWithGoogle('/admin/entrar')}
              />

              <p className="text-center text-[11px] leading-relaxed text-cream-faint">
                O acesso ao painel é liberado por um administrador. Entrar aqui não
                cria conta de equipe.
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
