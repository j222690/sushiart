/* Service worker do Sushi Art — apenas notificações push.
   Não faz cache offline: o cardápio e os preços precisam estar sempre frescos. */

self.addEventListener('push', (event) => {
  let payload = { title: 'Sushi Art', body: 'Você tem uma novidade.' };

  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  const paraEquipe = payload.data?.audience === 'equipe';

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: payload.tag || 'sushiart',
      data: payload.data || {},
      // Aviso de pedido novo fica na tela até alguém tocar. Numa cozinha
      // movimentada, notificação que some sozinha é pedido perdido.
      requireInteraction: paraEquipe,
      vibrate: paraEquipe ? [120, 60, 120, 60, 120] : [80, 40, 80],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const dados = event.notification.data || {};
  const orderId = dados.order_id;

  // A equipe vai para o kanban; o cliente, para o próprio pedido.
  let target;
  if (dados.audience === 'equipe') {
    target = '/admin/pedidos';
  } else if (orderId) {
    target = `/pedidos/${orderId}`;
  } else {
    target = dados.url || '/';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Se o app já está aberto, navega na aba existente em vez de abrir outra.
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
