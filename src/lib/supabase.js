import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Falha cedo e com mensagem clara em vez de erro críptico de rede depois.
  throw new Error(
    'Supabase não configurado. Copie .env.example para .env e preencha ' +
      'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.'
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Chaves separadas evitam que o login do admin derrube a sessão do
    // cliente na mesma máquina (o dono testando o app no próprio celular).
    storageKey: window.location.pathname.startsWith('/admin')
      ? 'sushiart.admin.auth'
      : 'sushiart.client.auth',
  },
});

/**
 * Erros do PostgREST vêm com uma casca técnica ("new row violates...").
 * As exceptions das nossas RPCs já trazem texto pronto para o usuário —
 * aqui devolvemos a melhor mensagem disponível.
 */
export function friendlyError(error, fallback = 'Algo deu errado. Tente de novo.') {
  if (!error) return fallback;
  const message = error.message || error.error_description || '';

  if (/Invalid login credentials/i.test(message)) return 'E-mail ou senha incorretos.';
  if (/User already registered/i.test(message)) return 'Este e-mail já tem cadastro.';
  if (/Email not confirmed/i.test(message)) return 'Confirme seu e-mail antes de entrar.';
  if (/Password should be at least/i.test(message)) return 'A senha precisa de ao menos 6 caracteres.';
  if (/rate limit|too many requests/i.test(message)) return 'Muitas tentativas. Aguarde um minuto.';
  if (/JWT expired|session/i.test(message)) return 'Sua sessão expirou. Entre novamente.';
  if (/Failed to fetch|NetworkError/i.test(message)) return 'Sem conexão com o servidor.';

  return message || fallback;
}
