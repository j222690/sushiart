import { formatBRL, formatDateTime, formatPhone } from './format';
import { ON_DELIVERY_KINDS, paymentLabel } from './constants';

/**
 * A comanda que vai grampeada no pacote.
 *
 * Saiu de dentro da tela de Pedidos para cá por dois motivos: passou a ser
 * chamada de dois lugares (o botão e a impressão automática), e porque montar
 * HTML no meio de um componente de 400 linhas foi onde o bug abaixo se
 * escondeu por tanto tempo.
 *
 * IMPRESSORA TÉRMICA
 *
 * `@page { size: 80mm auto }` é o que faz a bobina de 80 mm sair certa. Sem
 * isso o navegador assume A4, e a comanda sai com uma margem gigante de um
 * lado e cortada do outro — ou pior, o rolo inteiro é puxado para imprimir
 * meia página em branco.
 *
 * `auto` na altura, e não uma medida fixa: comanda de um item e comanda de
 * quinze têm alturas diferentes, e papel térmico é contínuo.
 */

function escapar(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Monta o HTML da comanda. Separado da impressão para poder ser testado. */
export function htmlDaComanda(order, restaurante = {}) {
  const itens = (order.order_items ?? [])
    .map(
      (item) => `
      <tr>
        <td class="qtd">${item.quantity}x</td>
        <td>
          ${escapar(item.product_name)}
          ${(item.addons ?? []).length ? `<div class="sub">+ ${escapar(item.addons.map((a) => a.name).join(', '))}</div>` : ''}
          ${item.notes ? `<div class="obs">** ${escapar(item.notes)} **</div>` : ''}
        </td>
        <td class="valor">${formatBRL(item.total_cents)}</td>
      </tr>`
    )
    .join('');

  const endereco = order.address_snapshot;
  const cliente = order.customers;

  // ---------------------------------------------------------------------
  // Os avisos que mudam o que o entregador leva na mão.
  //
  // Aqui morava um bug: as duas condições estavam numa expressão só, e como
  // `+` tem precedência maior que `? :`, o que o JavaScript lia era
  // `('' + undefined) ? 'LEVAR MAQUININHA' : ''`. A string "undefined" é
  // verdadeira, então TODA comanda mandava levar a maquininha — inclusive as
  // de dinheiro — e o aviso de taxa a combinar nunca era impresso.
  //
  // Separadas, cada uma responde pelo que é.
  // ---------------------------------------------------------------------
  const avisos = [];
  if (order.fee_to_arrange) avisos.push('** TAXA DE ENTREGA A COMBINAR **');
  if (ON_DELIVERY_KINDS[order.on_delivery_kind]?.machine) avisos.push('** LEVAR MAQUININHA **');
  if (order.change_for_cents) {
    avisos.push(
      `** LEVAR TROCO: ${formatBRL(order.change_for_cents - order.total_cents)} **`
    );
  }

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Comanda ${escapar(order.code)}</title>
<style>
  /* Bobina térmica de 80 mm. Sem isto o navegador assume A4. */
  @page { size: 80mm auto; margin: 3mm; }

  body {
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: 12px; line-height: 1.35; color: #000; margin: 0;
  }
  h1 { font-size: 15px; margin: 0; letter-spacing: 1px; }
  .codigo { font-size: 22px; font-weight: 700; letter-spacing: 1px; }
  .tipo {
    font-size: 15px; font-weight: 700; text-align: center;
    border: 2px solid #000; padding: 3px 0; margin: 6px 0;
  }
  table { width: 100%; border-collapse: collapse; }
  .qtd { vertical-align: top; padding: 3px 6px 3px 0; font-weight: 700; }
  .valor { text-align: right; vertical-align: top; padding: 3px 0; }
  .sub { font-size: 11px; }
  .obs { font-size: 11px; font-style: italic; font-weight: 700; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  .total { font-size: 16px; font-weight: 700; }
  .aviso { font-weight: 700; font-size: 13px; margin-top: 3px; }
  .endereco { font-size: 13px; }
  .endereco strong { font-size: 14px; }
  .rodape { text-align: center; font-size: 10px; margin-top: 8px; }

  /* O convite para o app.
     A térmica alimenta papel até fechar a página do driver, e sobrava um palmo
     em branco em toda comanda. Esse papel já foi gasto de qualquer jeito — vale
     mais como convite do que como espaço vazio. */
  .promo { text-align: center; margin-top: 10px; }
  .promo-titulo { font-size: 14px; font-weight: 700; letter-spacing: 1px; }
  .promo-texto { font-size: 11px; font-weight: 700; margin: 2px 0 5px; }
  /* 34 mm numa bobina de 80: a 203 dpi dá cerca de 7 pontos por módulo, bem
     acima do mínimo para leitura confiável, e ainda sobra margem lateral. */
  .qr { width: 34mm; height: 34mm; display: block; margin: 0 auto; }
</style></head><body>

  <h1>SUSHI ART</h1>
  <div class="codigo">${escapar(order.code)}</div>
  <div>${formatDateTime(order.created_at)}</div>

  <div class="tipo">${order.fulfillment === 'entrega' ? 'ENTREGA' : 'RETIRADA'}</div>

  ${
    cliente
      ? `<div>${escapar(cliente.name || 'Cliente')}${cliente.phone ? ` · ${escapar(formatPhone(cliente.phone))}` : ''}</div>`
      : ''
  }

  <hr>
  <table>${itens}</table>
  <hr>

  <div>Subtotal: ${formatBRL(order.subtotal_cents)}</div>
  ${order.delivery_fee_cents ? `<div>Entrega: ${formatBRL(order.delivery_fee_cents)}</div>` : ''}
  ${order.discount_cents ? `<div>Desconto: -${formatBRL(order.discount_cents)}</div>` : ''}
  <div class="total">TOTAL: ${formatBRL(order.total_cents)}</div>
  <div>Pagamento: ${escapar(paymentLabel(order))}</div>

  ${avisos.map((a) => `<div class="aviso">${a}</div>`).join('')}

  ${
    endereco
      ? `<hr><div class="endereco">
           <strong>${escapar(endereco.street)}, ${escapar(endereco.number)}</strong><br>
           ${escapar(endereco.neighborhood)}${endereco.complement ? ` — ${escapar(endereco.complement)}` : ''}
           ${endereco.reference ? `<br>Ref: ${escapar(endereco.reference)}` : ''}
         </div>`
      : ''
  }

  ${order.notes ? `<hr><div class="obs">OBS: ${escapar(order.notes)}</div>` : ''}

  <div class="rodape">${escapar(restaurante.name || 'Sushi Art — Empório do Sushi')}</div>

  <hr>
  <div class="promo">
    <div class="promo-titulo">ACESSE NOSSO APP</div>
    <div class="promo-texto">E GANHE DESCONTOS<br>POR TEMPO ILIMITADO</div>
    ${QR_DO_APP}
  </div>
</body></html>`;
}

/**
 * O QR do app, desenhado uma vez e guardado aqui.
 *
 * POR QUE FIXO, E NÃO GERADO NA HORA
 *
 * O endereço nunca muda, então gerar a cada comanda seria recalcular sempre a
 * mesma coisa — e exigiria uma biblioteca de QR no pacote que o cliente baixa,
 * por algo que só a cozinha vê. Desenhado, custa 2,8 KB de texto e
 * imprime sem depender de rede, que é o que importa às 21h de um sábado.
 *
 * Correção de erro no nível Q (25%): para esta URL ele ocupa exatamente os
 * mesmos 29 módulos que o nível M, então a robustez extra sai de graça. E ela
 * importa numa térmica, onde a impressão sai falhada quando a bobina está no
 * fim ou o papel pega gordura no balcão.
 *
 * Conferido: o código foi decodificado de volta e devolveu a URL exata.
 */
const QR_DO_APP = `<svg class="qr" viewBox="-4 -4 37 37" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><rect x="-4" y="-4" width="37" height="37" fill="#fff"/><path fill="#000" d="M0 0h7v1h-7zM8 0h3v1h-3zM12 0h2v1h-2zM16 0h1v1h-1zM18 0h3v1h-3zM22 0h7v1h-7zM0 1h1v1h-1zM6 1h1v1h-1zM10 1h1v1h-1zM12 1h1v1h-1zM15 1h1v1h-1zM17 1h1v1h-1zM22 1h1v1h-1zM28 1h1v1h-1zM0 2h1v1h-1zM2 2h3v1h-3zM6 2h1v1h-1zM9 2h3v1h-3zM13 2h1v1h-1zM19 2h2v1h-2zM22 2h1v1h-1zM24 2h3v1h-3zM28 2h1v1h-1zM0 3h1v1h-1zM2 3h3v1h-3zM6 3h1v1h-1zM9 3h1v1h-1zM17 3h4v1h-4zM22 3h1v1h-1zM24 3h3v1h-3zM28 3h1v1h-1zM0 4h1v1h-1zM2 4h3v1h-3zM6 4h1v1h-1zM8 4h1v1h-1zM13 4h1v1h-1zM15 4h1v1h-1zM18 4h3v1h-3zM22 4h1v1h-1zM24 4h3v1h-3zM28 4h1v1h-1zM0 5h1v1h-1zM6 5h1v1h-1zM8 5h4v1h-4zM13 5h1v1h-1zM15 5h1v1h-1zM20 5h1v1h-1zM22 5h1v1h-1zM28 5h1v1h-1zM0 6h7v1h-7zM8 6h1v1h-1zM10 6h1v1h-1zM12 6h1v1h-1zM14 6h1v1h-1zM16 6h1v1h-1zM18 6h1v1h-1zM20 6h1v1h-1zM22 6h7v1h-7zM9 7h1v1h-1zM15 7h2v1h-2zM19 7h2v1h-2zM1 8h7v1h-7zM11 8h1v1h-1zM14 8h3v1h-3zM18 8h1v1h-1zM23 8h2v1h-2zM28 8h1v1h-1zM2 9h1v1h-1zM5 9h1v1h-1zM11 9h2v1h-2zM16 9h9v1h-9zM28 9h1v1h-1zM0 10h1v1h-1zM2 10h1v1h-1zM4 10h3v1h-3zM8 10h2v1h-2zM11 10h1v1h-1zM13 10h1v1h-1zM15 10h1v1h-1zM17 10h1v1h-1zM20 10h3v1h-3zM25 10h1v1h-1zM3 11h1v1h-1zM8 11h2v1h-2zM11 11h3v1h-3zM18 11h1v1h-1zM21 11h3v1h-3zM25 11h1v1h-1zM27 11h1v1h-1zM1 12h1v1h-1zM6 12h2v1h-2zM10 12h2v1h-2zM15 12h3v1h-3zM19 12h3v1h-3zM23 12h1v1h-1zM25 12h4v1h-4zM2 13h2v1h-2zM5 13h1v1h-1zM8 13h3v1h-3zM14 13h1v1h-1zM17 13h1v1h-1zM19 13h4v1h-4zM24 13h2v1h-2zM27 13h2v1h-2zM2 14h3v1h-3zM6 14h2v1h-2zM10 14h1v1h-1zM12 14h2v1h-2zM15 14h3v1h-3zM20 14h1v1h-1zM22 14h2v1h-2zM0 15h4v1h-4zM5 15h1v1h-1zM7 15h2v1h-2zM10 15h4v1h-4zM17 15h4v1h-4zM22 15h1v1h-1zM24 15h2v1h-2zM0 16h2v1h-2zM3 16h1v1h-1zM6 16h1v1h-1zM9 16h1v1h-1zM16 16h1v1h-1zM25 16h4v1h-4zM0 17h3v1h-3zM11 17h1v1h-1zM15 17h1v1h-1zM18 17h5v1h-5zM24 17h1v1h-1zM27 17h2v1h-2zM0 18h1v1h-1zM2 18h1v1h-1zM4 18h1v1h-1zM6 18h2v1h-2zM13 18h1v1h-1zM15 18h4v1h-4zM22 18h2v1h-2zM26 18h1v1h-1zM0 19h1v1h-1zM8 19h5v1h-5zM14 19h2v1h-2zM20 19h1v1h-1zM22 19h1v1h-1zM24 19h2v1h-2zM27 19h1v1h-1zM0 20h1v1h-1zM2 20h2v1h-2zM5 20h3v1h-3zM12 20h2v1h-2zM15 20h1v1h-1zM17 20h1v1h-1zM19 20h8v1h-8zM28 20h1v1h-1zM8 21h2v1h-2zM12 21h2v1h-2zM16 21h1v1h-1zM19 21h2v1h-2zM24 21h2v1h-2zM27 21h2v1h-2zM0 22h7v1h-7zM8 22h3v1h-3zM13 22h1v1h-1zM15 22h2v1h-2zM18 22h3v1h-3zM22 22h1v1h-1zM24 22h1v1h-1zM0 23h1v1h-1zM6 23h1v1h-1zM8 23h1v1h-1zM11 23h2v1h-2zM19 23h2v1h-2zM24 23h2v1h-2zM27 23h1v1h-1zM0 24h1v1h-1zM2 24h3v1h-3zM6 24h1v1h-1zM8 24h2v1h-2zM11 24h2v1h-2zM14 24h2v1h-2zM18 24h1v1h-1zM20 24h9v1h-9zM0 25h1v1h-1zM2 25h3v1h-3zM6 25h1v1h-1zM8 25h1v1h-1zM10 25h2v1h-2zM15 25h2v1h-2zM19 25h3v1h-3zM23 25h1v1h-1zM25 25h1v1h-1zM0 26h1v1h-1zM2 26h3v1h-3zM6 26h1v1h-1zM8 26h7v1h-7zM19 26h6v1h-6zM27 26h1v1h-1zM0 27h1v1h-1zM6 27h1v1h-1zM8 27h2v1h-2zM11 27h2v1h-2zM14 27h1v1h-1zM16 27h1v1h-1zM20 27h1v1h-1zM22 27h1v1h-1zM24 27h2v1h-2zM27 27h1v1h-1zM0 28h7v1h-7zM11 28h1v1h-1zM13 28h1v1h-1zM16 28h2v1h-2zM19 28h1v1h-1zM21 28h2v1h-2zM24 28h3v1h-3z"/></svg>`;

// 1px CSS = 1/96 polegada. Convertido pra mm porque é o que o `@page` entende.
const PX_PARA_MM = 25.4 / 96;

// Sobra no fim do rolo. Sem isso, um conteúdo que bate exatamente no limite
// do preset corta a última linha (normalmente o rodapé) fora do papel.
const FOLGA_MM = 12;

/**
 * A POS-80 não aceita altura contínua/arbitrária — só os tamanhos que estão
 * cadastrados no driver dela. Mandar um valor fora dessa lista (como o `auto`
 * do CSS, ou qualquer mm calculado livremente) é o que fazia a impressão
 * "passar" pelo spooler sem nada sair no papel.
 *
 * Em ordem crescente: pega-se o menor que couber o conteúdo.
 */
const ALTURAS_SUPORTADAS_MM = [210, 279];

/**
 * Monta a comanda e manda imprimir.
 *
 * UM IFRAME ESCONDIDO, E NÃO UMA JANELA NOVA
 *
 * `window.open` só é permitido logo depois de um clique da pessoa. A impressão
 * automática acontece sem clique nenhum — o pedido chega sozinho — e aí o
 * navegador bloqueia a janela. Com a aba em segundo plano, que é o caso normal
 * numa cozinha (o painel fica atrás do sistema de caixa), ele bloqueia sempre.
 *
 * Era esse o motivo de "não imprime sozinho quando não estou na tela do app".
 *
 * Um iframe escondido não passa pelo bloqueador de pop-up, não rouba o foco de
 * quem está digitando outra coisa, não deixa janela órfã pelo balcão, e chama
 * a mesma caixa de impressão do navegador.
 *
 * ALTURA FIXA EM VEZ DE `auto`
 *
 * O `@page { size: 80mm auto }` no HTML da comanda funciona liso numa
 * impressora virtual (Salvar como PDF), mas a maioria dos drivers GDI de
 * térmica real — a POS-80 incluída — não lida direito com altura automática:
 * o Chrome resolve isso pra algum tamanho fixo do driver (às vezes A4), o
 * trabalho é aceito pelo spooler, mas a impressora fica esperando uma página
 * que nunca fecha do jeito que ela espera — por isso parece que imprimiu e
 * nada sai.
 *
 * Por isso aqui a gente mede a altura real do conteúdo já renderizado
 * (comanda de 1 item e de 15 itens têm alturas bem diferentes) e sobrescreve
 * o `@page` com um valor fixo em mm antes de chamar `print()`.
 *
 * O iframe é removido depois que a impressão sai (ou é cancelada). O
 * `setTimeout` de reserva existe porque nem todo navegador dispara
 * `onafterprint` — e iframe que não some vira centenas ao longo de um turno.
 */
export function imprimirComanda(order, restaurante) {
  const quadro = document.createElement('iframe');
  quadro.setAttribute('aria-hidden', 'true');
  quadro.setAttribute('tabindex', '-1');
  // Fora da vista, sem ocupar espaço e sem participar do layout da página.
  quadro.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(quadro);

  const doc = quadro.contentDocument;
  if (!doc) {
    quadro.remove();
    return { ok: false, motivo: 'O navegador não permitiu preparar a comanda.' };
  }

  doc.open();
  doc.write(htmlDaComanda(order, restaurante));
  doc.close();

  let encerrado = false;
  const remover = () => {
    if (encerrado) return;
    encerrado = true;
    quadro.remove();
  };

  const imprimir = () => {
    const janela = quadro.contentWindow;
    if (!janela) {
      remover();
      return;
    }

    // Altura real do conteúdo, já com o body renderizado. Pega o menor preset
    // que o driver aceita e que couber. Se a comanda for maior que o maior
    // preset (pedido enorme, incomum), usa o maior mesmo — melhor cortar o fim
    // de uma comanda gigante do que não imprimir nada.
    const medir = () => {
      const mm = Math.ceil(doc.body.scrollHeight * PX_PARA_MM) + FOLGA_MM;
      return (
        ALTURAS_SUPORTADAS_MM.find((h) => h >= mm) ??
        ALTURAS_SUPORTADAS_MM[ALTURAS_SUPORTADAS_MM.length - 1]
      );
    };

    let alturaEscolhida = medir();

    // O CONVITE DO APP NÃO PODE CUSTAR PAPEL
    //
    // Ele existe para ocupar a sobra que a térmica ia alimentar em branco de
    // qualquer jeito. Num pedido grande, porém, a comanda já chega perto do
    // limite do preset — e aí o bloco empurraria para o preset seguinte,
    // gastando quase sete centímetros a mais de papel só para caber um anúncio.
    // Isso inverte o propósito.
    //
    // Então: se ele não couber de graça, sai. O pedido é o que tem que sair.
    const promo = doc.querySelector('.promo');
    if (promo && alturaEscolhida !== ALTURAS_SUPORTADAS_MM[0]) {
      const separador = promo.previousElementSibling;
      promo.style.display = 'none';
      if (separador?.tagName === 'HR') separador.style.display = 'none';

      const semPromo = medir();
      if (semPromo < alturaEscolhida) {
        alturaEscolhida = semPromo;
      } else {
        // Não mudou de preset: o papel seria alimentado do mesmo jeito, então
        // o convite volta — sai de graça.
        promo.style.display = '';
        if (separador?.tagName === 'HR') separador.style.display = '';
      }
    }

    const sobrescreveAltura = doc.createElement('style');
    // Depois no cascade do que o @page original em htmlDaComanda, então vence.
    sobrescreveAltura.textContent = `@page { size: 80mm ${alturaEscolhida}mm; margin: 3mm; }`;
    doc.head.appendChild(sobrescreveAltura);

    janela.onafterprint = remover;

    try {
      // `focus()` no iframe (e não na página) porque o Safari imprime a página
      // de fora quando o foco não está no documento que se quer imprimir.
      janela.focus();
      janela.print();
    } catch {
      remover();
    }
  };

  // A comanda é texto puro — sem imagem nem fonte externa para esperar. Então
  // logo depois do `close()` o documento já está pronto para medir. O `onload`
  // cobre o navegador que ainda não terminou de montar.
  if (doc.readyState === 'complete') {
    setTimeout(imprimir, 50);
  } else {
    quadro.onload = imprimir;
  }

  // Rede de segurança: `onafterprint` não é garantido em todo navegador, e sem
  // isto o iframe ficaria pendurado no DOM a cada pedido.
  setTimeout(remover, 60000);

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Impressão automática
//
// É o comportamento de iFood: o pedido entra e a comanda já sai, para ser
// grampeada no pacote. Fica desligada por padrão porque depende de impressora
// ligada e de o navegador permitir janela nova — e um painel que tenta abrir
// janela toda hora sem impressora do outro lado é um estorvo.
// ---------------------------------------------------------------------------
const CHAVE = 'sushiart.imprimir-auto';

export function impressaoAutomatica() {
  try {
    return window.localStorage.getItem(CHAVE) === 'on';
  } catch {
    return false;
  }
}

export function definirImpressaoAutomatica(ligada) {
  try {
    window.localStorage.setItem(CHAVE, ligada ? 'on' : 'off');
  } catch {
    // Sem persistência a preferência não sobrevive ao recarregar. O botão
    // continua funcionando na sessão.
  }
}
