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
 * toque é diferente de propósito e ninguém confunde com outra coisa.
 */

/**
 * Um toque: três tons subindo, curtos e agudos.
 *
 * Ficou mais agudo que a versão anterior (880/1320 Hz) porque grave se perde:
 * exaustor, fritadeira e conversa vivem na faixa baixa, e um som ali some no
 * meio de tudo. Acima de 1,5 kHz o ouvido separa do ruído de cozinha mesmo com
 * a máquina ligada.
 *
 * Subindo em vez de dois tons alternados: sequência ascendente lê como alarme,
 * e é isso que se quer — não um "pling" simpático que a pessoa ignora.
 */
const NOTAS = [
  { hz: 1568, inicio: 0, duracao: 0.14 },    // sol 6
  { hz: 2093, inicio: 0.12, duracao: 0.14 }, // dó 7
  { hz: 2637, inicio: 0.24, duracao: 0.30 }, // mi 7
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
 * Toca o alarme de pedido novo.
 *
 * Desenhado para ser ouvido do outro lado da cozinha, com exaustor ligado.
 * A primeira versão era um "pling" educado de dois tons: tocava, e ninguém se
 * ligava que tinha saído pedido — que é o mesmo que não tocar.
 *
 * O que faz ele cortar o ruído:
 *
 *   DURA.        Uns dois segundos e meio, não meio. Alarme curto acontece
 *                enquanto a pessoa está de mãos na massa e passa despercebido.
 *   EMPILHA.     Cada nota são dois osciladores levemente desafinados. Duas
 *                fontes somam amplitude e batem entre si, o que o ouvido lê
 *                como "mais alto" bem além do que o volume sozinho dá.
 *   COMPRIME.    Um compressor segura os picos, e aí dá para subir o volume
 *                geral sem estourar. É o mesmo truque de rádio: o que faz um
 *                som parecer alto não é o pico, é a média.
 *   SOBE.        Sequência ascendente lê como alarme. Descendente soa como
 *                erro, e alternada vira campainha de loja.
 *
 * @param {number} repeticoes quantas vezes o padrão se repete. Quatro é o
 *                            ajuste que o dono pediu depois de ouvir: dá
 *                            tempo de registrar sem virar sirene.
 */
export function tocarSino(repeticoes = 4) {
  const ctx = pegarContexto();
  if (!ctx) return;

  // Compressor entre as notas e a saída: deixa levantar o volume sem a
  // distorção suja que aparece quando a soma dos osciladores estoura em 1.0.
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 12;
  compressor.ratio.value = 12;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.1;
  compressor.connect(ctx.destination);

  const agora = ctx.currentTime;

  for (let volta = 0; volta < repeticoes; volta += 1) {
    const atraso = volta * 0.58;

    for (const nota of NOTAS) {
      // Duas fontes por nota, desafinadas em 4 Hz: batem entre si e produzem
      // aquela pulsação de alarme, além de somar volume.
      for (const [tipo, desafino] of [['sawtooth', -2], ['square', 2]]) {
        const osc = ctx.createOscillator();
        const ganho = ctx.createGain();

        osc.type = tipo;
        osc.frequency.value = nota.hz + desafino;

        const inicio = agora + atraso + nota.inicio;
        const fim = inicio + nota.duracao;

        // Ataque quase instantâneo (5ms): som que sobe devagar é abafado pelo
        // ruído antes de chegar ao volume que importa.
        ganho.gain.setValueAtTime(0, inicio);
        ganho.gain.linearRampToValueAtTime(0.55, inicio + 0.005);
        ganho.gain.setValueAtTime(0.55, fim - 0.04);
        ganho.gain.exponentialRampToValueAtTime(0.001, fim);

        osc.connect(ganho);
        ganho.connect(compressor);
        osc.start(inicio);
        osc.stop(fim + 0.02);
      }
    }
  }

  // Desconecta o compressor quando o alarme acaba. Sem isso, cada pedido
  // deixaria um nó pendurado no grafo de áudio — num turno inteiro isso vira
  // centenas, e o painel começa a engasgar.
  const duracaoTotal = repeticoes * 0.58 + 0.6;
  setTimeout(() => {
    try {
      compressor.disconnect();
    } catch {
      // Já desconectado. Não há o que fazer nem o que avisar.
    }
  }, duracaoTotal * 1000 + 200);
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
