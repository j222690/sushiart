import { supabase, friendlyError } from './supabase';
import { STORAGE_BUCKET } from './constants';

/** Lança com mensagem já legível, para o componente só fazer catch e mostrar. */
function unwrap({ data, error }, fallback) {
  if (error) throw new Error(friendlyError(error, fallback));
  return data;
}

// ===========================================================================
// CARDÁPIO
// ===========================================================================
export const menu = {
  async categories() {
    return unwrap(
      await supabase
        .from('categories')
        .select('*')
        .eq('active', true)
        .order('sort_order'),
      'Não foi possível carregar as categorias.'
    );
  },

  async products() {
    return unwrap(
      await supabase
        .from('products_public')
        .select('*')
        .eq('active', true)
        .order('sort_order'),
      'Não foi possível carregar o cardápio.'
    );
  },

  async product(id) {
    return unwrap(
      await supabase.from('products_public').select('*').eq('id', id).single(),
      'Produto não encontrado.'
    );
  },

  /** Grupos de adicionais com os itens já aninhados. */
  async addons(productId) {
    return unwrap(
      await supabase
        .from('addon_groups')
        .select('id, name, min_select, max_select, sort_order, product_addons(id, name, price_cents, active, sort_order)')
        .eq('product_id', productId)
        .order('sort_order'),
      'Não foi possível carregar os adicionais.'
    );
  },

  /** Busca por nome/descrição. Filtro client-side complementa acentuação. */
  async search(term) {
    const q = term.trim();
    if (q.length < 2) return [];
    return unwrap(
      await supabase
        .from('products_public')
        .select('*')
        .eq('active', true)
        .or(`name.ilike.%${q}%,description.ilike.%${q}%`)
        .limit(30),
      'Busca indisponível no momento.'
    );
  },

  async recommended(limit = 8) {
    return unwrap(
      await supabase.rpc('recommended_products', { p_limit: limit }),
      'Não foi possível carregar as recomendações.'
    );
  },
};

// ===========================================================================
// HOME: banners, ofertas, cupons públicos
// ===========================================================================
export const home = {
  async banners() {
    const now = new Date().toISOString();
    return unwrap(
      await supabase
        .from('banners')
        .select('*')
        .eq('active', true)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gte.${now}`)
        .order('sort_order'),
      'Não foi possível carregar os destaques.'
    );
  },

  async offers() {
    const now = new Date().toISOString();
    return unwrap(
      await supabase
        .from('offers')
        .select('*, product:products(id, name, description, image_url, price_cents, sold_out, active)')
        .eq('active', true)
        .lte('starts_at', now)
        .or(`ends_at.is.null,ends_at.gte.${now}`)
        .order('sort_order'),
      'Não foi possível carregar as ofertas.'
    );
  },

  /** Cupons clicáveis — o cliente aplica sem digitar código. */
  async publicCoupons() {
    return unwrap(
      await supabase
        .from('coupons')
        .select('*')
        .eq('active', true)
        .order('min_order_cents'),
      'Não foi possível carregar os cupons.'
    );
  },
};

// ===========================================================================
// CONFIGURAÇÕES DO RESTAURANTE
// ===========================================================================
export const settings = {
  async restaurant() {
    return unwrap(
      await supabase.from('restaurant_settings').select('*').eq('id', 1).single(),
      'Não foi possível carregar as configurações.'
    );
  },

  async hours() {
    return unwrap(
      await supabase.from('business_hours').select('*').order('weekday').order('opens_at'),
      'Não foi possível carregar os horários.'
    );
  },

  async zones() {
    return unwrap(
      await supabase.from('delivery_zones').select('*').order('neighborhood'),
      'Não foi possível carregar as taxas de entrega.'
    );
  },

  async isOpen() {
    const { data, error } = await supabase.rpc('is_restaurant_open');
    if (error) return false;
    return Boolean(data);
  },

  async paymentMethods() {
    return unwrap(
      await supabase.from('payment_config').select('*').eq('is_active', true).order('sort_order'),
      'Não foi possível carregar as formas de pagamento.'
    );
  },
};

// ===========================================================================
// CLIENTE: perfil, endereços, favoritos
// ===========================================================================
export const profile = {
  async get(userId) {
    return unwrap(
      await supabase.from('customers').select('*').eq('id', userId).single(),
      'Não foi possível carregar seu perfil.'
    );
  },

  async update(userId, patch) {
    return unwrap(
      await supabase.from('customers').update(patch).eq('id', userId).select().single(),
      'Não foi possível salvar seu perfil.'
    );
  },

  async addresses(userId) {
    return unwrap(
      await supabase
        .from('addresses')
        .select('*')
        .eq('customer_id', userId)
        .order('is_default', { ascending: false })
        .order('created_at'),
      'Não foi possível carregar seus endereços.'
    );
  },

  async saveAddress(userId, address) {
    // Só um endereço padrão por cliente.
    if (address.is_default) {
      await supabase.from('addresses').update({ is_default: false }).eq('customer_id', userId);
    }
    const payload = { ...address, customer_id: userId };
    const query = address.id
      ? supabase.from('addresses').update(payload).eq('id', address.id)
      : supabase.from('addresses').insert(payload);

    return unwrap(await query.select().single(), 'Não foi possível salvar o endereço.');
  },

  async deleteAddress(id) {
    const { error } = await supabase.from('addresses').delete().eq('id', id);
    if (error) throw new Error(friendlyError(error, 'Não foi possível excluir o endereço.'));
  },

  async favorites(userId) {
    const rows = unwrap(
      await supabase
        .from('favorites')
        .select('product_id, products(*)')
        .eq('customer_id', userId),
      'Não foi possível carregar seus favoritos.'
    );
    return rows.map((r) => r.products).filter(Boolean);
  },

  async toggleFavorite(userId, productId, isFavorite) {
    if (isFavorite) {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('customer_id', userId)
        .eq('product_id', productId);
      if (error) throw new Error(friendlyError(error));
      return false;
    }
    const { error } = await supabase
      .from('favorites')
      .insert({ customer_id: userId, product_id: productId });
    if (error) throw new Error(friendlyError(error));
    return true;
  },
};

// ===========================================================================
// PEDIDOS
// ===========================================================================
export const orders = {
  /**
   * O payload leva só IDs e quantidades — os preços vêm do banco.
   * Veja create_order() em 0003_functions.sql.
   */
  async create(payload) {
    return unwrap(await supabase.rpc('create_order', { p_payload: payload }), 'Não foi possível criar o pedido.');
  },

  async list(userId) {
    return unwrap(
      await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('customer_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      'Não foi possível carregar seus pedidos.'
    );
  },

  async get(id) {
    return unwrap(
      await supabase
        .from('orders')
        .select('*, order_items(*), order_status_history(status, created_at)')
        .eq('id', id)
        .single(),
      'Pedido não encontrado.'
    );
  },

  async cancel(id, reason) {
    const { error } = await supabase.rpc('cancel_my_order', { p_order_id: id, p_reason: reason });
    if (error) throw new Error(friendlyError(error, 'Não foi possível cancelar o pedido.'));
  },

  /** Cria a cobrança no gateway configurado para o método. */
  async startPayment(orderId) {
    const { data, error } = await supabase.functions.invoke('create-payment', {
      body: { order_id: orderId },
    });
    if (error) throw new Error(friendlyError(error, 'Não foi possível iniciar o pagamento.'));
    if (data?.error) throw new Error(data.error);
    return data;
  },
};

// ===========================================================================
// PROMOÇÕES: cupons, roleta, fidelidade
// ===========================================================================
export const promo = {
  async validateCoupon(code, subtotalCents, deliveryFeeCents = 0) {
    return unwrap(
      await supabase.rpc('validate_coupon', {
        p_code: code,
        p_subtotal_cents: subtotalCents,
        p_delivery_fee_cents: deliveryFeeCents,
      }),
      'Não foi possível validar o cupom.'
    );
  },

  async myCoupons(userId) {
    return unwrap(
      await supabase
        .from('coupons')
        .select('*')
        .eq('customer_id', userId)
        .eq('active', true)
        .order('valid_until'),
      'Não foi possível carregar seus cupons.'
    );
  },

  async canSpin() {
    return unwrap(await supabase.rpc('can_spin'), 'Roleta indisponível.');
  },

  async prizes() {
    return unwrap(
      await supabase
        .from('roulette_prizes')
        .select('*')
        .eq('active', true)
        .order('sort_order'),
      'Não foi possível carregar os prêmios.'
    );
  },

  async spin() {
    return unwrap(await supabase.rpc('spin_roulette'), 'Não foi possível girar a roleta.');
  },

  async loyaltyBalance() {
    return unwrap(await supabase.rpc('loyalty_balance'), 'Não foi possível carregar seus pontos.');
  },

  async loyaltyConfig() {
    return unwrap(
      await supabase.from('loyalty_config').select('*').eq('id', 1).single(),
      'Não foi possível carregar o programa de fidelidade.'
    );
  },

  async loyaltyHistory(userId) {
    return unwrap(
      await supabase
        .from('loyalty_transactions')
        .select('*')
        .eq('customer_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      'Não foi possível carregar seu extrato.'
    );
  },

  async redeemLoyalty() {
    return unwrap(await supabase.rpc('redeem_loyalty_coupon'), 'Não foi possível resgatar.');
  },
};

// ===========================================================================
// NOTIFICAÇÕES
// ===========================================================================
export const notifications = {
  async list(userId) {
    return unwrap(
      await supabase
        .from('notifications')
        .select('*')
        // `audience` importa: quem é da equipe enxerga os dois públicos pela
        // RLS, e sem este filtro veria "pedido novo chegou" na tela do cliente.
        .eq('audience', 'cliente')
        .or(`customer_id.eq.${userId},customer_id.is.null`)
        .order('created_at', { ascending: false })
        .limit(30),
      'Não foi possível carregar as notificações.'
    );
  },

  async markRead(id) {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  },

  /**
   * Registra este aparelho para receber push de um público.
   * O conflito é em (token, audience): o mesmo navegador pode estar inscrito
   * como cliente e como equipe ao mesmo tempo.
   */
  async saveToken(userId, token, platform = 'web', audience = 'cliente') {
    return unwrap(
      await supabase
        .from('push_tokens')
        .upsert(
          { customer_id: userId, token, platform, audience },
          { onConflict: 'token,audience' }
        ),
      'Não foi possível registrar este aparelho para notificações.'
    );
  },

  async removeToken(token, audience = 'cliente') {
    await supabase.from('push_tokens').delete().eq('token', token).eq('audience', audience);
  },

  async hasToken(userId, token, audience = 'cliente') {
    const { count } = await supabase
      .from('push_tokens')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', userId)
      .eq('token', token)
      .eq('audience', audience);

    return (count ?? 0) > 0;
  },

  /** Dispara um push de teste nos aparelhos de quem está logado. */
  async sendTest(audience = 'cliente') {
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: { test: true, audience },
    });
    if (error) throw new Error('Não foi possível enviar o teste.');
    if (data?.error) throw new Error(data.error);
    return data;
  },
};

// ===========================================================================
// STORAGE (upload de fotos no admin)
// ===========================================================================
export const storage = {
  /** Retorna a URL pública. Valida tipo e tamanho antes de subir. */
  async uploadImage(file, folder = 'produtos') {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
    if (!allowed.includes(file.type)) {
      throw new Error('Use uma imagem JPG, PNG, WEBP ou AVIF.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('A imagem precisa ter até 5 MB.');
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, { cacheControl: '31536000', upsert: false });

    if (error) throw new Error(friendlyError(error, 'Não foi possível enviar a imagem.'));

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  },
};

export { friendlyError };
