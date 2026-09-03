# Analytics e rastreamento de campanha

Como o Sushi Art mede o caminho do anúncio até a venda paga.

```
Meta Ads → entra no app → vê produto → põe no carrinho
         → começa o checkout → cria o pedido → PAGA → Purchase
```

---

## A regra que governa tudo

**Analytics nunca derruba o app.** Todo disparo é embrulhado em `try/catch`.
Bloqueador de anúncio, rede caída ou provedor fora do ar não impedem ninguém de
fechar um pedido. Medir a venda vale menos que fazer a venda.

**Valor sempre em reais.** O banco guarda centavos. A conversão acontece num
lugar só, na saída — mandar `8499` onde se esperava `84,99` multiplica o
faturamento do relatório por cem, e o erro só aparece quando alguém estranha o
número.

---

## Variáveis de ambiente

| Variável | Onde | Para quê |
| --- | --- | --- |
| `VITE_META_PIXEL_ID` | `.env` do app | Meta Pixel. **Vazia = o app não baixa o script.** |
| `VITE_GA_MEASUREMENT_ID` | `.env` do app | GA4, formato `G-XXXXXXXXXX`. Vazia = não carrega. |
| `VITE_ANALYTICS_DEBUG` | `.env` do app | `true` liga os logs fora de desenvolvimento. |
| `META_CAPI_TOKEN` | **Segredo da Edge Function** | Conversions API. **Nunca no app.** |
| `META_PIXEL_ID` | **Segredo da Edge Function** | O mesmo id, do lado do servidor. |

> O token da Conversions API fica só nos segredos do Supabase. Com ele em mãos,
> qualquer um manda eventos falsos para a conta de anúncios e estraga a
> otimização — que é como o dinheiro do restaurante é distribuído.

Gravar um segredo de função:

```bash
npx supabase secrets set META_CAPI_TOKEN=xxx --project-ref uycxvoinkakmdnqakhhe
```

---

## Onde cada evento dispara

| Evento Meta | Evento GA4 | Arquivo | Momento |
| --- | --- | --- | --- |
| `PageView` | `page_view` | `hooks/useRastreioDeRota.js` | Toda troca de rota |
| `ViewContent` | `view_item` | `components/ProductSheet.jsx` | Ficha do produto abre |
| `AddToCart` | `add_to_cart` | `components/ProductSheet.jsx` | Botão "Adicionar" |
| `InitiateCheckout` | `begin_checkout` | `pages/client/Checkout.jsx` | Tela de fechamento com carrinho |
| `Purchase` | `purchase` | `pages/client/OrderDetail.jsx` | **Pagamento confirmado** |

As telas chamam só a camada neutra (`lib/analytics`). Nenhum componente sabe que
existe Meta ou GA4 — é isso que permite trocar de provedor mexendo num arquivo.

### PageView num app de página única

Os dois provedores entram com o PageView automático **desligado**. Num SPA não
há recarga, então o automático dispararia uma vez só, na abertura, e toda a
navegação seguinte ficaria invisível. Quem conta é `useRastreioDeRota`, que
compara só o `pathname` — `/cardapio?produto=X` e `/cardapio` são a mesma tela
para efeito de audiência.

---

## Purchase: a regra mais importante

**Não dispara no clique de "finalizar". Não dispara na criação do pedido.**

Dispara quando o pedido entra num destes status:

```
pago · confirmado_entrega · em_preparo
saiu_para_entrega · pronto_para_retirada · entregue
```

`pago` vem do webhook do gateway, depois de o Mercado Pago confirmar na fonte.
`confirmado_entrega` é o pagamento na entrega, que o restaurante aceitou. Os
seguintes contam porque um pedido só chega neles depois de passar por um dos
dois — e a pessoa pode abrir a tela pela primeira vez já com o pedido a caminho.

Fica de fora `aguardando_pagamento`, que é exatamente o pedido criado e não
pago. Contar ali encheria o relatório de vendas que nunca aconteceram, e a Meta
otimizaria a verba para trazer gente que abandona o carrinho.

### Como não contar duas vezes

A tela do pedido atualiza em tempo real, e a pessoa recarrega, volta, abre em
outra aba. Sem trava, um pedido de R$ 90 viraria três conversões de R$ 90 — e o
relatório passaria a mentir **para mais**, que é o pior jeito de mentir: ninguém
desconfia de resultado bom.

`trackPurchase` guarda os pedidos já contados em
`localStorage['sushiart.analytics.compras']` (últimos 50) e devolve `false` no
segundo disparo.

---

## UTM e atribuição

Ao entrar por uma URL com campanha:

```
https://www.sushiarts.online/?utm_source=meta&utm_medium=paid
  &utm_campaign=quarta_hot&utm_content=hot_video_01&fbclid=ABC123
```

são capturados `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`,
`utm_term`, `fbclid` e `gclid`.

**Duas memórias, de propósito:**

| | O que guarda | Quando muda |
| --- | --- | --- |
| **Primeiro toque** | Quem apresentou o restaurante | **Nunca é sobrescrito** |
| **Último toque** | O que trouxe esta compra | A cada nova campanha |

Quem descobre a casa por um vídeo e compra semanas depois vindo de um
remarketing gera uma venda que os dois ajudaram a fazer. Guardar só o último
apaga o vídeo do mapa e leva o restaurante a cortar justamente o que traz gente
nova.

**Onde mora:** `localStorage`, não `sessionStorage`. A jornada de um delivery
atravessa dias — a pessoa vê o anúncio na segunda e pede na sexta. Em
`sessionStorage` essa ligação morreria ao fechar a aba.

**Chaves:** `sushiart.atribuicao.primeiro` e `sushiart.atribuicao.ultimo`.

### No banco

A tabela `order_attribution` liga o pedido à campanha. É uma tabela à parte, e
não colunas em `orders`, porque `orders` é lida no meio do serviço — engordar
cada linha com dez campos de marketing custa em toda consulta do dia a dia.

Relatório pronto:

```sql
select * from report_por_campanha('2026-09-01', '2026-09-30');
```

Conta **só pedido pago**. Somar pedido pendente daria à campanha crédito por
venda que não aconteceu.

---

## Conversions API (Purchase pelo servidor)

O Pixel do navegador some com frequência: bloqueador, aba fechada antes de
carregar, iPhone com rastreamento limitado. A venda acontece e a Meta não fica
sabendo — e campanha otimiza pelo que enxerga.

O caminho do servidor não depende de navegador nenhum:

```
pagamento confirmado → gatilho no banco (pg_net)
                     → Edge Function meta-capi
                     → Meta Conversions API
```

### Deduplicação

Os dois lados mandam o **mesmo** `event_id`:

```
purchase_<order_id>
```

É assim que a Meta reconhece que navegador e servidor falam do mesmo
acontecimento e conta **uma** venda. Sem isso, cada compra viraria duas e o
custo por conversão apareceria pela metade — número bom, decisão ruim.

### Dados pessoais

Só e-mail e telefone, sempre em SHA-256, minúsculo e sem formatação, como a Meta
exige. Sem normalizar, o mesmo cliente vira pessoas diferentes (`A@x.com` e
`a@x.com` dão hashes distintos) e o casamento não acontece — o dado vai e não
serve para nada.

Nome, endereço e o resto do cadastro ficam de fora: não melhoram o casamento e
aumentam a exposição sem motivo.

---

## Como testar

No navegador, com o app aberto:

```js
debugAnalytics()
```

Mostra se cada provedor está configurado e carregado, a origem gravada, e quais
compras já foram contadas.

Com `VITE_ANALYTICS_DEBUG=true` ou em desenvolvimento, cada evento aparece no
console:

```
[analytics] iniciado {meta: true, ga4: true, origem: {…}}
[analytics] page_view /cardapio
[analytics] view_item Especial 42 Peças
[analytics] add_to_cart 1x Especial 42 Peças
[analytics] begin_checkout 1 itens · 84.99
[analytics] purchase 9b230e89-… · R$ 84.99
[analytics] purchase ignorado (já contado) 9b230e89-…
```

### O que foi verificado

| Teste | Resultado |
| --- | --- |
| Entrar com UTM | capturada |
| Navegar entre páginas | UTM persiste |
| Segunda campanha | primeiro toque **preservado** |
| Abrir produto | `view_item` |
| Adicionar | `add_to_cart` |
| **Pedido criado sem pagar** | **nenhuma conversão** |
| **Pagamento aprovado** | `purchase · R$ 84.99` |
| **Recarregar 2×** | `purchase ignorado (já contado)` |

---

## Arquivos

**Criados**

```
src/lib/analytics/index.js        camada neutra
src/lib/analytics/meta.js         Meta Pixel
src/lib/analytics/ga4.js          GA4
src/lib/analytics/atribuicao.js   UTM, primeiro e último toque
src/hooks/useRastreioDeRota.js    PageView por rota
supabase/functions/meta-capi/     Purchase pelo servidor
docs/ANALYTICS.md                 este arquivo
```

**Alterados**

```
src/App.jsx                       inicia e conta navegação
src/components/ProductSheet.jsx   ViewContent e AddToCart
src/pages/client/Checkout.jsx     InitiateCheckout
src/pages/client/OrderDetail.jsx  Purchase
src/lib/api.js                    grava a atribuição do pedido
```

**Migrações**

```
0016_atribuicao.sql    tabela order_attribution + report_por_campanha
0017_capi_trigger.sql  dispara o Purchase do servidor
```

---

## Consentimento

O projeto não tinha (nem tem) banner de cookies. As páginas de privacidade e
termos já existem em `/privacidade` e `/termos`.

A estrutura para respeitar consentimento está pronta: **nenhum script de
terceiro carrega sem a variável de ambiente**, e todo disparo passa por
`lib/analytics`. Ligar um controle de consentimento é acrescentar uma
verificação nesse arquivo, num lugar só — não em dez telas.
