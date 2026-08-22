-- =============================================================================
-- CARDÁPIO REAL — Sushi Art, Empório do Sushi
--
-- Transcrito do Anota Aí do restaurante em 21/08/2026.
--
-- NÃO é migration: fica fora de `supabase/migrations/` de propósito. Cardápio é
-- dado vivo, editado no painel todo dia — se virasse migration, um `db push`
-- num ambiente novo sobrescreveria o que a loja tivesse cadastrado.
--
-- Rodar UMA VEZ, com o cardápio vazio. NÃO é idempotente para produtos: não
-- existe constraint única em `products.name`, então rodar duas vezes duplica
-- o cardápio inteiro. As categorias, essas sim, têm `slug` único e podem ser
-- reaplicadas à vontade.
--
-- Valores em CENTAVOS, como o resto do sistema.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Categorias
--
-- As do seed (Pokes, Alacarte) não existem no cardápio real e saem. As demais
-- seguem a ordem em que aparecem no Anota Aí — combos primeiro, bebida por
-- último, que é como o cliente navega.
-- -----------------------------------------------------------------------------
delete from categories
where slug not in (
  'combinados','entradas','hot','uramaki','especiais','djow',
  'hossomaki','niguiri','sashimis','temakis','porcoes','sobremesas','bebidas'
);

insert into categories (slug, name, sort_order, active) values
  ('combinados', 'Combinados',                1, true),
  ('entradas',   'Entradas',                  2, true),
  ('hot',        'Hot (10 peças)',            3, true),
  ('uramaki',    'Uramaki (10 peças)',        4, true),
  ('especiais',  'Sushis Especiais (10 peças)', 5, true),
  ('djow',       'Djow Especiais (4 peças)',  6, true),
  ('hossomaki',  'Hossomaki (8 peças)',       7, true),
  ('niguiri',    'Niguiri (4 peças)',         8, true),
  ('sashimis',   'Sashimis Tradicionais',     9, true),
  ('temakis',    'Temakis (1 unidade)',      10, true),
  ('porcoes',    'Porções',                  11, true),
  ('sobremesas', 'Sobremesas',               12, true),
  ('bebidas',    'Bebidas, Água e Refrigerantes', 13, true)
on conflict (slug) do update
  set name = excluded.name, sort_order = excluded.sort_order, active = true;

-- -----------------------------------------------------------------------------
-- Produtos
--
-- `compare_at_price_cents` = o preço riscado do Anota Aí. O app só mostra o
-- risco quando ele é maior que o preço atual, então promoção que acabar é só
-- limpar esse campo.
--
-- `is_bestseller` marca o que está na prateleira "Destaques".
-- -----------------------------------------------------------------------------
with entrada (cat, nome, descricao, preco, de, destaque, porcao, ordem) as (values

  -- ---------------------------------------------------------------- Combinados
  ('combinados', 'Especial 42 Peças',
   'Delicioso combo com 4 sashimis de salmão, 10 hot filadélfia, 10 uramaki e mais.',
   8499, 10499, true, '42 peças', 1),
  ('combinados', 'Especial Carnaval',
   '10 hot filadélfia, 10 hossomaki de salmão, 5 uramaki de kani com geleia de pimenta, 5 uramaki de patê de salmão com Doritos.',
   7999, 8499, true, null, 2),
  ('combinados', 'Especial 35 Peças + Entrada de Sunomono',
   'Combinado com 5 batera flambado com crispy de couve, 5 uramaki skin com crispy de batata, 5 uramaki kani e mais, com entrada de sunomono.',
   5999, 7499, true, '35 peças', 3),
  ('combinados', 'Trio Hots Quentes',
   'Combo hot amado com entrada de sunomono.',
   4999, 5499, true, null, 4),
  ('combinados', 'Consumidor (44 Peças)',
   '10 uramaki filadélfia, 5 uramaki patê de salmão com Doritos, 10 hossomaki de salmão, 5 hossomaki de kani, 2 djow e 2 sashimis.',
   8074, 8499, true, '44 peças', 5),
  ('combinados', 'Combo Só Salmão (35 Peças)',
   '10 uramaki filadélfia, 10 hossomaki de salmão, 10 hot filadélfia e 5 niguiris de salmão.',
   6499, 6999, true, '35 peças', 6),
  ('combinados', 'Especial Love (48 Unidades + Entrada de Carpaccio)',
   '10 uramaki filadélfia, 5 uramaki patê com crispy de batata doce, 5 uramaki de kani com geleia de pimenta, 10 hossomaki de salmão e mais, com entrada de carpaccio.',
   10500, null, false, '48 peças', 7),
  ('combinados', 'Enamorado 60 Peças + 1 Ceviche + 1 Sunomono',
   '1 sunomono simples 200g, 1 ceviche 200g, 2 sashimi salmão, 3 niguiris, 10 uramaki salmão do chef, 5 especial maracujá e mais.',
   12499, null, false, '60 peças', 8),
  ('combinados', 'Especial Enamorados 56 Peças',
   '10 uramaki filadélfia, 5 uramaki patê de salmão com sweet chilli, 10 hossomaki de salmão, 5 uramaki califórnia, 4 batera e mais.',
   9499, null, false, '56 peças', 9),
  ('combinados', 'Enamorado 45 Peças + 1 Ceviche + 1 Sunomono',
   '1 sunomono simples 120g, 1 ceviche 120g, 5 uramaki salmão do chef, 5 especial maracujá, 5 especial Doritos e mais.',
   8999, null, false, '45 peças', 10),
  ('combinados', 'Combo Low Carb',
   '4 sashimi de salmão, 4 yokohama djow, 4 suzuka djow e 120g de ceviche.',
   8699, null, false, null, 11),
  ('combinados', 'Especial 40 Peças',
   'Combo com 10 hot filadélfia, 5 uramaki skin, 5 uramaki patê de salmão, 5 uramaki filadélfia, 5 uramaki fugi e mais.',
   5999, null, false, '40 peças', 12),
  ('combinados', 'Especial Combo Kids',
   '5 hot filadélfia, 1 niguiri de salmão, 1 sashimi de salmão e 5 uramaki filadélfia.',
   2999, null, false, null, 13),

  -- ------------------------------------------------------------------ Entradas
  ('entradas', 'Sunomono Simples',
   'Salada de pepino com tempero agridoce e gergelim.', 2000, null, false, null, 1),
  ('entradas', 'Sunomono com Salmão',
   'Salada de pepino, salmão, tempero agridoce e gergelim.', 2899, null, false, null, 2),
  ('entradas', 'Carpaccio de Salmão',
   '20 lâminas de salmão, cebolinha, temperados com flor de sal, shoyu e limão, finalizado com azeite de oliva.',
   5499, null, false, '20 lâminas', 3),
  ('entradas', 'Ceviche de Salmão',
   'Salmão marinado ao molho cítrico, apimentado e finalizado com azeite de oliva.',
   4799, null, false, null, 4),

  -- ----------------------------------------------------------- Hot (10 peças)
  ('hot', 'Hot Filadélfia com Crispy',
   'Salmão, gergelim, molho tarê, empanado na farinha panko, frito com crispy de couve crocante.',
   2799, null, false, '10 peças', 1),
  ('hot', 'Hot Filadélfia Djow',
   'Salmão coberto com patê de filadélfia, cream cheese, cebolinha e molho tarê, empanado na farinha panko e frito.',
   3499, null, false, '10 peças', 2),

  -- ------------------------------------------------------- Uramaki (10 peças)
  ('uramaki', 'Uramaki Salmão Grelhado',
   'Salmão grelhado, gergelim e cream cheese.', 2599, null, false, '10 peças', 1),
  ('uramaki', 'Uramaki Salmão Skin',
   'Skin, salmão, cream cheese, gergelim e molho tarê.', 2499, null, false, '10 peças', 2),
  ('uramaki', 'Uramaki Salmão com Manga',
   'Salmão, manga e cream cheese.', 2499, null, false, '10 peças', 3),
  ('uramaki', 'Uramaki Kani Kama',
   'Kani, gergelim e cream cheese.', 2499, null, false, '10 peças', 4),
  ('uramaki', 'Uramaki Vegetariano',
   'Tomate seco, rúcula e cream cheese.', 2499, null, false, '10 peças', 5),

  -- ---------------------------------------------- Sushis Especiais (10 peças)
  ('especiais', 'Shake Ura',
   'Salmão e cream cheese envoltos por uma fatia fina de salmão, com batido de filadélfia selado, cebolinha e fatia de limão siciliano.',
   4400, null, false, '10 peças', 1),
  ('especiais', 'Especial Sweet Chilli',
   'Recheio de kani kama e cream cheese, cobertura de filadélfia e sweet chilli.',
   3999, null, false, '10 peças', 2),
  ('especiais', 'Uramaki Doritos',
   'Recheio de salmão grelhado, coberto com batido de filadélfia e Doritos.',
   3999, null, false, '10 peças', 3),

  -- ---------------------------------------------- Djow Especiais (4 peças)
  ('djow', 'Maracujá Djow',
   'Salmão selado, cream cheese, finalizado com molho de maracujá.', 2999, null, false, '4 peças', 1),
  ('djow', 'Suzuka Djow',
   'Salmão, camarão flambado, cream cheese e cebolinha.', 2999, null, false, '4 peças', 2),
  ('djow', 'Yokohama Djow',
   'Salmão, cream cheese, cebolinha e gergelim.', 2999, null, false, '4 peças', 3),
  ('djow', 'Salmão Sweet Djow',
   'Salmão selado, cream cheese e geleia de pimenta adocicada.', 2999, null, false, '4 peças', 4),

  -- ------------------------------------------------------ Hossomaki (8 peças)
  ('hossomaki', 'Shake Maki', 'Hossomaki de salmão.',  2499, null, false, '8 peças', 1),
  ('hossomaki', 'Ebi Maki Camarão', 'Hossomaki de camarão.', 2899, null, false, '8 peças', 2),
  ('hossomaki', 'Kani Maki', 'Hossomaki de kani.',      2200, null, false, '8 peças', 3),
  ('hossomaki', 'Kapa Maki', 'Hossomaki de pepino.',    1999, null, false, '8 peças', 4),

  -- -------------------------------------------------------- Niguiri (4 peças)
  ('niguiri', 'Niguiri Salmão',
   'Bolinho de arroz e salmão.', 2499, null, false, '4 peças', 1),
  ('niguiri', 'Niguiri de Salmão Spicy',
   'Salmão selado, gergelim, finalizado com geleia de pimenta adocicada.',
   2899, null, false, '4 peças', 2),

  -- ------------------------------------------------------------------ Sashimis
  ('sashimis', 'Sashimi Salmão (4 Unidades)',
   'Fatias de salmão fresco.', 2899, null, false, '4 unidades', 1),

  -- ------------------------------------------------------ Temakis (1 unidade)
  ('temakis', 'Big Roll Recheado',
   'Salmão, cream cheese, cebolinha e molho geleia de pimenta sweet chilli.',
   4599, null, false, null, 1),
  ('temakis', 'Temaki Filadélfia sem Arroz',
   'Salmão, cream cheese, cebolinha e gergelim.', 3999, null, false, null, 2),
  ('temakis', 'Temaki Filadélfia',
   'Salmão, cream cheese, cebolinha e gergelim.', 3899, null, false, null, 3),
  ('temakis', 'Temaki Hot Filadélfia',
   'Salmão, cebolinha, gergelim e molho tarê, empanado na farinha panko e frito.',
   3899, null, false, null, 4),
  ('temakis', 'Temaki Doritos',
   'Salmão, cream cheese, Doritos e gergelim.', 3899, null, false, null, 5),
  ('temakis', 'Temaki Spice',
   'Salmão cru, cream cheese, finalizado com geleia de pimenta adocicada.',
   3899, null, false, null, 6),
  ('temakis', 'Temaki Vegetariano',
   'Tomate seco, rúcula e gergelim.', 2899, null, false, null, 7),

  -- ------------------------------------------------------------------ Porções
  ('porcoes', 'Bolinho de Salmão',
   '10 bolinhos de salmão, acompanha molho agridoce de sweet chilli.',
   3899, null, false, '10 unidades', 1),

  -- --------------------------------------------------------------- Sobremesas
  ('sobremesas', 'Hot Banana com Nutella',
   'Banana, canela e Nutella.', 2400, null, false, '10 unidades', 1),

  -- ------------------------------------------------------------------ Bebidas
  ('bebidas', 'Coca-Cola Lata',      'Lata 350 ml.',       600, null, true,  null, 1),
  ('bebidas', 'Coca-Cola Zero Lata', 'Lata 350 ml.',       600, null, false, null, 2),
  ('bebidas', 'Guaraná Lata',        'Lata 350 ml.',       600, null, false, null, 3),
  ('bebidas', 'Coca-Cola 2 L',       'Garrafa 2 litros.', 1900, null, false, null, 4),
  ('bebidas', 'Água sem Gás',        'Garrafa 500 ml.',    500, null, false, null, 5),
  ('bebidas', 'Água com Gás',        'Garrafa 500 ml.',    500, null, false, null, 6)
)
insert into products (
  category_id, name, description, price_cents, compare_at_price_cents,
  is_bestseller, serves, sort_order, active
)
select c.id, e.nome, e.descricao, e.preco, e.de, e.destaque, e.porcao, e.ordem, true
from entrada e
join categories c on c.slug = e.cat;

commit;

-- Conferência
select c.name as categoria, count(p.id) as itens,
       min(p.price_cents) as menor, max(p.price_cents) as maior
from categories c
left join products p on p.category_id = c.id
group by c.name, c.sort_order
order by c.sort_order;
