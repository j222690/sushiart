import { supabase, friendlyError } from './supabase';

function unwrap({ data, error }, fallback) {
  if (error) throw new Error(friendlyError(error, fallback));
  return data;
}

/** Genérico para os CRUDs simples do painel (categorias, cupons, banners...). */
function crud(table, defaultOrder = 'created_at') {
  return {
    async list(order = defaultOrder, ascending = true) {
      return unwrap(
        await supabase.from(table).select('*').order(order, { ascending }),
        `Não foi possível carregar ${table}.`
      );
    },
    async create(row) {
      return unwrap(await supabase.from(table).insert(row).select().single(), 'Não foi possível criar.');
    },
    async update(id, patch) {
      return unwrap(
        await supabase.from(table).update(patch).eq('id', id).select().single(),
        'Não foi possível salvar.'
      );
    },
    async remove(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw new Error(friendlyError(error, 'Não foi possível excluir.'));
    },
  };
}

export const adminCategories = crud('categories', 'sort_order');
export const adminBanners = crud('banners', 'sort_order');
export const adminOffers = crud('offers', 'sort_order');
export const adminCoupons = crud('coupons', 'created_at');
export const adminPrizes = crud('roulette_prizes', 'sort_order');
export const adminZones = crud('delivery_zones', 'neighborhood');
export const adminHours = crud('business_hours', 'weekday');

/**
 * Dias de exceção — feriado, folga, evento.
 *
 * A chave primária é a própria data, não um `id`, porque não faz sentido ter
 * duas regras para o mesmo dia. Por isso o CRUD genérico não serve: ele apaga
 * e atualiza por `id`.
 */
export const adminExcecoes = {
  /** Só de hoje em diante: dia que já passou não muda mais nada. */
  async list() {
    const hoje = new Date().toISOString().slice(0, 10);
    return unwrap(
      await supabase.from('business_exceptions').select('*').gte('date', hoje).order('date'),
      'Não foi possível carregar os dias de exceção.'
    );
  },

  /** Grava por data: marcar o mesmo dia de novo corrige, em vez de duplicar. */
  async save(row) {
    return unwrap(
      await supabase.from('business_exceptions').upsert(row, { onConflict: 'date' }).select().single(),
      'Não foi possível salvar o dia.'
    );
  },

  async remove(date) {
    const { error } = await supabase.from('business_exceptions').delete().eq('date', date);
    if (error) throw new Error(friendlyError(error, 'Não foi possível remover o dia.'));
  },
};

// ---------------------------------------------------------------------------
// Produtos e adicionais
// ---------------------------------------------------------------------------
export const adminProducts = {
  ...crud('products', 'sort_order'),

  async listWithCategory() {
    return unwrap(
      await supabase
        .from('products')
        .select('*, categories(name, slug)')
        .order('sort_order'),
      'Não foi possível carregar os produtos.'
    );
  },

  /** Atalho do "esgotado hoje" — o botão mais usado durante o serviço. */
  async toggleSoldOut(id, soldOut) {
    return unwrap(
      await supabase.from('products').update({ sold_out: soldOut }).eq('id', id).select().single(),
      'Não foi possível atualizar o produto.'
    );
  },

  async addonGroups(productId) {
    return unwrap(
      await supabase
        .from('addon_groups')
        .select('*, product_addons(*)')
        .eq('product_id', productId)
        .order('sort_order'),
      'Não foi possível carregar os adicionais.'
    );
  },

  async createAddonGroup(group) {
    return unwrap(
      await supabase.from('addon_groups').insert(group).select().single(),
      'Não foi possível criar o grupo.'
    );
  },

  async removeAddonGroup(id) {
    const { error } = await supabase.from('addon_groups').delete().eq('id', id);
    if (error) throw new Error(friendlyError(error));
  },

  async saveAddon(addon) {
    const query = addon.id
      ? supabase.from('product_addons').update(addon).eq('id', addon.id)
      : supabase.from('product_addons').insert(addon);
    return unwrap(await query.select().single(), 'Não foi possível salvar o adicional.');
  },

  async removeAddon(id) {
    const { error } = await supabase.from('product_addons').delete().eq('id', id);
    if (error) throw new Error(friendlyError(error));
  },
};

// ---------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------
export const adminOrders = {
  async list({ statuses, from, to, limit = 100 } = {}) {
    let query = supabase
      .from('orders')
      .select('*, order_items(*), customers(name, phone)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (statuses?.length) query = query.in('status', statuses);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    return unwrap(await query, 'Não foi possível carregar os pedidos.');
  },

  async get(id) {
    return unwrap(
      await supabase
        .from('orders')
        .select('*, order_items(*), customers(name, phone, email), order_status_history(status, created_at)')
        .eq('id', id)
        .single(),
      'Pedido não encontrado.'
    );
  },

  async setStatus(id, status, note = null) {
    const { error } = await supabase.rpc('admin_set_order_status', {
      p_order_id: id,
      p_status: status,
      p_note: note,
    });
    if (error) throw new Error(friendlyError(error, 'Não foi possível mudar o status.'));
  },

  /** Confirma manualmente um Pix/cartão que caiu fora do webhook. */
  async markPaidManually(id) {
    return unwrap(
      await supabase
        .from('orders')
        .update({ payment_status: 'pago', status: 'pago', paid_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single(),
      'Não foi possível confirmar o pagamento.'
    );
  },
};

// ---------------------------------------------------------------------------
// Configurações
// ---------------------------------------------------------------------------
export const adminSettings = {
  async restaurant() {
    return unwrap(
      await supabase.from('restaurant_settings').select('*').eq('id', 1).single(),
      'Não foi possível carregar as configurações.'
    );
  },

  async saveRestaurant(patch) {
    return unwrap(
      await supabase.from('restaurant_settings').update(patch).eq('id', 1).select().single(),
      'Não foi possível salvar.'
    );
  },

  async paymentConfig() {
    return unwrap(
      await supabase.from('payment_config').select('*').order('sort_order'),
      'Não foi possível carregar o roteador de pagamentos.'
    );
  },

  async savePaymentConfig(method, patch) {
    return unwrap(
      await supabase.from('payment_config').update(patch).eq('method', method).select().single(),
      'Não foi possível salvar a configuração de pagamento.'
    );
  },

  // -------------------------------------------------------------------------
  // Conta do Mercado Pago (OAuth)
  //
  // Enquanto ninguém conecta, as cobranças saem do token de ambiente — que é
  // do desenvolvedor. O dinheiro cai na conta errada. Conectar aqui é o que
  // corrige isso.
  // -------------------------------------------------------------------------

  /** Status da conexão. Nunca devolve token: a função no banco filtra. */
  async mercadoPagoStatus() {
    return unwrap(
      await supabase.rpc('mp_connection_status'),
      'Não foi possível verificar a conta do Mercado Pago.'
    );
  },

  /**
   * Começa a conexão e devolve o link para autorizar.
   *
   * Passa pela Edge Function, e não por um link montado aqui, por dois
   * motivos: o `client_secret` não pode chegar ao navegador, e o `state` que
   * protege o retorno precisa nascer no servidor para valer alguma coisa.
   */
  async mercadoPagoConnectUrl() {
    const { data, error } = await supabase.functions.invoke('mercadopago-oauth/start', {
      method: 'POST',
    });
    if (error) {
      throw new Error(
        data?.error ?? 'Não foi possível iniciar a conexão com o Mercado Pago.'
      );
    }
    return data.url;
  },

  async mercadoPagoDisconnect() {
    const { error } = await supabase.rpc('mp_disconnect');
    if (error) throw new Error(friendlyError(error, 'Não foi possível desconectar.'));
  },

  async rouletteConfig() {
    return unwrap(
      await supabase.from('roulette_config').select('*').eq('id', 1).single(),
      'Não foi possível carregar a roleta.'
    );
  },

  async saveRouletteConfig(patch) {
    return unwrap(
      await supabase.from('roulette_config').update(patch).eq('id', 1).select().single(),
      'Não foi possível salvar.'
    );
  },

  async loyaltyConfig() {
    return unwrap(
      await supabase.from('loyalty_config').select('*').eq('id', 1).single(),
      'Não foi possível carregar a fidelidade.'
    );
  },

  async saveLoyaltyConfig(patch) {
    return unwrap(
      await supabase.from('loyalty_config').update(patch).eq('id', 1).select().single(),
      'Não foi possível salvar.'
    );
  },
};

// ---------------------------------------------------------------------------
// Relatórios
// ---------------------------------------------------------------------------
export const adminReports = {
  async summary(from, to) {
    return unwrap(await supabase.rpc('report_summary', { p_from: from, p_to: to }), 'Relatório indisponível.');
  },
  async byPayment(from, to) {
    return unwrap(await supabase.rpc('report_by_payment', { p_from: from, p_to: to }), 'Relatório indisponível.');
  },
  async cash(from, to) {
    return unwrap(
      await supabase.rpc('report_cash_reconciliation', { p_from: from, p_to: to }),
      'Relatório indisponível.'
    );
  },
  async topProducts(from, to, limit = 15) {
    return unwrap(
      await supabase.rpc('report_top_products', { p_from: from, p_to: to, p_limit: limit }),
      'Relatório indisponível.'
    );
  },
  async daily(from, to) {
    return unwrap(await supabase.rpc('report_daily_revenue', { p_from: from, p_to: to }), 'Relatório indisponível.');
  },
  async promotions(from, to) {
    return unwrap(await supabase.rpc('report_promotions', { p_from: from, p_to: to }), 'Relatório indisponível.');
  },
  async customers(from, to) {
    return unwrap(await supabase.rpc('report_customers', { p_from: from, p_to: to }), 'Relatório indisponível.');
  },
};

// ---------------------------------------------------------------------------
// Campanhas
//
// Disparar aviso para toda a base. Passa por funções no banco porque quem
// decide o público e a permissão é o servidor: `enviar_campanha` confere
// `is_admin()`, e a entrega respeita quem aceitou marketing.
// ---------------------------------------------------------------------------
export const adminCampanhas = {
  /** A mensagem que faz sentido agora, com o motivo da escolha. */
  async sugerir() {
    const { data, error } = await supabase.rpc('sugerir_campanha');
    if (error) throw new Error(friendlyError(error, 'Não foi possível sugerir uma mensagem.'));
    return Array.isArray(data) ? data[0] ?? null : data;
  },

  /** A biblioteca inteira, com os marcadores já preenchidos. */
  async modelos() {
    return unwrap(await supabase.rpc('listar_modelos'), 'Não foi possível carregar as mensagens.');
  },

  async enviar({ titulo, corpo, link }) {
    return unwrap(
      await supabase.rpc('enviar_campanha', {
        p_titulo: titulo,
        p_corpo: corpo,
        p_link: link || '/ofertas',
      }),
      'Não foi possível enviar a campanha.'
    );
  },

  /** O que já foi disparado — evita repetir e mostra o que foi tentado. */
  async historico(limite = 12) {
    return unwrap(
      await supabase
        .from('notifications')
        .select('id, title, body, created_at')
        .is('customer_id', null)
        .eq('audience', 'cliente')
        .order('created_at', { ascending: false })
        .limit(limite),
      'Não foi possível carregar o histórico.'
    );
  },
};
