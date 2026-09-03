-- =============================================================================
-- As funções que fazem a fidelização acontecer.
--
-- Todas SECURITY DEFINER e todas disparando a partir de PEDIDO ENTREGUE, nunca
-- de pedido criado: premiar na criação é premiar o pedido que vai ser
-- cancelado daqui a dez minutos, e o crédito já teria saído.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Cartela de carimbos
-- ---------------------------------------------------------------------------

/**
 * Quantos carimbos o cliente tem na cartela aberta.
 *
 * Conta pedidos entregues depois do fechamento da última cartela. Contar
 * "todos os pedidos módulo N" pareceria mais simples e estaria errado: quando
 * a regra mudasse de 10 para 8 carimbos, o histórico inteiro se recontaria e
 * clientes ganhariam ou perderiam prêmio retroativamente.
 */
create or replace function stamp_count(p_customer uuid default auth.uid())
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer
  from orders o
  cross join loyalty_config c
  where o.customer_id = p_customer
    and o.status = 'entregue'
    and o.total_cents >= c.stamp_min_cents
    and o.created_at > coalesce(
      (select max(closed_at) from loyalty_stamp_cards where customer_id = p_customer),
      '-infinity'::timestamptz
    );
$$;

/**
 * Fecha a cartela e entrega o prêmio, se houver carimbos suficientes.
 *
 * Chamada pelo gatilho de pedido entregue. Devolve o cupom criado, ou nulo
 * quando a cartela ainda não fechou.
 */
create or replace function fechar_cartela(p_customer uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cfg       loyalty_config;
  cupom_id  uuid;
  codigo    text;
begin
  select * into cfg from loyalty_config where id = 1;
  if not found or not cfg.stamp_active then return null; end if;

  if stamp_count(p_customer) < cfg.stamps_needed then return null; end if;

  -- Código pessoal e legível, para o cliente conseguir ditar no telefone.
  codigo := 'CARTELA' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));

  insert into coupons (
    code, description, discount_kind, discount_percent, discount_cents,
    min_order_cents, valid_until, usage_limit, usage_limit_per_customer,
    customer_id, source, is_public
  ) values (
    codigo,
    'Cartela completa — ' || cfg.stamps_needed || ' pedidos',
    cfg.stamp_reward_kind,
    cfg.stamp_reward_percent,
    cfg.stamp_reward_cents,
    cfg.stamp_min_cents,
    -- Prazo de 60 dias: prêmio sem prazo vira prêmio esquecido, e o objetivo
    -- do carimbo é trazer a pessoa de volta, não emitir um vale eterno.
    now() + interval '60 days',
    1, 1,
    p_customer, 'fidelidade', false
  )
  returning id into cupom_id;

  insert into loyalty_stamp_cards (customer_id, coupon_id) values (p_customer, cupom_id);

  insert into notifications (customer_id, title, body, data)
  values (
    p_customer,
    'Cartela completa! 🎉',
    'Você juntou ' || cfg.stamps_needed || ' carimbos. Seu prêmio já está em Ofertas.',
    jsonb_build_object('link', '/ofertas')
  );

  return cupom_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cashback
-- ---------------------------------------------------------------------------

/** Credita a porcentagem configurada sobre um pedido entregue. */
create or replace function creditar_cashback(p_order uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  cfg    loyalty_config;
  pedido orders;
  valor  integer;
begin
  select * into cfg from loyalty_config where id = 1;
  if not found or cfg.cashback_percent <= 0 then return; end if;

  select * into pedido from orders where id = p_order;
  if not found or pedido.customer_id is null then return; end if;

  -- Sobre o subtotal, não sobre o total: devolver percentual da taxa de
  -- entrega é o restaurante pagando cashback do dinheiro do entregador.
  valor := floor(pedido.subtotal_cents * cfg.cashback_percent / 100.0)::integer;
  if valor <= 0 then return; end if;

  insert into customer_credits (customer_id, cents, reason, order_id, expires_at)
  values (
    pedido.customer_id,
    valor,
    'Cashback do pedido ' || pedido.code,
    pedido.id,
    case when cfg.cashback_expire_days is not null
      then now() + (cfg.cashback_expire_days || ' days')::interval
    end
  );

  insert into notifications (customer_id, title, body, data)
  values (
    pedido.customer_id,
    'Você ganhou crédito',
    'R$ ' || to_char(valor / 100.0, 'FM999990.00') || ' de volta do pedido ' || pedido.code || '.',
    jsonb_build_object('link', '/perfil')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Indicação
-- ---------------------------------------------------------------------------

/**
 * Registra que este cliente veio pela indicação de alguém.
 *
 * Chamada no cadastro, com o código que a pessoa digitou. Não paga nada ainda:
 * o prêmio só sai quando o primeiro pedido for entregue.
 */
create or replace function usar_codigo_indicacao(p_codigo text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  quem_indicou uuid;
begin
  if p_codigo is null or length(trim(p_codigo)) = 0 then return false; end if;

  select id into quem_indicou
  from customers
  where referral_code = upper(trim(p_codigo));

  -- Sem indicador, indicando a si mesmo, ou já indicado antes: não é erro que
  -- valha interromper um cadastro, então devolve falso e segue.
  if quem_indicou is null or quem_indicou = auth.uid() then return false; end if;
  if exists (select 1 from referrals where referred_id = auth.uid()) then return false; end if;

  -- Quem já pediu não pode "ser indicado" retroativamente.
  if exists (
    select 1 from orders
    where customer_id = auth.uid() and status <> 'cancelado'
  ) then
    return false;
  end if;

  insert into referrals (referrer_id, referred_id) values (quem_indicou, auth.uid());
  return true;
end;
$$;

grant execute on function usar_codigo_indicacao(text) to authenticated;

/** Paga os dois lados quando o primeiro pedido do indicado é entregue. */
create or replace function qualificar_indicacao(p_order uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  cfg    loyalty_config;
  pedido orders;
  ind    referrals;
begin
  select * into cfg from loyalty_config where id = 1;
  if not found or not cfg.referral_active then return; end if;

  select * into pedido from orders where id = p_order;
  if not found or pedido.customer_id is null then return; end if;

  select * into ind
  from referrals
  where referred_id = pedido.customer_id and qualified_at is null;
  if not found then return; end if;

  update referrals
  set qualified_at = now(), order_id = pedido.id
  where id = ind.id;

  if cfg.referral_referrer_cents > 0 then
    insert into customer_credits (customer_id, cents, reason)
    values (ind.referrer_id, cfg.referral_referrer_cents, 'Indicação premiada');

    insert into notifications (customer_id, title, body, data)
    values (
      ind.referrer_id,
      'Sua indicação rendeu 🎁',
      'Quem você indicou fez o primeiro pedido. O crédito já está na sua conta.',
      jsonb_build_object('link', '/perfil')
    );
  end if;

  if cfg.referral_referred_cents > 0 then
    insert into customer_credits (customer_id, cents, reason)
    values (ind.referred_id, cfg.referral_referred_cents, 'Bônus de boas-vindas');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- O gatilho que amarra tudo
-- ---------------------------------------------------------------------------

/**
 * Pedido entregue dispara os três programas.
 *
 * Num gatilho só, e não em três, porque a ordem importa: a indicação qualifica
 * antes da cartela fechar, senão o pedido que dispara os dois entra na cartela
 * já com a cartela fechada por outro caminho e o carimbo se perde.
 *
 * Cada bloco tem o próprio EXCEPTION: falha em premiação nunca pode derrubar a
 * entrega do pedido. Um cashback que não caiu é um problema; um pedido que não
 * consegue ser marcado como entregue trava a cozinha.
 */
create or replace function premiar_pedido_entregue()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'entregue' and coalesce(old.status, '') <> 'entregue'
     and new.customer_id is not null then

    begin
      perform qualificar_indicacao(new.id);
    exception when others then
      raise warning 'indicação do pedido %: %', new.code, sqlerrm;
    end;

    begin
      perform creditar_cashback(new.id);
    exception when others then
      raise warning 'cashback do pedido %: %', new.code, sqlerrm;
    end;

    begin
      perform fechar_cartela(new.customer_id);
    exception when others then
      raise warning 'cartela do pedido %: %', new.code, sqlerrm;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_premiar_entregue on orders;
create trigger orders_premiar_entregue
  after update of status on orders
  for each row execute function premiar_pedido_entregue();

-- ---------------------------------------------------------------------------
-- Cliente sumido
--
-- Devolve quem não pede há N dias e ainda não foi lembrado neste ciclo. O
-- painel chama e dispara a campanha; deixar isso automático mandaria a mesma
-- mensagem toda madrugada para o mesmo cliente.
-- ---------------------------------------------------------------------------
create or replace function clientes_sumidos(p_dias integer default 30)
returns table (customer_id uuid, nome text, ultimo_pedido timestamptz, total_gasto integer)
language sql stable security definer set search_path = public as $$
  select
    c.id,
    c.name,
    max(o.created_at),
    coalesce(sum(o.total_cents), 0)::integer
  from customers c
  join orders o on o.customer_id = c.id and o.status = 'entregue'
  where c.marketing_opt_in
  group by c.id, c.name
  having max(o.created_at) < now() - (p_dias || ' days')::interval
  order by coalesce(sum(o.total_cents), 0) desc;
$$;

revoke all on function clientes_sumidos(integer) from public;
grant execute on function clientes_sumidos(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Aniversariantes do mês
--
-- `birthdate` já existia na tabela de clientes desde o começo — o que faltava
-- era alguém perguntar por ela.
-- ---------------------------------------------------------------------------
create or replace function aniversariantes(p_mes integer default null)
returns table (customer_id uuid, nome text, dia integer)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, extract(day from c.birthdate)::integer
  from customers c
  where c.birthdate is not null
    and c.marketing_opt_in
    and extract(month from c.birthdate) = coalesce(p_mes, extract(month from now()))
  order by extract(day from c.birthdate);
$$;

revoke all on function aniversariantes(integer) from public;
grant execute on function aniversariantes(integer) to authenticated;

grant execute on function stamp_count(uuid), credit_balance(uuid), customer_tier(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Trava de "primeiro pedido" no cupom
--
-- Recria `validate_coupon` acrescentando uma conferência. Fica aqui, no
-- servidor, junto do resto das travas do cupom: "só para quem nunca pediu"
-- conferido no app é só uma sugestão — quem abrir o console do navegador
-- passa por cima.
-- ---------------------------------------------------------------------------
create or replace function validate_coupon(
  p_code text,
  p_subtotal_cents integer,
  p_delivery_fee_cents integer default 0
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_c        coupons%rowtype;
  v_uses     integer;
  v_discount integer := 0;
  v_free_ship boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object('valid', false, 'reason', 'Faça login para usar cupons.');
  end if;

  select * into v_c from coupons
  where upper(code) = upper(trim(p_code)) and active
  limit 1;

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'Cupom não encontrado.');
  end if;

  if v_c.customer_id is not null and v_c.customer_id <> auth.uid() then
    return jsonb_build_object('valid', false, 'reason', 'Este cupom não é seu.');
  end if;

  if v_c.valid_from > now() then
    return jsonb_build_object('valid', false, 'reason', 'Este cupom ainda não começou a valer.');
  end if;

  if v_c.valid_until is not null and v_c.valid_until < now() then
    return jsonb_build_object('valid', false, 'reason', 'Este cupom expirou.');
  end if;

  -- A trava nova. Conta qualquer pedido que não tenha sido cancelado, e não só
  -- os entregues: senão bastava fazer dez pedidos e não confirmar nenhum para
  -- continuar sendo "cliente novo" para sempre.
  if v_c.first_order_only and exists (
    select 1 from orders
    where customer_id = auth.uid() and status <> 'cancelado'
  ) then
    return jsonb_build_object(
      'valid', false,
      'reason', 'Este cupom é só para o primeiro pedido.'
    );
  end if;

  if p_subtotal_cents < v_c.min_order_cents then
    return jsonb_build_object(
      'valid', false,
      'reason', format('Pedido mínimo de R$ %s para este cupom.',
                       to_char(v_c.min_order_cents / 100.0, 'FM999G990D00')),
      'min_order_cents', v_c.min_order_cents
    );
  end if;

  if v_c.usage_limit is not null and v_c.used_count >= v_c.usage_limit then
    return jsonb_build_object('valid', false, 'reason', 'Este cupom esgotou.');
  end if;

  select count(*) into v_uses from coupon_redemptions
  where coupon_id = v_c.id and customer_id = auth.uid();

  if v_uses >= v_c.usage_limit_per_customer then
    return jsonb_build_object('valid', false, 'reason', 'Você já usou este cupom.');
  end if;

  case v_c.discount_kind
    when 'percentual' then
      v_discount := floor(p_subtotal_cents * v_c.discount_percent / 100.0)::integer;
      if v_c.max_discount_cents is not null then
        v_discount := least(v_discount, v_c.max_discount_cents);
      end if;
    when 'fixo' then
      v_discount := least(v_c.discount_cents, p_subtotal_cents);
    when 'frete_gratis' then
      v_discount := p_delivery_fee_cents;
      v_free_ship := true;
    when 'brinde' then
      v_discount := 0;
  end case;

  return jsonb_build_object(
    'valid', true,
    'coupon_id', v_c.id,
    'code', v_c.code,
    'kind', v_c.discount_kind,
    'description', v_c.description,
    'discount_cents', v_discount,
    'free_shipping', v_free_ship
  );
end;
$$;
