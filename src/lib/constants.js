/**
 * Vocabulário compartilhado entre app do cliente e admin.
 * As chaves espelham os enums do Postgres (0001_schema.sql) — se mudar lá,
 * mude aqui.
 */

export const ORDER_STATUS = {
  aguardando_pagamento: {
    label: 'Aguardando pagamento',
    short: 'Pagamento',
    customerLabel: 'Aguardando seu pagamento',
    tone: 'warning',
    icon: 'clock',
  },
  confirmado_entrega: {
    label: 'Confirmado (paga na entrega)',
    short: 'Novo',
    customerLabel: 'Pedido confirmado',
    tone: 'cash',
    icon: 'banknote',
  },
  pago: {
    label: 'Pago',
    short: 'Novo',
    customerLabel: 'Pagamento confirmado',
    tone: 'success',
    icon: 'check',
  },
  em_preparo: {
    label: 'Em preparo',
    short: 'Cozinha',
    customerLabel: 'Preparando seu pedido',
    tone: 'info',
    icon: 'chef',
  },
  saiu_para_entrega: {
    label: 'Saiu para entrega',
    short: 'A caminho',
    customerLabel: 'Saiu para entrega',
    tone: 'info',
    icon: 'bike',
  },
  pronto_para_retirada: {
    label: 'Pronto para retirada',
    short: 'Retirada',
    customerLabel: 'Pronto para retirar',
    tone: 'info',
    icon: 'bag',
  },
  entregue: {
    label: 'Entregue',
    short: 'Entregue',
    customerLabel: 'Entregue',
    tone: 'success',
    icon: 'check',
  },
  cancelado: {
    label: 'Cancelado',
    short: 'Cancelado',
    customerLabel: 'Pedido cancelado',
    tone: 'danger',
    icon: 'x',
  },
};

/** Colunas do kanban da cozinha, na ordem em que o pedido anda. */
export const KANBAN_COLUMNS = [
  { key: 'novos', title: 'Novos', statuses: ['pago', 'confirmado_entrega'] },
  { key: 'preparo', title: 'Em preparo', statuses: ['em_preparo'] },
  { key: 'saida', title: 'Saiu / Pronto', statuses: ['saiu_para_entrega', 'pronto_para_retirada'] },
  { key: 'entregues', title: 'Concluídos', statuses: ['entregue'] },
];

/** Próximo passo natural de cada status, para o botão de 1 clique no admin. */
export const NEXT_STATUS = {
  pago: 'em_preparo',
  confirmado_entrega: 'em_preparo',
  em_preparo: null, // depende de entrega x retirada — resolvido em nextStatusFor()
  saiu_para_entrega: 'entregue',
  pronto_para_retirada: 'entregue',
};

export function nextStatusFor(order) {
  if (order.status === 'em_preparo') {
    return order.fulfillment === 'retirada' ? 'pronto_para_retirada' : 'saiu_para_entrega';
  }
  return NEXT_STATUS[order.status] ?? null;
}

/** Status que ainda estão "vivos" na operação (aparecem no painel da cozinha). */
export const ACTIVE_STATUSES = [
  'aguardando_pagamento',
  'pago',
  'confirmado_entrega',
  'em_preparo',
  'saiu_para_entrega',
  'pronto_para_retirada',
];

/** Linha do tempo mostrada ao cliente no acompanhamento do pedido. */
export function timelineFor(order) {
  const onDelivery = order.payment_method === 'na_entrega';
  const paid = onDelivery ? 'confirmado_entrega' : 'pago';
  const handover = order.fulfillment === 'retirada' ? 'pronto_para_retirada' : 'saiu_para_entrega';

  const steps = [paid, 'em_preparo', handover, 'entregue'];
  if (!onDelivery) steps.unshift('aguardando_pagamento');
  return steps;
}

export const PAYMENT_METHODS = {
  pix: { label: 'Pix', icon: 'qr', online: true },
  cartao_credito: { label: 'Cartão de crédito', icon: 'card', online: true },
  cartao_debito: { label: 'Cartão de débito', icon: 'card', online: true },
  na_entrega: { label: 'Pagar na entrega', icon: 'banknote', online: false },
};

/**
 * Formas aceitas na entrega. `machine: true` = o entregador precisa levar a
 * maquininha; a comanda destaca isso para não sair entrega sem o equipamento.
 */
export const ON_DELIVERY_KINDS = {
  dinheiro: { label: 'Dinheiro', icon: 'banknote', machine: false, badge: '💵 Dinheiro' },
  credito: { label: 'Cartão de crédito', icon: 'card', machine: true, badge: '💳 Crédito na entrega' },
  debito: { label: 'Cartão de débito', icon: 'card', machine: true, badge: '💳 Débito na entrega' },
  pix: { label: 'Pix na entrega', icon: 'qr', machine: false, badge: '📱 Pix na entrega' },
};

/** Texto curto do pagamento para listas e comandas. */
export function paymentLabel(order) {
  if (order.payment_method === 'na_entrega') {
    const kind = ON_DELIVERY_KINDS[order.on_delivery_kind];
    return kind ? `${kind.label} na entrega` : 'Pagar na entrega';
  }
  const base = PAYMENT_METHODS[order.payment_method]?.label ?? order.payment_method;
  return order.installments > 1 ? `${base} · ${order.installments}x` : base;
}

export const DISCOUNT_KINDS = {
  percentual: 'Percentual (%)',
  fixo: 'Valor fixo (R$)',
  frete_gratis: 'Frete grátis',
  brinde: 'Brinde',
};

/**
 * Provedores conhecidos pelo roteador de pagamento.
 * Adicionar um gateway novo = incluir aqui + criar o adapter na Edge Function
 * `create-payment`. O app do cliente não muda.
 */
/**
 * Provedores conhecidos pelo roteador.
 *
 * `implemented: false` = o provedor aparece no painel e pode ser escolhido,
 * mas ainda NÃO tem adapter escrito em `supabase/functions/create-payment`.
 * A tela de Pagamentos avisa isso e impede ativar o método sem integração —
 * melhor barrar no painel do que deixar o cliente num checkout que não fecha.
 */
export const PAYMENT_PROVIDERS = {
  infinitepay: {
    label: 'InfinitePay',
    methods: ['pix', 'cartao_credito'],
    note: 'Pix grátis e na hora · cartão na hora ou D+1',
    implemented: true,
  },
  asaas: {
    label: 'Asaas',
    methods: ['pix', 'cartao_credito', 'cartao_debito'],
    note: 'Cartão em D+32 (ou antecipação com taxa)',
    implemented: true,
  },
  pagbank: {
    label: 'PagBank',
    methods: ['pix', 'cartao_credito', 'cartao_debito'],
    note: 'Débito com 3DS na tela do PagBank',
    implemented: true,
  },
  mercadopago: {
    label: 'Mercado Pago',
    methods: ['pix', 'cartao_credito', 'cartao_debito'],
    note: 'Crédito via Checkout Pro',
    implemented: true,
  },
  manual: {
    label: 'Sem gateway',
    methods: ['na_entrega'],
    note: 'Registro manual, sem cobrança online',
    implemented: true,
  },
};

export const STORAGE_BUCKET = 'menu';
