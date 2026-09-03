-- =============================================================================
-- Conexão OAuth com o Mercado Pago
--
-- O problema que isto resolve: hoje o token do Mercado Pago é o do
-- desenvolvedor, então todo pagamento de cartão e Pix cai na conta DELE. Com
-- OAuth, o dono do restaurante entra na conta dele, autoriza o aplicativo, e a
-- partir daí o dinheiro cai onde tem que cair. Ninguém digita senha nossa e
-- ninguém vê a senha de ninguém.
--
-- POSTURA DE SEGURANÇA
--
-- As duas tabelas aqui têm RLS LIGADA E NENHUMA POLICY. Isso não é esquecimento
-- — é o ponto. Sem policy, ninguém autenticado lê nada: nem cliente, nem staff,
-- nem admin. Só o `service_role`, que vive dentro das Edge Functions e nunca
-- chega ao navegador, enxerga essas linhas.
--
-- É diferente do resto do sistema, onde o admin lê tudo. Aqui o conteúdo é um
-- token que movimenta dinheiro de verdade: quem o tiver pode criar cobranças
-- e consultar pagamentos na conta do restaurante. Uma falha de leitura em
-- qualquer tela do painel não pode virar acesso ao caixa.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A conexão em si
--
-- Uma linha só (`id = 'default'`), porque é um restaurante. Se um dia virar
-- multi-loja, a chave passa a ser o id da loja e nada mais muda.
-- ---------------------------------------------------------------------------
create table if not exists mp_connection (
  id             text primary key default 'default' check (id = 'default'),
  access_token   text not null,
  refresh_token  text not null,
  public_key     text,
  -- Identificação da conta que autorizou, para o painel poder dizer "conectado
  -- como Fulano" em vez de só "conectado".
  mp_user_id     bigint,
  nickname       text,
  email          text,
  expires_at     timestamptz not null,
  connected_at   timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table mp_connection enable row level security;
-- Nenhuma policy, de propósito. Ver o cabeçalho.

-- ---------------------------------------------------------------------------
-- O `state` do OAuth
--
-- Serve para provar que o retorno do Mercado Pago corresponde a um pedido de
-- conexão que ESTE painel iniciou. Sem isso, alguém consegue fazer o admin
-- clicar num link que conecta a conta do atacante ao restaurante — e daí em
-- diante todo pagamento cai na conta do atacante.
--
-- No Auria isso vivia num cookie httpOnly. Aqui não dá: o retorno chega numa
-- Edge Function, que fica noutro domínio do painel, e o cookie não viajaria
-- junto. Então o state mora numa tabela, de uso único e com prazo.
-- ---------------------------------------------------------------------------
create table if not exists mp_oauth_states (
  state       text primary key,
  created_by  uuid references auth.users(id) on delete set null,
  used_at     timestamptz,
  -- Dez minutos: tempo de sobra para alguém logar no Mercado Pago e autorizar,
  -- e curto o suficiente para um state vazado não valer nada amanhã.
  expires_at  timestamptz not null default now() + interval '10 minutes'
);

alter table mp_oauth_states enable row level security;
-- Idem: nenhuma policy.

-- ---------------------------------------------------------------------------
-- O que o painel PODE ver
--
-- Só o suficiente para desenhar a tela: se está conectado, com qual conta, e
-- desde quando. Nenhum token sai daqui. A função é SECURITY DEFINER para poder
-- ler a tabela travada, e só responde a admin.
-- ---------------------------------------------------------------------------
create or replace function mp_connection_status()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  linha mp_connection;
begin
  if not is_admin() then
    raise exception 'Apenas administradores.' using errcode = '42501';
  end if;

  select * into linha from mp_connection where id = 'default';

  if not found then
    return jsonb_build_object('connected', false);
  end if;

  return jsonb_build_object(
    'connected', true,
    'mp_user_id', linha.mp_user_id,
    'nickname', linha.nickname,
    'email', linha.email,
    'connected_at', linha.connected_at,
    -- O prazo importa para o painel poder avisar antes de quebrar, em vez de
    -- o restaurante descobrir que expirou quando um cliente não consegue pagar.
    'expires_at', linha.expires_at,
    'expired', linha.expires_at < now()
  );
end;
$$;

revoke all on function mp_connection_status() from public, anon;
grant execute on function mp_connection_status() to authenticated;

-- ---------------------------------------------------------------------------
-- Desconectar
--
-- Volta a cobrança para o token de ambiente. Fica no banco, e não só na Edge
-- Function, porque desconectar é operação de painel e precisa da mesma trava
-- de admin que o resto.
-- ---------------------------------------------------------------------------
create or replace function mp_disconnect()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Apenas administradores.' using errcode = '42501';
  end if;

  delete from mp_connection where id = 'default';
end;
$$;

revoke all on function mp_disconnect() from public, anon;
grant execute on function mp_disconnect() to authenticated;

-- ---------------------------------------------------------------------------
-- Faxina dos states velhos
--
-- Chamada pela própria função de OAuth a cada conexão. Não precisa de agendador
-- para uma tabela que ganha uma linha por clique em "conectar".
-- ---------------------------------------------------------------------------
create or replace function mp_limpar_states()
returns void
language sql security definer set search_path = public as $$
  delete from mp_oauth_states where expires_at < now() - interval '1 day';
$$;
