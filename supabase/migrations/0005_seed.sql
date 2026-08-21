-- =============================================================================
-- DADOS DE DEMONSTRAÇÃO
--
-- ATENÇÃO: nomes, descrições e preços dos produtos abaixo são um cardápio de
-- exemplo para o app subir funcionando — NÃO são o cardápio real do Sushi Art.
-- Troque tudo pelo cardápio verdadeiro no painel admin (ou reescreva este
-- arquivo) antes de colocar no ar. As categorias (Pokes, Combos, Alacarte)
-- seguem as do Instagram @sushiartchapeco.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Restaurante
-- ---------------------------------------------------------------------------
insert into restaurant_settings (id, phone, whatsapp, address_street, address_number,
                                 address_neighborhood, min_order_cents, prep_time_min, delivery_time_min)
values (1, '(49) 3000-0000', '5549900000000', 'Rua a definir', 's/n', 'Centro', 3000, 45, 20)
on conflict (id) do nothing;

-- Terça a domingo, 18h30 às 23h30. Segunda fechado.
insert into business_hours (weekday, opens_at, closes_at) values
  (2, '18:30', '23:30'),
  (3, '18:30', '23:30'),
  (4, '18:30', '23:30'),
  (5, '18:30', '23:59'),
  (6, '18:30', '23:59'),
  (0, '18:30', '23:00');

-- Taxas por bairro de Chapecó (valores de exemplo — ajuste no admin).
insert into delivery_zones (neighborhood, fee_cents, eta_min, min_order_cents) values
  ('Centro',              599,  35, 3000),
  ('Presidente Médici',   799,  45, 3000),
  ('Passo dos Fortes',    899,  45, 3000),
  ('Jardim Itália',       799,  45, 3000),
  ('Universitário',       899,  50, 3000),
  ('Santa Maria',        1099,  55, 4000),
  ('São Cristóvão',      1099,  55, 4000),
  ('Efapi',              1299,  60, 5000),
  ('Bela Vista',          899,  45, 3000),
  ('Seminário',           699,  40, 3000),
  ('Maria Goretti',       999,  50, 4000),
  ('Palmital',           1199,  55, 4000),
  ('Esplanada',           999,  50, 4000),
  ('Líder',              1099,  55, 4000),
  ('Jardim América',      899,  45, 3000),
  ('Belvedere',           799,  40, 3000),
  ('Quedas do Palmital', 1299,  60, 5000),
  ('Engenho Braun',      1199,  55, 4000),
  ('Vila Rica',           999,  50, 4000),
  ('Cristo Rei',          999,  50, 4000);

-- ---------------------------------------------------------------------------
-- Roteador de pagamentos
-- ---------------------------------------------------------------------------
-- Roteamento definido pelo restaurante. Trocar de gateway depois é mudar o
-- `provider` em Painel → Pagamentos, sem tocar no app do cliente.
--
-- ATENÇÃO: há adapter escrito para `infinitepay` e `asaas`. `pagbank` e
-- `mercadopago` estão roteados aqui, mas ainda SEM integração — enquanto o
-- adapter não existir, esses métodos entram inativos para não deixar o cliente
-- num checkout que não completa.
insert into payment_config (method, provider, is_active, label, description, options, sort_order) values
  ('pix', 'infinitepay', true, 'Pix',
   'Aprovação na hora, direto no app',
   '{"expires_minutes": 30}', 1),

  ('cartao_credito', 'mercadopago', false, 'Cartão de crédito',
   'Visa, Mastercard, Elo, Amex e Hipercard',
   '{"max_installments": 3, "min_installment_cents": 2000, "brands": ["visa","mastercard","elo","amex","hipercard"]}', 2),

  ('cartao_debito', 'pagbank', false, 'Cartão de débito',
   'Débito à vista, direto na conta',
   '{"brands": ["visa","mastercard","elo"]}', 3),

  ('na_entrega', 'manual', true, 'Pagar na entrega',
   'Dinheiro, cartão ou Pix direto com o entregador',
   '{"kinds": ["dinheiro", "credito", "debito", "pix"], "ask_change": true}', 4);

-- ---------------------------------------------------------------------------
-- Fidelidade e roleta
-- ---------------------------------------------------------------------------
insert into loyalty_config (id, active, points_per_real, points_to_reward, reward_kind, reward_cents, expire_days)
values (1, true, 1, 150, 'fixo', 1500, 180)
on conflict (id) do nothing;

insert into roulette_config (id, active, spin_rule, cooldown_hours, prize_validity_hours)
values (1, true, 'dia', 24, 48)
on conflict (id) do nothing;

-- Pesos = probabilidade relativa. Soma 100 aqui, então weight ≈ % de chance.
insert into roulette_prizes (label, prize_kind, discount_percent, discount_cents, gift_description,
                             min_order_cents, weight, color, sort_order) values
  ('5% OFF',        'percentual', 5,    null, null,                    4000, 30, '#8B2635', 1),
  ('10% OFF',       'percentual', 10,   null, null,                    6000, 22, '#611A1B', 2),
  ('Frete grátis',  'frete_gratis', null, null, null,                  7000, 18, '#8B2635', 3),
  ('R$ 10 OFF',     'fixo',       null, 1000, null,                    8000, 12, '#611A1B', 4),
  ('Hot roll grátis','brinde',    null, null, 'Hot roll (8 peças) grátis', 9000, 5, '#C9803F', 5),
  ('15% OFF',       'percentual', 15,   null, null,                   10000,  3, '#8B2635', 6),
  ('Não foi dessa vez', null,     null, null, null,                       0, 10, '#1E1E1E', 7);

-- ---------------------------------------------------------------------------
-- Cupons de partida
-- ---------------------------------------------------------------------------
insert into coupons (code, description, discount_kind, discount_percent, discount_cents,
                     max_discount_cents, min_order_cents, valid_until,
                     usage_limit_per_customer, is_public, source) values
  ('BEMVINDO10', 'Primeiro pedido com 10% OFF', 'percentual', 10, null, 2000, 5000,
   now() + interval '365 days', 1, true, 'admin'),
  ('FRETEGRATIS', 'Frete grátis acima de R$ 90', 'frete_gratis', null, null, null, 9000,
   now() + interval '90 days', 2, true, 'admin'),
  ('SUSHI15', 'R$ 15 OFF nos combos', 'fixo', null, 1500, null, 12000,
   now() + interval '30 days', 1, true, 'admin');

-- ---------------------------------------------------------------------------
-- Categorias (base do Instagram do restaurante)
-- ---------------------------------------------------------------------------
insert into categories (name, slug, sort_order) values
  ('Combos',     'combos',     1),
  ('Pokes',      'pokes',      2),
  ('Alacarte',   'alacarte',   3),
  ('Temakis',    'temakis',    4),
  ('Entradas',   'entradas',   5),
  ('Bebidas',    'bebidas',    6),
  ('Sobremesas', 'sobremesas', 7);

-- ---------------------------------------------------------------------------
-- Produtos de exemplo
-- ---------------------------------------------------------------------------
insert into products (category_id, name, description, price_cents, compare_at_price_cents,
                      serves, is_bestseller, is_new, sort_order)
select c.id, p.name, p.description, p.price, p.compare_at, p.serves, p.best, p.novo, p.ord
from categories c
join (values
  -- Combos
  ('combos', 'Combo Amor em Forma de Sushi', 'A casa escolhe 40 peças entre sashimis, uramakis, hossomakis e niguiris. Nosso combo assinatura.', 15900, 18900, '2 a 3 pessoas', true, false, 1),
  ('combos', 'Combo Art 24', '24 peças variadas: 8 uramaki philadelphia, 8 hot roll, 4 niguiri salmão e 4 sashimis.', 9900, null, '1 a 2 pessoas', true, false, 2),
  ('combos', 'Combo Sakura 32', '32 peças com destaque para os uramakis especiais da casa e sashimi de salmão.', 12900, 14500, '2 pessoas', false, false, 3),
  ('combos', 'Combo Vegetariano', '20 peças sem proteína animal: pepino, manga, cream cheese, shimeji e abacate.', 7900, null, '1 pessoa', false, true, 4),
  ('combos', 'Combo Casal Art', '30 peças + 2 temakis + 1 entrada à escolha. Feito pra dividir.', 16900, 19900, '2 pessoas', false, false, 5),

  -- Pokes
  ('pokes', 'Poke Salmão', 'Base de arroz gohan, salmão fresco em cubos, manga, pepino, cebolinha, gergelim e molho da casa.', 4900, null, 'individual', true, false, 1),
  ('pokes', 'Poke Atum', 'Arroz gohan, atum, abacate, edamame, cenoura e molho tarê.', 5400, null, 'individual', false, false, 2),
  ('pokes', 'Poke Mix Art', 'Salmão e atum, manga, cream cheese empanado, pepino e crispy de cebola.', 5900, 6500, 'individual', true, false, 3),
  ('pokes', 'Poke Camarão Empanado', 'Camarão empanado crocante, arroz, abacate, manga e maionese apimentada.', 5900, null, 'individual', false, true, 4),
  ('pokes', 'Poke Veggie', 'Shimeji na manteiga, abacate, edamame, manga, pepino e gergelim.', 4200, null, 'individual', false, false, 5),

  -- Alacarte
  ('alacarte', 'Sashimi de Salmão (10 fatias)', 'Fatias generosas de salmão fresco, corte tradicional.', 5200, null, '10 fatias', true, false, 1),
  ('alacarte', 'Uramaki Philadelphia (8 un)', 'Salmão, cream cheese e cebolinha, envolto em arroz e gergelim.', 3400, null, '8 peças', true, false, 2),
  ('alacarte', 'Hot Roll (8 un)', 'Empanado e frito na hora, recheio de salmão e cream cheese, finalizado com tarê.', 3200, null, '8 peças', false, false, 3),
  ('alacarte', 'Niguiri Salmão (6 un)', 'Bolinho de arroz coberto com lâmina de salmão.', 3000, null, '6 peças', false, false, 4),
  ('alacarte', 'Joy de Salmão (8 un)', 'Salmão maçaricado com cream cheese e tarê.', 3800, 4200, '8 peças', false, false, 5),
  ('alacarte', 'Hossomaki Pepino (8 un)', 'Clássico enrolado na alga com pepino fresco.', 2200, null, '8 peças', false, false, 6),

  -- Temakis
  ('temakis', 'Temaki Salmão', 'Cone de alga com arroz e salmão fresco.', 3200, null, 'individual', true, false, 1),
  ('temakis', 'Temaki Philadelphia', 'Salmão, cream cheese e cebolinha.', 3400, null, 'individual', false, false, 2),
  ('temakis', 'Temaki Hot', 'Cone empanado, salmão e cream cheese, com tarê.', 3600, null, 'individual', false, true, 3),
  ('temakis', 'Temaki Skin', 'Pele de salmão crocante, cebolinha e tarê.', 3000, null, 'individual', false, false, 4),

  -- Entradas
  ('entradas', 'Guioza (6 un)', 'Pastéis japoneses grelhados, recheio de carne suína e legumes, com molho da casa.', 2900, null, '6 peças', false, false, 1),
  ('entradas', 'Sunomono', 'Salada agridoce de pepino com gergelim.', 1900, null, 'individual', false, false, 2),
  ('entradas', 'Missoshiru', 'Sopa de missô com tofu e cebolinha.', 1600, null, 'individual', false, false, 3),
  ('entradas', 'Shimeji na Manteiga', 'Cogumelo shimeji salteado na manteiga e shoyu.', 3200, null, 'para dividir', true, false, 4),

  -- Bebidas
  ('bebidas', 'Coca-Cola 350ml', 'Lata gelada.', 700, null, '350ml', false, false, 1),
  ('bebidas', 'Guaraná Antarctica 350ml', 'Lata gelada.', 700, null, '350ml', false, false, 2),
  ('bebidas', 'Água com Gás', 'Garrafa 500ml.', 500, null, '500ml', false, false, 3),
  ('bebidas', 'Suco de Laranja Natural', 'Feito na hora, 400ml.', 1200, null, '400ml', false, false, 4),
  ('bebidas', 'Chá Verde Gelado', 'Infusão gelada de chá verde com limão.', 1000, null, '400ml', false, true, 5),

  -- Sobremesas
  ('sobremesas', 'Harumaki de Banana', 'Rolinho crocante de banana com canela e açúcar.', 2200, null, '4 peças', false, false, 1),
  ('sobremesas', 'Petit Gateau', 'Bolo quente de chocolate com sorvete de creme.', 2800, null, 'individual', true, false, 2),
  ('sobremesas', 'Mochi Sortido (3 un)', 'Doce japonês de arroz com recheios variados.', 2400, null, '3 peças', false, true, 3)
) as p(cat, name, description, price, compare_at, serves, best, novo, ord)
  on p.cat = c.slug;

-- ---------------------------------------------------------------------------
-- Adicionais — exemplo aplicado aos pokes
-- ---------------------------------------------------------------------------
insert into addon_groups (product_id, name, min_select, max_select, sort_order)
select id, 'Adicionais', 0, 5, 1 from products
where name in ('Poke Salmão', 'Poke Atum', 'Poke Mix Art', 'Poke Camarão Empanado', 'Poke Veggie');

insert into product_addons (group_id, name, price_cents, sort_order)
select g.id, a.name, a.price, a.ord
from addon_groups g
join (values
  ('Salmão extra',        1200, 1),
  ('Cream cheese',         600, 2),
  ('Abacate',              500, 3),
  ('Manga',                400, 4),
  ('Crispy de cebola',     300, 5),
  ('Molho tarê extra',     200, 6)
) as a(name, price, ord) on true
where g.name = 'Adicionais';

-- Adicional simples para os combos
insert into addon_groups (product_id, name, min_select, max_select, sort_order)
select id, 'Acompanhamentos', 0, 3, 1 from products where name like 'Combo%';

insert into product_addons (group_id, name, price_cents, sort_order)
select g.id, a.name, a.price, a.ord
from addon_groups g
join products p on p.id = g.product_id
join (values
  ('Hashi extra',           0, 1),
  ('Shoyu extra',           0, 2),
  ('Gengibre extra',      300, 3),
  ('Wasabi extra',        300, 4)
) as a(name, price, ord) on true
where g.name = 'Acompanhamentos' and p.name like 'Combo%';

-- ---------------------------------------------------------------------------
-- Banners e ofertas da home
-- ---------------------------------------------------------------------------
insert into banners (title, subtitle, link_type, link_value, sort_order) values
  ('Amor em forma de sushi', 'Combos que rendem — e sobram histórias', 'categoria', 'combos', 1),
  ('Gire a roleta', 'Um giro por dia. Todo dia tem prêmio na mesa.', 'roleta', null, 2),
  ('Poke do jeito que você gosta', 'Monte com os adicionais da casa', 'categoria', 'pokes', 3);

-- Oferta do dia: 48h de vigência a partir da instalação.
insert into offers (product_id, title, badge, offer_price_cents, ends_at, sort_order)
select id, 'Combo Art 24 em oferta', 'Oferta do dia', 8400, now() + interval '48 hours', 1
from products where name = 'Combo Art 24';

insert into offers (product_id, title, badge, offer_price_cents, ends_at, sort_order)
select id, 'Poke Mix Art com desconto', 'Só hoje', 4900, now() + interval '24 hours', 2
from products where name = 'Poke Mix Art';
