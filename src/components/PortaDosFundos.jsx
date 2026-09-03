import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PAINEL_ENTRAR } from '../lib/rotas';

/** Quantos toques abrem o painel. */
const TOQUES = 7;

/** Só começa a dar sinal na reta final — antes disso, ninguém descobre sem querer. */
const AVISA_A_PARTIR_DE = 4;

/**
 * Parou de tocar por este tempo, a contagem zera.
 *
 * 2,5s e não 1,5s: quem não conhece o gesto toca devagar, olhando para ver se
 * aconteceu alguma coisa. Apertado demais, o dono toca sete vezes, não chega a
 * lugar nenhum e conclui que não funciona.
 */
const JANELA_MS = 2500;

/**
 * A porta dos fundos do painel.
 *
 * O problema que ela resolve: o app instalado no celular abre direto na home
 * do cliente, e não existe link nenhum para o painel ali. O dono teria que
 * digitar o endereço na barra do navegador toda vez — e num app instalado,
 * que roda sem barra de endereço, isso simplesmente não dá.
 *
 * Sete toques seguidos na marca abrem a tela de entrada do painel. É o mesmo
 * gesto das opções de desenvolvedor do Android, e pelo mesmo motivo: precisa
 * ser fácil para quem sabe e improvável para quem não sabe. Cliente que toca
 * na logo uma ou duas vezes por curiosidade não chega a lugar nenhum.
 *
 * IMPORTANTE: isto NÃO é segurança. Não esconde nada nem protege nada — a
 * tela de entrada do painel é pública, e quem souber o endereço
 * chega nela do mesmo jeito. Quem realmente barra a entrada é o login e a
 * tabela de equipe, no servidor. Aqui é só conveniência: um atalho para o
 * dono, que não polui o app do cliente com um botão que não é para ele.
 */
export default function PortaDosFundos({ children, className }) {
  const navigate = useNavigate();
  const toques = useRef(0);
  const ultimo = useRef(0);
  const [faltam, setFaltam] = useState(0);

  function tocar() {
    const agora = Date.now();

    // Sequência quebrada recomeça do um — e não do zero, porque este toque
    // conta. Zerar aqui faria o gesto precisar de oito toques na prática.
    toques.current = agora - ultimo.current > JANELA_MS ? 1 : toques.current + 1;
    ultimo.current = agora;

    if (toques.current >= TOQUES) {
      toques.current = 0;
      setFaltam(0);
      navigate(PAINEL_ENTRAR);
      return;
    }

    const restam = TOQUES - toques.current;
    setFaltam(restam <= TOQUES - AVISA_A_PARTIR_DE ? restam : 0);
  }

  return (
    <div className={className}>
      {/* `div` com onClick, e não `button`: isto envolve a marca do app, que
          para o cliente não é um controle. Anunciar como botão faria o leitor
          de tela oferecer uma ação que não leva a nada para quem não é da
          casa. Por isso também não recebe foco de teclado. */}
      <div onClick={tocar} className="cursor-default select-none">
        {children}
      </div>

      {faltam > 0 && (
        <p className="mt-2 text-center text-[11px] text-cream-faint" role="status">
          Faltam {faltam} {faltam === 1 ? 'toque' : 'toques'} para abrir o painel
        </p>
      )}
    </div>
  );
}
