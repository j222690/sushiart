# Sushi Art — Empório do Sushi · App de delivery

App de pedidos com marca própria para o Sushi Art (Chapecó/SC), sem depender de
marketplace. Um projeto, dois apps:

- **App do cliente** — `/` · cardápio, carrinho, checkout, roleta, fidelidade
- **Painel do restaurante** — `/admin` · pedidos em tempo real, cardápio, promoções, relatórios

Stack: React + Vite + Tailwind · Supabase (Postgres, Auth, Storage, Realtime, Edge Functions).

---

## 1. Subir o projeto

```bash
npm install
cp .env.example .env      # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev
```

### Banco de dados

> ✅ **Já provisionado.** As migrations foram aplicadas no projeto `Sushi art`
> (`uycxvoinkakmdnqakhhe`, região São Paulo) em 20/08/2026, e o `.env` já está
> preenchido. O que está abaixo serve para recriar o ambiente do zero.

No SQL Editor do Supabase, rode os arquivos **na ordem**:

| Arquivo | O que faz |
|---|---|
| `supabase/migrations/0001_schema.sql` | Tabelas, enums, índices, triggers |
| `supabase/migrations/0002_rls.sql` | Row Level Security de tudo |
| `supabase/migrations/0003_functions.sql` | Regras de negócio (pedido, cupom, roleta, fidelidade) |
| `supabase/migrations/0004_reports.sql` | Relatórios do painel |
| `supabase/migrations/0005_seed.sql` | Dados de demonstração — **veja o aviso abaixo** |
| `supabase/migrations/0006_storage.sql` | Bucket `menu` + policies das fotos |
| `supabase/migrations/0007_push.sql` | Notificações push: público, tokens da equipe, gatilhos |

> ⚠️ **O cardápio do `0005_seed.sql` é fictício.** Nomes, descrições e preços são
> exemplos para o app subir funcionando — não são o cardápio real do Sushi Art.
> As categorias (Combos, Pokes, Alacarte) seguem as do Instagram. Substitua tudo
> pelo cardápio verdadeiro no painel antes de colocar no ar. Os bairros e taxas
> de entrega de Chapecó também são valores de exemplo.

### Storage

O bucket `menu` é criado pela migration `0006_storage.sql`: público para leitura
(a foto do prato abre sem login) e gravável só por quem está na tabela `staff`.
Limite de 5 MB por arquivo, apenas JPG/PNG/WEBP/AVIF.

### Trazer as fotos do Anota AI

Para não subir 66 fotos na mão, `scripts/` importa as que já estão na loja do
Anota AI. São dois passos porque a página fica atrás de Cloudflare, que bloqueia
navegador automatizado (testado: 403, e o Playwright leva tela de bloqueio). O
seu navegador passa porque é uma pessoa acessando — então a coleta fica com você
e o resto é automático.

```bash
# 1. Abra a loja no navegador, F12 → Console, cole scripts/coletar-fotos.js.
#    Ele rola a página, mostra o que achou e baixa fotos-anota.json.

# 2. Confira o casamento sem tocar em nada:
$env:SUPABASE_SERVICE_ROLE_KEY = "..."     # Supabase → Settings → API
node scripts/importar-fotos.mjs fotos-anota.json

# 3. Se a lista estiver certa, aplique:
node scripts/importar-fotos.mjs fotos-anota.json --aplicar
```

O passo 2 é obrigatório de propósito: sem `--aplicar` o script só imprime o que
casou, o que ficou sem foto e quais fotos sobraram. Produto que já tem
`image_url` é pulado, a não ser com `--sobrescrever`.

O casamento de nomes vive em `scripts/casar-nomes.mjs`, separado porque é a
parte que pode estragar dado — ele decide em qual produto cada foto vai parar.
Tem teste: `npm run test:fotos`.

O detalhe que o teste pegou: **número é sinal forte, não mais uma palavra.** O
cardápio tem `Especial 40 Peças`, `Especial 42 Peças` e
`Enamorado 45 Peças + 1 Ceviche + 1 Sunomono` ao lado do de 60 — nomes que
compartilham quase todos os tokens e diferem só na contagem. Por similaridade
pura eles casavam entre si a 75% e trocavam de foto. Agora, se os dois lados
têm número e os números diferem, o par é descartado direto.

### Liberar acesso ao painel

O `/admin` só abre para quem está na tabela `staff`. Crie a conta normalmente
pelo app do cliente e depois rode:

```sql
insert into staff (user_id, name, role)
select id, 'Seu nome', 'admin'
from auth.users where email = 'voce@exemplo.com';
```

`admin` = acesso total · `operador` = operação do dia a dia.

---

## 2. Pagamentos

O app conhece quatro formas de pagamento. Qual gateway atende cada uma fica em
`payment_config`, editável em **Painel → Pagamentos**:

```
Pix               → InfinitePay     ● Adapter pronto — falta o handle
Cartão de crédito → Mercado Pago    ● Adapter pronto — falta o access token
Cartão de débito  → PagBank         ● Adapter pronto — falta o token
Pagar na entrega  → Sem gateway     ● Ativo (registro manual)
```

> ⚠️ **Os quatro adapters estão escritos, mas nenhuma credencial foi cadastrada.**
> Enquanto as secrets do gateway não entrarem, ativar o método no painel faz o
> checkout falhar com "Variável de ambiente ausente". Cadastre as secrets do
> gateway **antes** de ativar a forma de pagamento — a ordem importa.
>
> O que cada um precisa está em `.env.example`. Resumo:
>
> | Gateway | Secret | Onde pegar |
> |---|---|---|
> | InfinitePay | `INFINITEPAY_HANDLE` | Seu handle da InfinitePay (o do link de pagamento) |
> | Mercado Pago | `MERCADOPAGO_ACCESS_TOKEN` + `MERCADOPAGO_WEBHOOK_SECRET` | Suas integrações → Credenciais / Webhooks |
> | PagBank | `PAGBANK_TOKEN` + `PAGBANK_ENV` | Venda online → Integrações → Token |
>
> Para adicionar um gateway novo no futuro: escreva o adapter em
> `supabase/functions/create-payment/index.ts`, crie o webhook, e acerte
> `implemented` em `src/lib/constants.js`. O mecanismo de `PENDING_PROVIDERS`
> continua lá para segurar o método no painel enquanto o adapter não existe.

### Como cada cartão é cobrado

Nenhum dos dois pede número de cartão dentro do nosso app — em ambos o cliente
digita na página do gateway e volta. Isso é escolha de arquitetura, não acaso:
dado de cartão que não passa pelo nosso servidor não vira escopo de PCI nosso, e
o 3DS fica por conta de quem já sabe fazer.

- **Crédito → Mercado Pago (Checkout Pro)**: cria uma *preference* e manda o
  cliente para o `init_point`. O parcelamento é escolhido lá, então o número
  real de parcelas só é gravado quando o webhook confirma.
- **Débito → PagBank (Checkout hospedado)**: cria um *checkout* e manda o
  cliente para o link `rel: PAY`. Débito online exige 3DS, e a tela do PagBank
  já faz a autenticação com o banco emissor.

Trocar de provedor é mudar o `provider` nessa tela. O app do cliente não muda —
ele nunca soube qual gateway estava por trás.

### Pagar na entrega

Não é só dinheiro. `payment_method = 'na_entrega'` guarda também
`on_delivery_kind`: **dinheiro**, **crédito**, **débito** ou **pix**. Isso importa
em dois lugares:

- **Comanda e kanban** destacam quando o entregador precisa levar a maquininha
  (badge laranja + `** LEVAR MAQUININHA **` na impressão).
- **Conferência de caixa** conta só dinheiro vivo. Venda na maquininha cai na
  conta do gateway, não na mão do entregador — somar as duas daria um caixa que
  nunca fecha.

Quais formas aparecem para o cliente é configurável em Painel → Pagamentos.

### Fluxo de status

```
Pedido criado
  ├─ Pix / Cartão online → aguardando_pagamento → [webhook] → pago → cozinha
  └─ Pagar na entrega    → confirmado_entrega   → cozinha (direto)
```

### Deploy das Edge Functions

```bash
supabase functions deploy create-payment
supabase functions deploy webhook-infinitepay  --no-verify-jwt
supabase functions deploy webhook-asaas        --no-verify-jwt
supabase functions deploy webhook-mercadopago  --no-verify-jwt
supabase functions deploy webhook-pagbank      --no-verify-jwt

supabase secrets set APP_ORIGIN=https://seu-dominio.com.br

# Pix
supabase secrets set INFINITEPAY_HANDLE=seu_handle

# Crédito
supabase secrets set MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
supabase secrets set MERCADOPAGO_WEBHOOK_SECRET=...

# Débito
supabase secrets set PAGBANK_TOKEN=...
supabase secrets set PAGBANK_ENV=sandbox        # production no go-live

# Asaas (opcional — alternativa para Pix ou crédito)
supabase secrets set ASAAS_API_KEY=$aact_...
supabase secrets set ASAAS_WEBHOOK_TOKEN=um-token-longo-e-aleatorio
supabase secrets set ASAAS_ENV=sandbox
```

### Webhooks

| Gateway | URL | Como cadastrar |
|---|---|---|
| InfinitePay | `.../functions/v1/webhook-infinitepay` | Automático — a URL vai em cada cobrança |
| Asaas | `.../functions/v1/webhook-asaas` | Painel do Asaas → Integrações → Webhooks, com o token de autenticação |
| Mercado Pago | `.../functions/v1/webhook-mercadopago` | Automático (`notification_url` por cobrança). Cadastre também em Suas integrações → Webhooks para pegar o segredo da assinatura |
| PagBank | `.../functions/v1/webhook-pagbank` | Automático — vai em `notification_urls` de cada pedido |

**Como cada webhook é autenticado** — e a regra vale para os quatro:
**o aviso recebido nunca é o que libera o pedido.** Em todos, a função volta a
perguntar ao gateway se aquilo foi mesmo pago, e confere o valor contra o total
gravado no nosso banco antes de mover qualquer status.

- **InfinitePay** não assina o POST e usa webhook dinâmico. A função chama
  `payment_check` na própria InfinitePay e só aceita se ela confirmar.
- **Asaas** envia o header `asaas-access-token`. A função compara com
  `ASAAS_WEBHOOK_TOKEN` em tempo constante antes de olhar o corpo.
- **Mercado Pago** assina com HMAC-SHA256 no header `x-signature`, sobre o
  manifesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`. Depois de validar,
  a função busca `GET /v1/payments/{id}` e exige `status: approved`.
- **PagBank** manda `x-authenticity-token` (SHA-256 de `{token}-{corpo}`). A
  função confere e registra divergência, mas quem autoriza é a consulta
  `GET /orders/{id}`, que precisa devolver uma cobrança `PAID`.

  > Por que não recusar direto quando o hash não bate: o formato do hash do
  > PagBank varia entre produtos e a consulta na API já é suficiente — um POST
  > forjado só consegue nos fazer reconsultar um pedido que existe. A divergência
  > fica logada para você ver no `supabase functions logs webhook-pagbank`.

> Antes do go-live com dinheiro real: faça um pedido de teste ponta a ponta em
> cada método e confirme que o pedido sai de `aguardando_pagamento` sozinho.
> Os contratos de API foram conferidos na documentação pública, mas API de
> gateway muda — valide no sandbox antes de confiar.

---

## 3. Notificações push

Os dois lados são avisados, e por caminhos diferentes:

| Quem | Recebe quando | Vai para |
|---|---|---|
| **Cliente** | pedido confirmado, pagamento aprovado, entrou na cozinha, saiu para entrega, pronto para retirada, entregue, cancelado | a tela do próprio pedido |
| **Equipe** | pedido novo entrou, cliente cancelou | o kanban `/admin/pedidos` |

### Quem dispara é o banco, não o app

Toda mudança que interessa a alguém já gravava uma linha em `notifications`.
A migration `0007_push.sql` transforma essa tabela no único gatilho: entrou
linha → um trigger com `pg_net` chama a Edge Function `send-push`.

Isso resolve dois problemas de uma vez. O aviso sai **com o app fechado**, sem
depender de aba aberta em lugar nenhum. E não existe caminho que mude o pedido e
"esqueça" de notificar — gravar a mudança e gravar a notificação são a mesma
transação.

### Ativar

```bash
npx web-push generate-vapid-keys
```

A chave **pública** vai no `.env` (`VITE_VAPID_PUBLIC_KEY`) e também nos secrets;
a **privada**, só nos secrets:

```bash
supabase functions deploy send-push --no-verify-jwt

supabase secrets set VAPID_PUBLIC_KEY=<a mesma do .env>
supabase secrets set VAPID_PRIVATE_KEY=<a privada>
supabase secrets set VAPID_SUBJECT=mailto:contato@sushiart.com.br
supabase secrets set PUSH_HOOK_SECRET=um-token-longo-e-aleatorio
```

E o par que o banco usa para chamar a função (SQL Editor):

```sql
insert into private.app_config (key, value) values
  ('push_function_url', 'https://SEU-PROJETO.supabase.co/functions/v1/send-push'),
  ('push_hook_secret',  'o-mesmo-valor-de-PUSH_HOOK_SECRET')
on conflict (key) do update set value = excluded.value, updated_at = now();
```

> Sem esse par o trigger simplesmente não dispara — o app inteiro continua
> funcionando, só sem push. É de propósito: instalação nova não pode quebrar ao
> criar o primeiro pedido.

### Ligar num aparelho

- **Cliente**: tela de Notificações → "Ativar".
- **Equipe**: painel → barra lateral (ou menu, no celular) → **Avisar pedido
  novo**. Tem um "Enviar teste" ao lado para conferir na hora.

É por **aparelho**, não por conta: o tablet da cozinha toca, o notebook do
escritório não precisa. A mesma conta pode estar ligada num e desligada no
outro.

> ⚠️ Um cliente comum **não consegue** se registrar como equipe. A policy de
> `push_tokens` exige `is_staff()` para gravar `audience = 'equipe'` — sem isso,
> qualquer pessoa logada passaria a receber nome, endereço e valor de todo
> pedido que entrasse na loja.

### iPhone

No iOS o push web só funciona com o app **adicionado à tela de início**
(Compartilhar → Adicionar à Tela de Início). No Safari em aba comum, o navegador
não entrega nada — é limitação da Apple, não do app. Vale avisar a equipe que
usa iPhone.

### Conferir a criptografia

```bash
npm run test:push
```

O Web Push é criptografado à mão em `supabase/functions/_shared/webpush.ts`
(WebCrypto puro — a lib do npm depende do `node:crypto`, e o que roda lá é Deno).
O teste compara a saída com o **vetor oficial do RFC 8291 §5**, byte a byte, e
verifica o JWT VAPID com a chave pública. Round-trip não serviria: se o RFC
tivesse sido lido errado, os dois lados errariam igual e o teste passaria.

---

## 4. Como o dinheiro é protegido

Um princípio percorre o projeto inteiro: **o navegador nunca decide preço**.

- Todo valor é `integer` em **centavos** (nada de float com dinheiro).
- O carrinho envia só `product_id`, `quantity` e `addon_ids`. O
  `create_order()` no Postgres relê preço, oferta vigente, adicionais, taxa do
  bairro e cupom **do banco**. Adulterar o payload no DevTools não muda um centavo.
- Cupom, giro de roleta e pontos são validados no servidor. O sorteio da roleta
  acontece em `spin_roulette()` — o front só recebe qual gomo destacar.
- RLS em todas as tabelas: o cliente lê apenas os próprios pedidos, endereços,
  cupons e pontos. Escrita em pedido passa obrigatoriamente pelas funções.
- Os relatórios checam `is_staff()` — um cliente logado que chame a RPC direto
  recebe erro de permissão, não o faturamento.
- Nenhuma chave de gateway no front nem no banco: só nos secrets das Edge Functions.
- Links salvos no admin (banner, Instagram) só são abertos se começarem com
  `http(s)://` — um `javascript:` gravado no painel não executa no cliente.

---

## 5. Identidade visual

Tema **claro**, no formato dos apps de delivery: fundo bege quente, cards
brancos, e o vinho da marca reservado para o que é clicável.

| Token | Valor | Uso |
|---|---|---|
| `ink` | `#F6F3EF` (fundo) → `#FFFFFF` (cards) | Superfícies |
| `cream` | `#211D1B` / `#6A625B` / `#9C948B` | Texto principal, secundário, terciário |
| `vinho` | `#8B2635` / `#7A2020` | Botões, badges, nav ativa, roleta |
| `ember` | `#B06A2C` | Pontos de fidelidade, realce quente |

> ⚠️ **Os nomes mentem, e é de propósito.** O projeto nasceu escuro: `ink` era
> preto e `cream` era o off-white do texto. Ao inverter, os valores mudaram mas
> os nomes ficaram — `ink` continua significando "superfície" e `cream`
> continua significando "texto", só que agora ink é claro e cream é escuro.
> Renomear os dois custaria centenas de linhas alteradas em toda a interface
> sem mudar um pixel do resultado.
>
> Consequência prática: **texto sobre fundo vinho usa `text-white`, nunca
> `text-cream`** — cream é escuro agora, e sobre o vinho ficaria ilegível.
> Mesma regra para `bg-vinho-800/900`, que viraram rosas claros e pedem texto
> escuro.

Fontes: **Great Vibes** (assinatura da marca), **Playfair Display** (títulos),
**Inter** (interface, preços e botões).

Quase tudo vive em `tailwind.config.js`. As exceções são SVGs, onde classes do
Tailwind não alcançam: `Logo.jsx`, `Roulette.jsx`, `MapPicker.jsx` e os eixos
do gráfico em `Dashboard.jsx` têm hex direto. Ao mexer na paleta, confira esses
quatro.

O logo em `public/logo-sushiart.jpg` é o oficial do restaurante, e é a fonte de
todos os ícones. Dele saem três PNGs, gerados por reamostragem bicúbica sobre o
vermelho `#912825` do próprio logo (fundo chapado, então a emenda não aparece):

| Arquivo | Uso | Escala |
| --- | --- | --- |
| `icon-192.png` | favicon, apple-touch-icon, emblema do cabeçalho | 1,28× |
| `icon-512.png` | ícone grande do PWA | 3,41× |
| `icon-maskable-512.png` | ícone `maskable` do Android | 2,27× |

> **O original é pequeno.** 150×150 num JPEG de 2,7 kB — provável foto de perfil
> de rede social. O de 192 fica limpo, mas o de 512 é uma ampliação de 3,41× e
> mostra isso: contorno mole nas letras e no traço fino do peixe. Se aparecer o
> arquivo original do designer (PNG, PDF, AI ou SVG), é só regerar os três a
> partir dele — nenhum código muda.

O `maskable` desenha a arte a 340 px dentro dos 512 porque o Android recorta o
ícone em círculo. Em tamanho cheio o arco do "SUSHI ART" ficaria cortado nas
pontas; a sobra de vermelho ao redor resolve, e como o fundo é o mesmo, ela lê
como margem, não como moldura.

O `logo.svg` continua no repositório, mas fora do HTML e do manifest: era outro
desenho (disco vinho, assinatura em cursiva), e o texto dele depende de webfont
— que não carrega em contexto de favicon, onde ele cairia numa fonte qualquer.

### Telas

O app do cliente responde de celular a monitor:

- **até `lg`** — coluna única, navegação na barra inferior (idioma de celular)
- **`md`** — listas de produto viram duas colunas
- **`lg` em diante** — a barra inferior some, a navegação sobe para o cabeçalho
  e o container abre até `max-w-6xl`; listas em três colunas no `xl`

## 6. Mapa do código

```
src/
├─ lib/           supabase.js · api.js (cliente) · adminApi.js · format.js · constants.js · push.js
├─ store/cart.js  carrinho (zustand + localStorage)
├─ context/       AuthContext · StoreContext (aberto/fechado, taxas) · ToastContext
├─ hooks/         useMenu · useFavorites · useRealtimeOrders
├─ components/    ui/ (Button, Sheet, Switch…) · ProductCard · ProductSheet · Roulette · …
│                 admin/ImageUpload · admin/PushToggle
├─ layouts/       ClientLayout · AdminLayout
└─ pages/
   ├─ client/     Home · Menu · Search · Offers · Cart · Checkout · Payment · Orders · …
   └─ admin/      Dashboard · Orders (kanban) · MenuAdmin · Promotions · RouletteAdmin ·
                  Payments · Reports · Settings

supabase/functions/
├─ _shared/           utils.ts (clientes, CORS) · webpush.ts (RFC 8291/8292) + teste
├─ create-payment/    roteador: InfinitePay · Asaas · Mercado Pago · PagBank
├─ send-push/         entrega das notificações (chamada pelo banco)
└─ webhook-*/         infinitepay · asaas · mercadopago · pagbank
```

### Detalhes que valem saber

- **Pedidos em tempo real**: o kanban do admin e o acompanhamento do cliente usam
  Supabase Realtime. Pedido novo toca um bipe (Web Audio, sem arquivo externo).
- **Comanda**: o botão "Imprimir comanda" abre uma janela já formatada para
  impressora térmica, com as observações em destaque.
- **Roleta**: os pesos dos prêmios são probabilidade relativa — a tela do admin
  mostra a chance real de cada um em % conforme você mexe.
- **Conferência de caixa**: relatório do total em dinheiro por período, com o
  troco previsto, para bater com o entregador.
- **Push**: quem dispara é o banco, por trigger em `notifications` — veja a
  seção 3. O bipe do Realtime só toca com o painel aberto; o push é o que
  alcança a equipe com o celular no bolso.

---

## 7. Deploy

`npm run build` gera `dist/`. Publique em Vercel, Netlify ou Cloudflare Pages —
o *rewrite* de SPA já vem configurado para as três, então não há passo manual:

| Arquivo | Quem lê |
| --- | --- |
| `vercel.json` | Vercel |
| `public/_redirects` | Netlify e Cloudflare Pages |
| `public/_headers` | Netlify e Cloudflare Pages |

Sem esse rewrite, `/admin` e `/pedidos/:id` dão 404 no refresh: o servidor
procura um arquivo naquele caminho, que só existe dentro do React Router.

Os headers cacheiam `/assets/*` para sempre (o nome tem hash, então mudança de
conteúdo muda o nome) e proíbem cache em `sw.js`. Service worker cacheado é
armadilha conhecida de PWA: o navegador continua servindo o worker velho e a
atualização nunca chega no aparelho de quem já instalou.

Depois do deploy, em Supabase → Authentication → URL Configuration, aponte o
**Site URL** para o domínio final (é o que faz o link de recuperação de senha
funcionar).
