import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Carrinho local. Os preços guardados aqui servem SÓ para mostrar o total na
 * tela — quem manda é o `create_order()` no banco, que recalcula tudo.
 */

/** Duas linhas do carrinho só se fundem se produto, adicionais e observação forem iguais. */
function lineKey(productId, addons, notes) {
  const ids = addons
    .map((a) => a.id)
    .sort()
    .join(',');
  return `${productId}|${ids}|${(notes || '').trim().toLowerCase()}`;
}

export const useCart = create(
  persist(
    (set, get) => ({
      items: [],
      fulfillment: 'entrega', // 'entrega' | 'retirada'
      addressId: null,
      coupon: null, // resultado de validate_coupon()
      redeemLoyalty: false,

      addItem({ product, quantity = 1, addons = [], notes = '' }) {
        const unit = product.effective_price_cents ?? product.price_cents;
        const key = lineKey(product.id, addons, notes);
        const items = [...get().items];
        const existing = items.findIndex((i) => i.key === key);

        if (existing >= 0) {
          items[existing] = { ...items[existing], quantity: items[existing].quantity + quantity };
        } else {
          items.push({
            key,
            product_id: product.id,
            name: product.name,
            image: product.image_url,
            unit_price_cents: unit,
            compare_at_price_cents: product.compare_at_price_cents,
            quantity,
            addons,
            notes: notes.trim(),
          });
        }
        set({ items });
      },

      updateQuantity(key, quantity) {
        if (quantity <= 0) return get().removeItem(key);
        set({
          items: get().items.map((i) => (i.key === key ? { ...i, quantity } : i)),
        });
      },

      updateNotes(key, notes) {
        const items = get().items.map((i) =>
          i.key === key ? { ...i, notes, key: lineKey(i.product_id, i.addons, notes) } : i
        );
        set({ items });
      },

      removeItem(key) {
        const items = get().items.filter((i) => i.key !== key);
        // Cupom com valor mínimo pode ter deixado de valer — revalidamos no checkout.
        set({ items, ...(items.length === 0 ? { coupon: null, redeemLoyalty: false } : {}) });
      },

      clear() {
        set({ items: [], coupon: null, redeemLoyalty: false });
      },

      setFulfillment(fulfillment) {
        // Frete grátis não faz sentido na retirada: derruba o cupom para revalidar.
        const coupon = get().coupon;
        set({
          fulfillment,
          coupon: coupon?.kind === 'frete_gratis' && fulfillment === 'retirada' ? null : coupon,
        });
      },

      setAddressId(addressId) {
        set({ addressId });
      },

      setCoupon(coupon) {
        set({ coupon });
      },

      setRedeemLoyalty(redeemLoyalty) {
        set({ redeemLoyalty });
      },

      // ----- derivados -----
      count() {
        return get().items.reduce((sum, i) => sum + i.quantity, 0);
      },

      subtotal() {
        return get().items.reduce((sum, i) => {
          const addons = i.addons.reduce((a, x) => a + x.price_cents, 0);
          return sum + (i.unit_price_cents + addons) * i.quantity;
        }, 0);
      },

      /** Payload enviado à RPC: só IDs, quantidades e texto livre. */
      toOrderPayload({
        paymentMethod,
        onDeliveryKind = null,
        installments = 1,
        changeForCents = null,
        notes = '',
      }) {
        const state = get();
        return {
          fulfillment: state.fulfillment,
          address_id: state.fulfillment === 'entrega' ? state.addressId : null,
          items: state.items.map((i) => ({
            product_id: i.product_id,
            quantity: i.quantity,
            notes: i.notes || null,
            addon_ids: i.addons.map((a) => a.id),
          })),
          coupon_code: state.coupon?.code ?? null,
          redeem_loyalty: state.redeemLoyalty,
          payment_method: paymentMethod,
          on_delivery_kind: paymentMethod === 'na_entrega' ? onDeliveryKind : null,
          installments,
          // Troco só existe em dinheiro — um constraint no banco também barra.
          change_for_cents: onDeliveryKind === 'dinheiro' ? changeForCents : null,
          notes,
        };
      },
    }),
    {
      name: 'sushiart.cart',
      // A validação do cupom expira; revalidamos ao abrir o checkout.
      partialize: (s) => ({
        items: s.items,
        fulfillment: s.fulfillment,
        addressId: s.addressId,
      }),
    }
  )
);
