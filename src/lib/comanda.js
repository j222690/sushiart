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
</body></html>`;
}

/**
 * Abre a comanda e manda imprimir.
 *
 * Janela pequena e fechada depois: numa noite movimentada, sem o `close()` o
 * balcão termina com trinta abas abertas e o navegador arrastando.
 *
 * O `onafterprint` fecha depois que a impressão sai (ou é cancelada). O
 * `setTimeout` de reserva existe porque nem todo navegador dispara esse evento
 * — e aba que não fecha sozinha é a que vira as trinta.
 */
export function imprimirComanda(order, restaurante) {
  const janela = window.open('', '_blank', 'width=380,height=640');
  if (!janela) return { ok: false, motivo: 'O navegador bloqueou a janela de impressão.' };

  janela.document.write(htmlDaComanda(order, restaurante));
  janela.document.close();

  janela.onload = () => {
    janela.focus();
    janela.print();
  };
  janela.onafterprint = () => janela.close();
  setTimeout(() => {
    try {
      if (!janela.closed) janela.close();
    } catch {
      // Janela já fechada pela pessoa. Nada a fazer.
    }
  }, 20000);

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
