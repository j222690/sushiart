import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { supabase, friendlyError } from '../lib/supabase';

const AuthContext = createContext(null);

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
      setSession(data.session);
      await loadIdentity(data.session?.user?.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      loadIdentity(newSession?.user?.id);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadIdentity]);

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
