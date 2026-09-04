-- =============================================================================
-- Registrar notificação quando o navegador já pertence a outra conta
--
-- O BUG
--
-- A inscrição de push é do NAVEGADOR, não da conta: o mesmo aparelho gera
-- sempre o mesmo `token`. O app gravava com `upsert` em (token, audience), e a
-- RLS de `push_tokens` só deixa mexer na própria linha
-- (`USING customer_id = auth.uid()`).
--
-- Resultado: quem entrasse com uma conta num navegador onde outra pessoa já
-- tinha ativado os avisos batia em
--
--   403 · new row violates row-level security policy (USING expression)
--
-- e o botão "Ativar" simplesmente não funcionava. Sem mensagem que ajudasse.
--
-- Acontece o tempo todo na vida real: família dividindo o celular, o dono
-- testando o app do cliente na mesma máquina do painel, alguém que trocou de
-- conta. Foi assim que apareceu aqui.
--
-- A DECISÃO
--
-- Um token pertence a UM dono, e o dono é quem ativou por último. Não é
-- possível "dividir" — o aparelho é um só, e mandar aviso do pedido de duas
-- contas para o mesmo aparelho confundiria as duas.
--
-- Por isso esta função roda como SECURITY DEFINER: ela precisa apagar a linha
-- de outra pessoa, coisa que a RLS (corretamente) impede o cliente de fazer
-- direto. O que ela NÃO faz é confiar no que veio do app — o dono gravado é
-- sempre `auth.uid()`, nunca um id recebido por parâmetro.
-- =============================================================================

create or replace function registrar_push(
  p_token    text,
  p_platform text default 'web',
  p_audience notification_audience default 'cliente'
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Faça login para ativar as notificações.' using errcode = '42501';
  end if;

  -- Só a equipe recebe aviso de operação. Sem esta trava, um cliente curioso
  -- chamaria a função com 'equipe' e passaria a receber "pedido novo" de todo
  -- mundo — inclusive endereço e telefone de outras pessoas.
  if p_audience = 'equipe' and not is_staff() then
    raise exception 'Apenas a equipe pode receber avisos da operação.' using errcode = '42501';
  end if;

  -- Toma o aparelho de quem estava antes. É a linha que a RLS não deixava o
  -- app apagar sozinho, e o motivo desta função existir.
  delete from push_tokens
  where token = p_token and audience = p_audience and customer_id <> v_user;

  insert into push_tokens (customer_id, token, platform, audience)
  values (v_user, p_token, coalesce(p_platform, 'web'), p_audience)
  on conflict (token, audience) do update
    set customer_id = excluded.customer_id,
        platform    = excluded.platform;
end;
$$;

revoke all on function registrar_push(text, text, notification_audience) from public, anon;
grant execute on function registrar_push(text, text, notification_audience) to authenticated;

-- ---------------------------------------------------------------------------
-- Desativar tem o mesmo problema ao contrário: o `delete` do app filtra por
-- token e audience, e a RLS exige que a linha seja da pessoa. Quando ela não
-- é, o delete não apaga nada e não avisa — a tela diz "desligado" e o aparelho
-- continua recebendo.
-- ---------------------------------------------------------------------------
create or replace function remover_push(
  p_token    text,
  p_audience notification_audience default 'cliente'
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;

  -- Sem filtrar por dono: quem está com o aparelho na mão manda nele. Se a
  -- linha for de outra conta, desligar aqui é justamente o que a pessoa quer.
  delete from push_tokens where token = p_token and audience = p_audience;
end;
$$;

revoke all on function remover_push(text, notification_audience) from public, anon;
grant execute on function remover_push(text, notification_audience) to authenticated;
