/**
 * O app instalado do dono abre no painel, não no cardápio.
 *
 * O problema: o dono instala o app e ele abre na home do cliente. Para chegar
 * ao painel precisa ir em Perfil e tocar sete vezes na marca — toda vez, em
 * todo turno. O gesto foi feito para ser a PORTA, não o corredor de todo dia.
 *
 * A regra aqui: quem entrou no painel uma vez, entra direto nas próximas. Fica
 * gravado neste aparelho, e não na conta — o dono pode usar o app como cliente
 * no celular pessoal e como painel no aparelho do balcão.
 *
 * Sai do modo painel pelo botão "Ir para o app do cliente", que já existe, e
 * volta pelo mesmo gesto de sempre.
 */

const CHAVE = 'sushiart.modo';

/** Foi aberto pela tela de início / como app instalado? */
export function ehAppInstalado() {
  try {
    return (
      window.navigator.standalone === true ||
      window.matchMedia?.('(display-mode: standalone)')?.matches === true
    );
  } catch {
    return false;
  }
}

export function modoPainelLigado() {
  try {
    return window.localStorage.getItem(CHAVE) === 'painel';
  } catch {
    // Aba anônima ou dados bloqueados: cai no comportamento normal, que é
    // abrir no app do cliente. Nada quebra.
    return false;
  }
}

/** Chamado quando o acesso ao painel é confirmado. */
export function ligarModoPainel() {
  try {
    window.localStorage.setItem(CHAVE, 'painel');
  } catch {
    // Sem persistência, o dono continua entrando pelo gesto. Perde-se a
    // comodidade, não o acesso.
  }
}

export function desligarModoPainel() {
  try {
    window.localStorage.removeItem(CHAVE);
  } catch {
    // Idem.
  }
}

/**
 * Este carregamento deve pular direto para o painel?
 *
 * As três condições, e cada uma existe por um motivo:
 *
 *   `ehAppInstalado()`  — no navegador a pessoa digita o endereço que quiser, e
 *                         sequestrar a home ali atrapalharia quem só quer ver o
 *                         cardápio. O desvio é comodidade de app instalado.
 *   `modoPainelLigado()`— o aparelho já foi usado como painel alguma vez.
 *   `ehStaff`           — quem decide é o servidor, não o `localStorage`. Um
 *                         cliente que mexesse na chave à mão cairia numa tela
 *                         que a RLS recusa de qualquer jeito — mas nem chega
 *                         lá, porque esta condição olha a resposta do banco.
 *
 * `caminho` evita o desvio quando a pessoa abriu um link específico: quem toca
 * numa notificação de pedido quer ver o pedido, não o painel.
 */
export function devePularParaPainel(ehStaff, caminho) {
  return ehStaff && modoPainelLigado() && ehAppInstalado() && caminho === '/';
}
