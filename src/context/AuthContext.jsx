import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { supabase, friendlyError } from '../lib/supabase';
import { sincronizarInscricao } from '../lib/push';

const AuthContext = createContext(null);

/**
 * Entrega o JWT da sessão à conexão de tempo real.
 *
 * O tempo real avalia a RLS com o token que a CONEXÃO apresenta, não com o das
 * consultas normais. Sem isto ela sobe como anônima: `auth.uid()` fica nulo, a
 * política de `orders` nega tudo, e nenhum evento é entregue — sem erro no
 * console, sem aviso, sem nada.
 *
 * Era o que estava acontecendo em produção. Só funcionava logo após um login,
 * porque aí o evento `SIGNED_IN` configura a autorização por conta própria. Ao
 * RECARREGAR a página, com a sessão restaurada, a autorização não era refeita:
 *
 *   - o cliente não via o pedido andar sem recarregar;
 *   - a cozinha não ouvia o sino de pedido novo;
 *   - o Purchase do navegador não disparava no momento do pagamento.
 *
 * Os três com a mesma raiz, e nenhum deles dava sinal de erro.
 */
function autorizarRealtime(sessao) {
  try {
    supabase.realtime.setAuth(sessao?.access_token ?? null);
  } catch {
    // Versão sem o método ou conexão ainda não iniciada. O app segue
    // funcionando: o que se perde é a atualização ao vivo, não o pedido.
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [staff, setStaff] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadIdentity = useCallback(async (userId) => {
    if (!userId) {
      setCustomer(null);
      setStaff(null);
      return;
    }

    // `staff` é o que libera o /admin. Ausência de linha = cliente comum,
    // e o erro esperado (0 linhas) não deve poluir o console.
    const [{ data: customerRow }, { data: staffRow }] = await Promise.all([
      supabase.from('customers').select('*').eq('id', userId).maybeSingle(),
      supabase.from('staff').select('*').eq('user_id', userId).maybeSingle(),
    ]);

    setCustomer(customerRow ?? null);
    setStaff(staffRow?.active ? staffRow : null);
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      autorizarRealtime(data.session);
      setSession(data.session);
      await loadIdentity(data.session?.user?.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      autorizarRealtime(newSession);
      setSession(newSession);
      loadIdentity(newSession?.user?.id);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadIdentity]);

  // Mantém o registro de push em dia.
  //
  // O endpoint que o navegador entrega pode mudar sozinho — atualização do
  // browser, limpeza interna, troca de conta. Quando muda, a linha em
  // `push_tokens` vira um endereço morto e a pessoa para de receber aviso sem
  // nenhum sinal de que parou. Regravar a cada carregamento custa uma consulta
  // e cobre a falha mais silenciosa que este app tem.
  //
  // Não pede permissão: só age onde ela já foi concedida antes.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    sincronizarInscricao(userId, 'cliente');
    if (staff) sincronizarInscricao(userId, 'equipe');
  }, [session?.user?.id, staff]);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      customer,
      staff,
      isStaff: Boolean(staff),
      isAdmin: staff?.role === 'admin',
      loading,

      async signInWithPassword(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(friendlyError(error));
      },

      async signUp({ email, password, name, phone }) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name, phone } },
        });
        if (error) throw new Error(friendlyError(error));
      },

      /**
       * Entrada pelo Google.
       *
       * `redirectTo` decide para onde o cliente volta depois de autorizar. Sem
       * ele o Supabase manda para o Site URL, que jogaria quem entrou pelo
       * painel na home do app — e é justamente no meio do movimento que a
       * cozinha não quer se perder.
       */
      async signInWithGoogle(voltarPara = '/') {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: `${window.location.origin}${voltarPara}`,
            // Sem isto o Google pula a escolha de conta em quem já está logado,
            // o que atrapalha quem usa uma conta para a loja e outra pessoal.
            queryParams: { prompt: 'select_account' },
          },
        });
        if (error) throw new Error(friendlyError(error));
      },

      async signInWithOtp(email) {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw new Error(friendlyError(error));
      },

      async resetPassword(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/perfil`,
        });
        if (error) throw new Error(friendlyError(error));
      },

      async signOut() {
        await supabase.auth.signOut();
        setCustomer(null);
        setStaff(null);
      },

      refresh: () => loadIdentity(session?.user?.id),
      setCustomer,
    }),
    [session, customer, staff, loading, loadIdentity]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return ctx;
}
