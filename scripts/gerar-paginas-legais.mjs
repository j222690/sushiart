/**
 * Gera /privacidade e /termos como HTML estático de verdade.
 *
 *   node scripts/gerar-paginas-legais.mjs
 *
 * Por que não deixar como rota React: o app é um SPA, e o HTML entregue tem só
 * `<div id="root"></div>` — o texto só existe depois que o JavaScript roda. O
 * verificador do Google não executa JavaScript, então ele lia uma página vazia
 * e reprovou com "não possui conteúdo suficiente". Robô de busca, prévia de
 * link no WhatsApp e leitor de tela caem no mesmo problema.
 *
 * O conteúdo mora aqui, num lugar só, e o script escreve os dois arquivos em
 * public/. Duas cópias do mesmo texto sempre acabam divergindo.
 */
import { writeFileSync } from 'node:fs';

const ATUALIZADO = '1º de setembro de 2026';
const RESTAURANTE = 'Sushi Art — Empório do Sushi';
const CIDADE = 'Chapecó/SC';
const CONTATO = 'victorcapelina@gmail.com';

const ESTILO = `
  :root {
    --ground: #F6F3EF; --surface: #FFFFFF; --ink: #211D1B; --ink-soft: #6A625B;
    --ink-faint: #9C948B; --accent: #8B2635; --accent-soft: #F5DFE2; --line: #E4DDD3;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--ground); color: var(--ink);
    font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 16px; line-height: 1.65; -webkit-font-smoothing: antialiased;
  }
  header {
    background: var(--surface); border-bottom: 1px solid var(--line);
  }
  .barra { max-width: 780px; margin: 0 auto; padding: 16px 20px; }
  .marca {
    font-family: "Great Vibes", cursive; font-size: 26px; line-height: 1;
    color: var(--accent); margin: 0;
  }
  .sub {
    font-size: 10px; letter-spacing: .2em; text-transform: uppercase;
    color: var(--ink-faint); margin: 2px 0 0;
  }
  main { max-width: 780px; margin: 0 auto; padding: 34px 20px 70px; }
  h1 {
    font-family: "Playfair Display", Georgia, serif; font-weight: 700;
    font-size: clamp(1.7rem, 4.5vw, 2.2rem); line-height: 1.15; margin: 0;
  }
  .data { color: var(--ink-faint); font-size: 13px; margin: 6px 0 0; }
  h2 {
    font-size: 1.05rem; font-weight: 700; margin: 34px 0 8px; color: var(--ink);
  }
  p, li { color: var(--ink-soft); max-width: 62ch; }
  p { margin: 0 0 10px; }
  ul { margin: 0 0 10px; padding-left: 20px; }
  li { margin-bottom: 7px; }
  strong { color: var(--ink); font-weight: 600; }
  a { color: var(--accent); }
  footer {
    max-width: 780px; margin: 0 auto; padding: 22px 20px 60px;
    border-top: 1px solid var(--line); font-size: 13px; color: var(--ink-faint);
  }
  footer a { margin-right: 14px; }
`;

const pagina = (titulo, descricao, corpo) => `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="${descricao}" />
  <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Great+Vibes&family=Playfair+Display:wght@600;700&family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
  <title>${titulo} · ${RESTAURANTE}</title>
  <style>${ESTILO}</style>
</head>
<body>
  <header>
    <div class="barra">
      <p class="marca">Sushi Art</p>
      <p class="sub">Empório do Sushi</p>
    </div>
  </header>

  <main>
    <h1>${titulo}</h1>
    <p class="data">Atualizada em ${ATUALIZADO}</p>
${corpo}
  </main>

  <footer>
    <a href="/">Início</a>
    <a href="/privacidade">Privacidade</a>
    <a href="/termos">Termos de uso</a>
    <p style="margin:10px 0 0">${RESTAURANTE} · ${CIDADE}</p>
  </footer>
</body>
</html>
`;

// ---------------------------------------------------------------- privacidade

const PRIVACIDADE = `
    <h2>Quem somos</h2>
    <p>
      Este aplicativo é do <strong>${RESTAURANTE}</strong>, restaurante em ${CIDADE}.
      Ele existe para você pedir comida direto da casa, sem intermediário.
    </p>

    <h2>Que dados coletamos e por quê</h2>
    <p>Coletamos apenas o necessário para preparar e entregar o seu pedido:</p>
    <ul>
      <li><strong>Nome</strong> — para identificar o pedido na cozinha e no balcão.</li>
      <li><strong>E-mail</strong> — para criar e acessar sua conta, e para recuperar sua senha.</li>
      <li><strong>Telefone</strong> — para o entregador ou o restaurante falarem com você sobre a entrega.</li>
      <li><strong>Endereço de entrega</strong>, incluindo a localização que você marca no mapa — para o entregador chegar até você e para calcular a taxa de entrega do seu bairro.</li>
      <li><strong>Histórico de pedidos</strong> — o que você pediu, quando, quanto pagou e a forma de pagamento escolhida.</li>
      <li><strong>Data de nascimento</strong>, se você quiser informar — usada apenas para felicitação e oferta de aniversário. É opcional.</li>
      <li><strong>Autorização de notificação do navegador</strong>, se você permitir — para avisar quando o pedido for aceito, sair para entrega ou ficar pronto para retirada.</li>
      <li><strong>Seus favoritos e pontos de fidelidade</strong> — para você reencontrar o que gosta e acumular benefícios.</li>
    </ul>
    <p>
      Não pedimos CPF, não guardamos dados de cartão e não rastreamos sua navegação
      fora deste aplicativo.
    </p>

    <h2>Entrar com o Google</h2>
    <p>
      Se você escolher entrar com a sua conta Google, recebemos do Google apenas
      <strong>o seu nome e o seu endereço de e-mail</strong>, e usamos os dois exclusivamente
      para criar e identificar a sua conta neste aplicativo.
    </p>
    <p>
      Não temos acesso à sua senha, aos seus contatos, à sua agenda, aos seus arquivos,
      às suas fotos nem a qualquer outro serviço da sua conta Google. Não publicamos nada
      em seu nome.
    </p>
    <p>
      Você pode revogar esse acesso quando quiser, na página de segurança da sua conta
      Google, em "Conexões com apps e serviços de terceiros".
    </p>

    <h2>Pagamento</h2>
    <p>
      <strong>Não vemos e não guardamos os dados do seu cartão.</strong> No pagamento online,
      os dados vão diretamente para a operadora de pagamento, que é quem processa a cobrança.
      Recebemos de volta apenas a confirmação de aprovação, o valor e os últimos dígitos do
      cartão, para você reconhecer a compra no histórico.
    </p>

    <h2>Com quem compartilhamos</h2>
    <p>Com ninguém para fins de publicidade. Seus dados passam apenas por:</p>
    <ul>
      <li><strong>A operadora de pagamento</strong> que você escolher, para processar a cobrança.</li>
      <li><strong>Nosso provedor de tecnologia</strong>, que hospeda o aplicativo e o banco de dados.</li>
      <li><strong>O entregador</strong>, que recebe seu nome, endereço e telefone para realizar a entrega.</li>
    </ul>
    <p>Não vendemos, alugamos nem cedemos seus dados a terceiros.</p>

    <h2>Cookies e armazenamento no aparelho</h2>
    <p>
      Guardamos no seu navegador apenas o necessário para o aplicativo funcionar: a sua
      sessão de login, os itens do carrinho e a marcação de que você já viu o aviso de
      ofertas do dia. Não usamos cookies de publicidade nem de rastreamento.
    </p>

    <h2>Seus direitos</h2>
    <p>
      Pela Lei Geral de Proteção de Dados (Lei 13.709/2018), você pode a qualquer momento
      <strong>acessar, corrigir, exportar ou apagar</strong> seus dados, além de retirar o
      consentimento para receber mensagens promocionais.
    </p>
    <p>
      Nome, telefone e endereços você mesmo altera no aplicativo, na tela de Perfil.
      Para apagar sua conta por completo, escreva para <strong>${CONTATO}</strong>.
      Apagamos tudo, exceto o registro fiscal dos pedidos já entregues, que a legislação
      nos obriga a manter.
    </p>

    <h2>Por quanto tempo guardamos</h2>
    <p>
      Enquanto a sua conta existir. Os pedidos permanecem pelo prazo exigido pela legislação
      fiscal. Se você apagar a conta, o restante dos dados é excluído junto.
    </p>

    <h2>Menores de idade</h2>
    <p>
      O aplicativo não se destina a menores de 18 anos. Não coletamos intencionalmente
      dados de crianças e adolescentes.
    </p>

    <h2>Alterações nesta política</h2>
    <p>
      Podemos atualizar este texto. A data no topo indica a última alteração, e a versão
      publicada aqui é a que vale.
    </p>

    <h2>Contato</h2>
    <p>
      Dúvidas sobre seus dados, pedidos de exclusão ou qualquer questão de privacidade:
      <strong>${CONTATO}</strong>.
    </p>
`;

// --------------------------------------------------------------------- termos

const TERMOS = `
    <h2>O que é este aplicativo</h2>
    <p>
      Um canal de pedidos do <strong>${RESTAURANTE}</strong>, em ${CIDADE}. Quem prepara,
      entrega e responde pelo pedido é o próprio restaurante — não há intermediário.
    </p>
    <p>Ao criar uma conta ou fazer um pedido, você concorda com estes termos.</p>

    <h2>Sua conta</h2>
    <p>
      Para pedir é preciso ter conta. Informe dados verdadeiros: endereço incorreto ou
      telefone que não atende são a causa mais comum de pedido que não chega.
      Você é responsável por manter sua senha em segurança.
    </p>

    <h2>Pedidos</h2>
    <ul>
      <li>O pedido só é confirmado <strong>depois que a cozinha aceita</strong>. Até lá ele aparece como aguardando.</li>
      <li>O tempo de entrega exibido é uma <strong>estimativa</strong>. Movimento, clima e distância alteram esse prazo.</li>
      <li>Atendemos apenas dentro da <strong>área de entrega</strong> exibida no mapa. A taxa varia conforme o bairro e é mostrada antes da confirmação.</li>
      <li>Fora do horário de funcionamento você pode montar o carrinho, mas o pedido só entra quando o restaurante abrir.</li>
    </ul>

    <h2>Pagamento</h2>
    <p>
      Você pode pagar online ou na entrega. No pagamento online, a cobrança é processada pela
      operadora de pagamento; o restaurante apenas recebe a confirmação.
    </p>
    <p>
      Ao escolher dinheiro, informe se precisa de troco e para qual valor, para que o
      entregador leve o troco combinado.
    </p>

    <h2>Cupons, roleta e fidelidade</h2>
    <ul>
      <li>Cada cupom tem <strong>valor mínimo de pedido</strong>, informado junto ao cupom.</li>
      <li>Cupons têm <strong>prazo de validade</strong> e valem uma vez por cliente.</li>
      <li>A roleta permite <strong>um giro por dia</strong>. O prêmio vira um cupom pessoal com prazo curto.</li>
      <li>Não é possível acumular dois cupons no mesmo pedido.</li>
      <li>Pontos e prêmios não têm valor monetário e não são conversíveis em dinheiro.</li>
    </ul>

    <h2>Cancelamento</h2>
    <p>
      O cancelamento é livre <strong>enquanto a cozinha não tiver iniciado o preparo</strong>.
      Depois disso, depende de contato com o restaurante.
    </p>
    <p>
      Problemas com o pedido — item faltando, trocado ou fora do padrão — devem ser
      comunicados no mesmo dia, para que possamos resolver.
    </p>
    <p>
      Por se tratar de alimento perecível preparado sob encomenda, não se aplica o prazo de
      arrependimento de 7 dias previsto no artigo 49 do Código de Defesa do Consumidor.
    </p>

    <h2>Fotos e cardápio</h2>
    <p>
      As fotos são ilustrativas e a montagem do prato pode variar na aparência. O conteúdo
      descrito — peças, ingredientes e quantidades — corresponde ao que você recebe.
    </p>
    <p>
      Preços e itens podem mudar sem aviso prévio. Vale sempre o que estiver exibido no
      aplicativo no momento do pedido.
    </p>

    <h2>Alergias e restrições alimentares</h2>
    <p>
      Nossos pratos contêm <strong>peixe cru, frutos do mar, leite, ovo, glúten e gergelim</strong>,
      e são preparados na mesma cozinha e nas mesmas superfícies. Não é possível garantir
      ausência de traços.
    </p>
    <p>
      Se você tem alergia alimentar, registre no campo de observação do pedido
      <strong>e</strong> entre em contato com o restaurante antes de confirmar.
    </p>

    <h2>Uso adequado</h2>
    <p>
      É proibido usar o aplicativo para fraude, pedidos falsos, tentativa de burlar cupons
      ou qualquer atividade ilícita. Contas nessas condições podem ser suspensas.
    </p>

    <h2>Alterações nestes termos</h2>
    <p>
      Podemos atualizar este texto. A data no topo indica a última alteração, e vale a versão
      publicada no momento do seu pedido.
    </p>

    <h2>Contato</h2>
    <p>${RESTAURANTE} · ${CIDADE} · <strong>${CONTATO}</strong></p>
`;

writeFileSync(
  'public/privacidade.html',
  pagina(
    'Política de Privacidade',
    `Como o ${RESTAURANTE} coleta, usa e protege os dados de quem pede pelo aplicativo.`,
    PRIVACIDADE
  )
);

writeFileSync(
  'public/termos.html',
  pagina(
    'Termos de Uso',
    `Regras de uso do aplicativo de pedidos do ${RESTAURANTE}.`,
    TERMOS
  )
);

console.log('public/privacidade.html e public/termos.html gerados.');
