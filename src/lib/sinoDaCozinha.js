/**
 * O som de pedido novo, para a cozinha.
 *
 * Numa cozinha em movimento ninguém está olhando a tela. A notificação aparece,
 * ninguém vê, e o pedido só é descoberto quando o cliente liga reclamando. Som
 * é o único aviso que funciona com as mãos ocupadas.
 *
 * POR QUE O SOM É GERADO, E NÃO UM ARQUIVO
 *
 * Um .mp3 precisa baixar. No começo do turno, com a rede do restaurante
 * ocupada, o primeiro pedido chegaria mudo — justamente o que não pode
 * acontecer. Gerado na hora pela Web Audio API, o som toca sempre, custa zero
 * kilobyte e nunca depende da rede.
 *
 * A NOTIFICAÇÃO DO SISTEMA NÃO RESOLVE ISSO
 *
 * Ela toca o som padrão do aparelho, que é o mesmo de qualquer mensagem — e no
 * meio do serviço ninguém distingue "chegou pedido" de "chegou WhatsApp". Este
 * toque é diferente de propósito: dois sinos em intervalo de quinta, repetidos,
 * que ninguém confunde com outra coisa.
 */

/** Um toque: dois tons curtos, como sino de balcão. */
const NOTAS = [
  { hz: 880, inicio: 0, duracao: 0.18 },   // lá
  { hz: 1320, inicio: 0.16, duracao: 0.32 }, // mi, uma quinta acima
];

let contexto = null;

/**
 * O navegador só libera áudio depois de um toque ou clique da pessoa.
 *
 * Criar o contexto antes disso o deixa "suspenso", e o primeiro pedido do turno
 * chegaria mudo. Por isso o contexto nasce no primeiro gesto e é reaproveitado.
 */
function pegarContexto() {
  if (!contexto) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    contexto = new AudioCtx();
  }
  // Navegador suspende o contexto quando a aba fica em segundo plano. Sem isso,
  // o painel aberto atrás de outra janela pararia de tocar.
  if (contexto.state === 'suspended') contexto.resume();
  return contexto;
}

/**
 * Prepara o áudio. Precisa ser chamado dentro de um clique/toque real.
 *
 * O painel chama isso quando o dono liga o som — que é justamente um clique.
 */
export function prepararSino() {
  const ctx = pegarContexto();
  return Boolean(ctx);
}

/** O áudio está liberado neste momento? */
export function sinoLiberado() {
  return contexto !== null && contexto.state === 'running';
}

/**
 * Libera o áudio no primeiro toque em qualquer lugar do painel.
 *
 * O navegador não deixa uma página tocar som antes de a pessoa interagir com
 * ela — e o pedido chega sem interação nenhuma. Sem isto, o painel ficava
 * aberto no balcão e o primeiro pedido do turno era mudo: o código rodava, os
 * osciladores eram criados, e não saía som porque o contexto estava suspenso.
 *
 * (Foi exatamente esse o meu erro ao testar: contei osciladores criados e
 * tratei isso como prova de que tocou. Criar não é tocar.)
 *
 * Qualquer clique serve — abrir um pedido, trocar de aba, mexer no menu. Na
 * prática o áudio libera nos primeiros segundos de uso e o dono nem percebe.
 */
export function liberarNoPrimeiroToque() {
  if (typeof window === 'undefined') return () => {};

  const liberar = () => {
    pegarContexto();
    if (sinoLiberado()) desmontar();
  };

  const eventos = ['pointerdown', 'keydown', 'touchstart'];
  const desmontar = () => eventos.forEach((e) => window.removeEventListener(e, liberar));

  eventos.forEach((e) => window.addEventListener(e, liberar, { passive: true }));
  return desmontar;
}

/**
 * Toca o sino.
 *
 * @param {number} repeticoes quantas vezes. Pedido novo usa 3: uma só se perde
 *                            no barulho da cozinha.
 */
export function tocarSino(repeticoes = 3) {
  const ctx = pegarContexto();
  if (!ctx) return;

  const agora = ctx.currentTime;

  for (let volta = 0; volta < repeticoes; volta += 1) {
    const atraso = volta * 0.75;

    for (const nota of NOTAS) {
      const osc = ctx.createOscillator();
      const ganho = ctx.createGain();

      // Onda triangular: mais suave que a quadrada, mais presente que a
      // senoidal. Precisa cortar o ruído sem ser desagradável a cada pedido.
      osc.type = 'triangle';
      osc.frequency.value = nota.hz;

      const inicio = agora + atraso + nota.inicio;
      const fim = inicio + nota.duracao;

      // Envelope com decaimento: começar e parar seco produz um "clique" no
      // alto-falante que soa como defeito.
      ganho.gain.setValueAtTime(0, inicio);
      ganho.gain.linearRampToValueAtTime(0.3, inicio + 0.01);
      ganho.gain.exponentialRampToValueAtTime(0.001, fim);

      osc.connect(ganho);
      ganho.connect(ctx.destination);
      osc.start(inicio);
      osc.stop(fim + 0.02);
    }
  }
}

// ---------------------------------------------------------------------------
// Preferência do aparelho
//
// Fica no aparelho e não na conta: o tablet do balcão toca, o celular do dono
// em casa fica quieto — e é a mesma conta nos dois.
// ---------------------------------------------------------------------------
const CHAVE = 'sushiart.sino';

export function sinoLigado() {
  try {
    // Ligado por padrão: um painel de cozinha que chega mudo de fábrica é um
    // pedido perdido esperando para acontecer. Quem não quiser, desliga.
    return window.localStorage.getItem(CHAVE) !== 'off';
  } catch {
    return true;
  }
}

export function definirSino(ligado) {
  try {
    window.localStorage.setItem(CHAVE, ligado ? 'on' : 'off');
  } catch {
    // Sem persistência o som volta ligado na próxima abertura, que é o padrão
    // seguro.
  }
}
