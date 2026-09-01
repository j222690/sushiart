import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '../../components/Logo';
import { Button, Input } from '../../components/ui';
import GoogleButton from '../../components/GoogleButton';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatPhone } from '../../lib/format';

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const toast = useToast();
  const { signInWithPassword, signUp, resetPassword, signInWithGoogle } = useAuth();

  const [mode, setMode] = useState('entrar'); // entrar | criar | recuperar
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const next = params.get('next') || '/';
  const set = (field) => (e) =>
    setForm((c) => ({
      ...c,
      [field]: field === 'phone' ? formatPhone(e.target.value) : e.target.value,
    }));

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);

    try {
      if (mode === 'entrar') {
        await signInWithPassword(form.email.trim(), form.password);
        navigate(next, { replace: true });
      } else if (mode === 'criar') {
        if (!form.name.trim()) throw new Error('Informe seu nome.');
        if (form.password.length < 6) throw new Error('A senha precisa de ao menos 6 caracteres.');

        await signUp({
          email: form.email.trim(),
          password: form.password,
          name: form.name.trim(),
          phone: form.phone.replace(/\D/g, ''),
        });

        // Com confirmação de e-mail ligada no Supabase não há sessão ainda;
        // avisamos em vez de deixar a tela travada num "loading" silencioso.
        toast.success('Conta criada! Se pedirmos, confirme seu e-mail para entrar.');
        navigate(next, { replace: true });
      } else {
        await resetPassword(form.email.trim());
        toast.success('Enviamos um link de recuperação para seu e-mail.');
        setMode('entrar');
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[80vh] flex-col px-5 pt-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-6 flex w-fit items-center gap-1.5 text-sm text-cream-muted hover:text-cream"
      >
        <ArrowLeft size={16} /> Voltar
      </button>

      <div className="mb-8 flex flex-col items-center text-center">
        <Logo size="lg" />
        <p className="mt-4 font-brand text-lg italic text-vinho-200">Amor em forma de sushi</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {mode === 'criar' && (
          <>
            <Input label="Nome" value={form.name} onChange={set('name')} autoComplete="name" required />
            <Input
              label="Celular"
              value={form.phone}
              onChange={set('phone')}
              inputMode="tel"
              placeholder="(49) 99999-9999"
              hint="Usamos para avisar sobre a entrega."
            />
          </>
        )}

        <Input
          label="E-mail"
          type="email"
          value={form.email}
          onChange={set('email')}
          autoComplete="email"
          required
        />

        {mode !== 'recuperar' && (
          <Input
            label="Senha"
            type="password"
            value={form.password}
            onChange={set('password')}
            autoComplete={mode === 'criar' ? 'new-password' : 'current-password'}
            minLength={6}
            required
          />
        )}

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {mode === 'entrar' ? 'Entrar' : mode === 'criar' ? 'Criar conta' : 'Enviar link'}
        </Button>
      </form>

      {/* Fora do modo "recuperar": ali o cliente já tem conta e está atrás da
          senha, e oferecer outro caminho de entrada só confunde. */}
      {mode !== 'recuperar' && (
        <div className="mt-4">
          <div className="mb-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[11px] uppercase tracking-wider text-cream-faint">ou</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          {/* Volta para onde o cliente estava indo. Quem tocou em "entrar" no
              meio do checkout precisa cair de volta no checkout, não na home. */}
          <GoogleButton disabled={loading} onClick={() => signInWithGoogle(next)} />
        </div>
      )}

      <div className="mt-5 space-y-2 text-center text-sm">
        {mode === 'entrar' && (
          <>
            <button type="button" onClick={() => setMode('criar')} className="text-cream-muted">
              Ainda não tem conta? <span className="font-semibold text-vinho-200">Criar agora</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('recuperar')}
              className="block w-full text-xs text-cream-faint"
            >
              Esqueci minha senha
            </button>
          </>
        )}

        {mode !== 'entrar' && (
          <button type="button" onClick={() => setMode('entrar')} className="text-cream-muted">
            Já tem conta? <span className="font-semibold text-vinho-200">Entrar</span>
          </button>
        )}
      </div>

      <div className="mt-auto pb-6 pt-8 text-center text-[11px] leading-relaxed text-cream-faint">
        <p>Ao continuar você concorda em receber avisos sobre o status dos seus pedidos.</p>
        <p className="mt-1.5">
          Leia nossa{' '}
          <a href="/privacidade" className="underline underline-offset-2 hover:text-cream-muted">
            Política de Privacidade
          </a>{' '}
          e os{' '}
          <a href="/termos" className="underline underline-offset-2 hover:text-cream-muted">
            Termos de uso
          </a>.
        </p>
      </div>
    </div>
  );
}
