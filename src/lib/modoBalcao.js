/**
 * O modo balcão: o aparelho da cozinha se configura sozinho.
 *
 * O sino já nasce ligado, mas a impressão automática nasce DESLIGADA de
 * propósito — se viesse ligada, o painel aberto no celular do dono passaria o
 * turno tentando imprimir em uma impressora que não existe ali.
 *
 * A consequência é que alguém precisa ligar a impressão no aparelho do balcão.
 * Em tese, uma vez só: a preferência fica no `localStorage`. Na prática ela se
 * perde — o Chrome configurado para limpar dados ao fechar, um perfil novo,
 * uma janela anônima — e aí toda abertura do turno começa com alguém tendo que
 * lembrar de dois botões. Lembrar funciona até a noite em que não funciona, e
 * o preço é a comanda que não saiu.
 *
 * Então o endereço carrega a intenção: quem abre com `?balcao=1` está dizendo
 * "este aparelho é o do balcão". O atalho da área de trabalho tem isso fixo, e
 * a máquina se configura em toda abertura, sem depender de memória de ninguém.
 *
 * O celular do dono, que abre pelo endereço normal, continua quieto.
 */

import { definirSino } from './sinoDaCozinha';
import { definirImpressaoAutomatica } from './comanda';

const PARAMETRO = 'balcao';

/**
 * Lê o endereço e, se for o aparelho do balcão, liga som e impressão.
 *
 * Roda antes do React montar (é chamada em `main.jsx`), e não dentro de um
 * componente, porque a tela de Pedidos lê estas preferências no primeiro
 * render para desenhar os botões. Ligar depois deixaria os botões mostrando
 * "desligado" enquanto o comportamento já estava ligado — a pior combinação,
 * porque a pessoa clica para ligar e acaba desligando.
 *
 * @returns {boolean} se o modo balcão foi aplicado.
 */
export function aplicarModoBalcao() {
  if (typeof window === 'undefined') return false;

  let ligar = false;
  try {
    ligar = new URLSearchParams(window.location.search).get(PARAMETRO) === '1';
  } catch {
    // Endereço estranho demais para ler. Segue como aparelho comum.
    return false;
  }

  if (!ligar) return false;

  definirSino(true);
  definirImpressaoAutomatica(true);
  return true;
}
