-- Roleta: cores no tema claro e requisito visível no rótulo.
--
-- As cores dos gomos foram escolhidas para o fundo preto do tema original.
-- No tema claro o #1E1E1E do "não foi dessa vez" vira um buraco preto no meio
-- do bege, e os vinhos escuros brigam entre si. Aqui elas passam a alternar
-- dentro da família da marca, com contraste suficiente entre gomos vizinhos.
--
-- O mínimo de cada prêmio já existia em `min_order_cents` e continua o mesmo —
-- o que muda é que agora ele aparece na roleta, desenhado sob o rótulo.

update roulette_prizes set color = '#8B2635' where label = '5% OFF';
update roulette_prizes set color = '#B06A2C' where label = '10% OFF';
update roulette_prizes set color = '#611A1B' where label = 'Frete grátis';
update roulette_prizes set color = '#C9803F' where label = 'R$ 10 OFF';
update roulette_prizes set color = '#7A2020' where label = 'Hot roll grátis';
update roulette_prizes set color = '#A34450' where label = '15% OFF';
-- Cinza quente em vez de preto: o gomo perdedor deve ser discreto, não um vazio.
update roulette_prizes set color = '#8A7F76' where label = 'Não foi dessa vez';
