-- =============================================================================
-- Notificações: separar o que é do pedido do que é propaganda
--
-- A base já avisava sobre o pedido (0011). Falta o outro lado: oferta nova,
-- cupom, roleta liberada — o que traz a pessoa de volta.
--
-- E falta uma distinção que hoje não existe e que importa:
--
--   TRANSACIONAL — "seu pedido saiu para entrega". A pessoa PEDIU isso ao
--                  fazer o pedido. Vai para quem tem o app, sempre.
--   MARKETING    — "hot roll com 20% hoje". Só para quem aceitou receber.
--
-- Sem essa separação, o aviso de promoção ia para todo mundo com o app
-- instalado, inclusive quem desligou "avisos de ofertas" no perfil. O
-- interruptor existia e não fazia nada — e mandar propaganda para quem disse
-- não é o jeito mais rápido de a pessoa desinstalar o app.
-- =============================================================================

do $$ begin
  create type notification_kind as enum ('transacional', 'marketing');
exception when duplicate_object then null;
end $$;

alter table notifications
  add column if not exists kind notification_kind not null default 'transacional';

comment on column notifications.kind is
  'marketing só é entregue a quem tem marketing_opt_in. Conferido em send-push.';

-- ---------------------------------------------------------------------------
-- Biblioteca de mensagens prontas
--
-- Existe para o restaurante não ter que inventar texto toda vez. Escrever uma
-- boa notificação é trabalho, e o resultado de escrever com pressa é o aviso
-- genérico que ninguém abre — ou pior, que faz desinstalar.
--
-- As mensagens aceitam marcadores simples ({nome}, {cupom}, {desconto}) que o
-- painel troca na hora do envio.
-- ---------------------------------------------------------------------------
create table if not exists notification_templates (
  id          uuid primary key default gen_random_uuid(),
  categoria   text not null,
  titulo      text not null,
  corpo       text not null,
  link        text,
  kind        notification_kind not null default 'marketing',
  -- Melhor hora para este tipo de aviso. É dica para o painel, não regra.
  dica_horario text,
  ativo       boolean not null default true,
  sort_order  smallint not null default 0
);

alter table notification_templates enable row level security;

create policy templates_staff on notification_templates
  for all to authenticated using (is_staff()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- A biblioteca
--
-- Escritas para delivery de sushi, não genéricas. Cada uma tem um motivo de
-- existir e uma hora de ser usada.
-- ---------------------------------------------------------------------------
insert into notification_templates (categoria, titulo, corpo, link, kind, dica_horario, sort_order) values

-- ── Abertura e rotina ──────────────────────────────────────────────────────
('Abertura', 'Abrimos agora 🍣', 'A cozinha está pronta. Peça e receba quentinho em casa.', '/cardapio', 'marketing', '18:30, quando a loja abre', 1),
('Abertura', 'Sexta é dia de sushi', 'A semana acabou. Comemora com um combinado?', '/cardapio', 'marketing', 'Sexta, 18:00', 2),
('Abertura', 'Domingo pede sushi', 'Sem vontade de cozinhar? A gente resolve em 45 minutos.', '/cardapio', 'marketing', 'Domingo, 18:00', 3),

-- ── Ofertas ────────────────────────────────────────────────────────────────
('Ofertas', 'Oferta de hoje 🔥', '{oferta} com preço especial, só hoje. Enquanto durar.', '/ofertas', 'marketing', 'Início do expediente', 10),
('Ofertas', 'Últimas horas da oferta', 'A promoção de hoje acaba quando fecharmos. Não deixa passar.', '/ofertas', 'marketing', '2h antes de fechar', 11),
('Ofertas', 'Terça mais barata', 'Dia de menor movimento, preço melhor. Aproveita que a cozinha está livre.', '/ofertas', 'marketing', 'Terça, 18:30', 12),
('Ofertas', 'Combinado novo no cardápio', '{produto} entrou hoje. Vem conferir antes de todo mundo.', '/cardapio', 'marketing', 'Qualquer hora do expediente', 13),

-- ── Cupom ──────────────────────────────────────────────────────────────────
('Cupom', 'Cupom novo para você 🎟️', 'Use {cupom} e ganhe {desconto} no próximo pedido.', '/ofertas', 'marketing', 'Início do expediente', 20),
('Cupom', 'Seu cupom vence hoje', 'O desconto que você ganhou expira quando fecharmos. Vale usar.', '/ofertas', 'marketing', '3h antes de fechar', 21),
('Cupom', 'Frete grátis hoje', 'Acima de {valor}, a entrega é por nossa conta.', '/cardapio', 'marketing', 'Início do expediente', 22),

-- ── Roleta ─────────────────────────────────────────────────────────────────
('Roleta', 'Sua roleta liberou 🎡', 'Você tem um giro disponível. Pode sair desconto.', '/ofertas#roleta', 'marketing', 'Manhã, antes de decidir o jantar', 30),
('Roleta', 'Ainda não girou hoje', 'Um giro por dia, e o seu está esperando.', '/ofertas#roleta', 'marketing', '19:00', 31),

-- ── Fidelidade ─────────────────────────────────────────────────────────────
('Fidelidade', 'Falta pouco para o prêmio', 'Você está a {faltam} de completar a cartela.', '/fidelidade', 'marketing', 'Depois de um pedido entregue', 40),
('Fidelidade', 'Você tem crédito esperando', 'Tem {valor} de crédito na sua conta. Ele expira, então vale usar.', '/fidelidade', 'marketing', 'Uma semana antes de expirar', 41),
('Fidelidade', 'Seus pontos vão expirar', 'Você juntou {pontos} pontos. Resgate antes que percam a validade.', '/fidelidade', 'marketing', 'Uma semana antes de expirar', 42),

-- ── Reengajamento ──────────────────────────────────────────────────────────
('Cliente sumido', 'Saudade de você 🍣', 'Faz um tempo que você não pede. Preparamos {desconto} para a volta.', '/ofertas', 'marketing', 'Início da noite', 50),
('Cliente sumido', 'Tem novidade no cardápio', 'Entraram pratos novos desde a sua última visita. Dá uma olhada.', '/cardapio', 'marketing', 'Início da noite', 51),
('Cliente sumido', 'Seu combinado favorito', 'O {produto} que você pediu da última vez continua aqui.', '/cardapio', 'marketing', '19:00', 52),

-- ── Data especial ──────────────────────────────────────────────────────────
('Datas', 'Feliz aniversário! 🎂', 'Hoje é seu dia. Use {cupom} e comemore com sushi.', '/ofertas', 'marketing', 'Manhã do aniversário', 60),
('Datas', 'Dia dos Namorados', 'Combinado para dois, entregue em casa. Sem fila, sem reserva.', '/cardapio', 'marketing', 'Uma semana antes', 61),
('Datas', 'Véspera de feriado', 'Amanhã não tem trabalho. Hoje pode ter sushi.', '/cardapio', 'marketing', '18:00 da véspera', 62),

-- ── Carrinho ───────────────────────────────────────────────────────────────
('Carrinho', 'Seu carrinho está esperando', 'Você montou um pedido e não finalizou. Ele continua salvo.', '/carrinho', 'marketing', '1h depois de abandonar', 70),

-- ── Operação ───────────────────────────────────────────────────────────────
('Operação', 'Hoje não abriremos', 'Estamos fechados hoje. Amanhã a cozinha volta ao normal.', '/', 'transacional', 'Manhã do dia fechado', 80),
('Operação', 'Voltamos a funcionar', 'Depois da pausa, estamos abertos de novo. Sentimos sua falta.', '/cardapio', 'transacional', 'Na reabertura', 81),
('Operação', 'Entrega mais demorada hoje', 'Movimento alto agora. O tempo de entrega pode passar de {tempo}.', '/', 'transacional', 'Durante o pico', 82)

on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Disparo de campanha pelo painel
--
-- UMA linha de notificação para toda a base, e não uma por cliente. A
-- diferença não é estética: cada linha inserida dispara o gatilho de push, que
-- faz uma chamada HTTP. Mil clientes seriam mil chamadas — e a função de push
-- já sabe abrir uma notificação de broadcast para todos os aparelhos.
-- ---------------------------------------------------------------------------
create or replace function enviar_campanha(
  p_titulo text,
  p_corpo  text,
  p_link   text default '/ofertas',
  p_kind   notification_kind default 'marketing'
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not is_admin() then
    raise exception 'Apenas administradores.' using errcode = '42501';
  end if;

  if coalesce(trim(p_titulo), '') = '' or coalesce(trim(p_corpo), '') = '' then
    raise exception 'Título e mensagem são obrigatórios.' using errcode = 'P0001';
  end if;

  insert into notifications (customer_id, audience, kind, title, body, data)
  values (null, 'cliente', p_kind, trim(p_titulo), trim(p_corpo),
          jsonb_build_object('link', coalesce(p_link, '/')))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function enviar_campanha(text, text, text, notification_kind) from public, anon;
grant execute on function enviar_campanha(text, text, text, notification_kind) to authenticated;

-- ---------------------------------------------------------------------------
-- Aviso automático quando entra oferta nova
--
-- O restaurante cadastra a promoção e a base fica sabendo, sem ninguém
-- precisar lembrar de avisar. É o passo que costuma ser esquecido — a
-- promoção existe no app e ninguém abre o app para descobrir.
-- ---------------------------------------------------------------------------
create or replace function avisar_oferta_nova()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Só oferta que nasce ativa e já valendo. Cadastrar uma promoção de sexta na
  -- terça não pode disparar o aviso na terça.
  if not new.active then return new; end if;
  if new.starts_at is not null and new.starts_at > now() then return new; end if;

  insert into notifications (customer_id, audience, kind, title, body, data)
  values (
    null, 'cliente', 'marketing',
    'Oferta nova no Sushi Art 🔥',
    coalesce(new.title, 'Tem promoção nova no cardápio') || ' — confira antes que acabe.',
    jsonb_build_object('link', '/ofertas', 'offer_id', new.id)
  );

  return new;
end;
$$;

drop trigger if exists offers_avisa_clientes on offers;
create trigger offers_avisa_clientes
  after insert on offers
  for each row execute function avisar_oferta_nova();

-- ---------------------------------------------------------------------------
-- Aviso automático quando entra cupom público
--
-- Só cupom PÚBLICO: cupom pessoal (prêmio de roleta, de cartela) já tem o
-- próprio aviso, e anunciar para a base um código que só uma pessoa pode usar
-- gera frustração em todo o resto.
-- ---------------------------------------------------------------------------
create or replace function avisar_cupom_novo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_desconto text;
begin
  if not new.active or not new.is_public or new.customer_id is not null then
    return new;
  end if;

  v_desconto := case new.discount_kind
    when 'percentual'   then new.discount_percent::text || '% de desconto'
    when 'fixo'         then 'R$ ' || to_char(new.discount_cents / 100.0, 'FM999990D00') || ' de desconto'
    when 'frete_gratis' then 'frete grátis'
    else 'um brinde'
  end;

  insert into notifications (customer_id, audience, kind, title, body, data)
  values (
    null, 'cliente', 'marketing',
    'Cupom novo liberado 🎟️',
    'Use ' || new.code || ' e ganhe ' || v_desconto ||
      case when new.min_order_cents > 0
        then ' em pedidos acima de R$ ' || to_char(new.min_order_cents / 100.0, 'FM999990D00') || '.'
        else '.' end,
    jsonb_build_object('link', '/ofertas', 'coupon_id', new.id)
  );

  return new;
end;
$$;

drop trigger if exists coupons_avisa_clientes on coupons;
create trigger coupons_avisa_clientes
  after insert on coupons
  for each row execute function avisar_cupom_novo();
