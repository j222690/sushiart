import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * A identificacao da versao publicada.
 *
 * Existe porque a janela do painel no balcao (aberta com --app) NAO recarrega
 * quando alguem clica no atalho de novo: ela so volta para a frente. O
 * resultado e que uma correcao pode estar publicada ha horas e a cozinha
 * continuar rodando o codigo antigo, sem ninguem ter como perceber.
 *
 * Isso ja custou uma noite de investigacao as cegas: correcoes eram testadas
 * contra um JavaScript que nunca tinha sido baixado. Com a versao a mostra no
 * rodape do menu, a pergunta "voce esta no codigo novo?" se responde olhando.
 *
 * A Vercel expoe o commit em VERCEL_GIT_COMMIT_SHA. Fora dela (npm run dev), o
 * valor e 'local'.
 */
const VERSAO = (process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7);

export default defineConfig({
  define: { __VERSAO__: JSON.stringify(VERSAO) },
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(process.cwd(), 'src') },
  },
  server: { port: 5173 },
});
