/**
 * Onde vive o painel do restaurante.
 *
 * O endereço sai do `.env` (`VITE_ADMIN_PATH`) em vez de ser `/admin` fixo.
 * Um endereço adivinhável é varrido o dia inteiro por robô — a maioria testa
 * `/admin`, `/wp-admin`, `/administrator` e segue a vida. Com um código no
 * lugar, essa varredura não acha nada.
 *
 * O QUE ISSO **NÃO** É
 *
 * Não é segredo. Variável com prefixo `VITE_` é compilada dentro do JavaScript
 * que vai para o navegador — quem abrir o código-fonte da página acha o
 * endereço. Também não é senha: chegar na tela de entrada não entra em nada.
 *
 * O que realmente barra a entrada continua no servidor, e não mudou: o login
 * do Supabase e a tabela de equipe (`is_admin()` na RLS). Mesmo com o endereço
 * em mãos, sem estar na equipe não se lê uma linha do banco.
 *
 * Então isto tira o painel do radar dos robôs, e é só isso que faz.
 */
const CODIGO = import.meta.env.VITE_ADMIN_PATH || 'admin';

/** Base do painel, já com a barra: `/66j8gm76zn`. */
export const PAINEL = `/${CODIGO}`;

/** Tela de entrada do painel. */
export const PAINEL_ENTRAR = `${PAINEL}/entrar`;

/** Monta um endereço interno do painel: `rotaPainel('pedidos')`. */
export function rotaPainel(caminho = '') {
  return caminho ? `${PAINEL}/${caminho}` : PAINEL;
}
