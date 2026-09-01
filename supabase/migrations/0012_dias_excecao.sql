-- Dias de exceção: feriado, folga, evento, férias.
--
-- Até aqui o "está aberto?" olhava só o horário semanal: se existe faixa para
-- quarta-feira, toda quarta o app se dizia aberto. Não havia como marcar que
-- HOJE, especificamente, a casa não abre — e o cliente via "Abrimos hoje às
-- 18:30" num dia em que ninguém ia abrir.
--
-- Uma linha por data. Serve para os dois lados: fechar num dia que normalmente
-- abriria, e abrir num dia que normalmente estaria fechado (véspera de feriado,
-- Dia dos Namorados caindo numa segunda).

create table if not exists business_exceptions (
  date       date primary key,
  -- true  = fechado o dia todo, ignorando o horário semanal
  -- false = aberto neste dia, no horário abaixo (ou no semanal, se nulo)
  closed     boolean not null default true,
  opens_at   time,
  closes_at  time,
  -- Aparece para o cliente na tarja do topo: "Fechado hoje — feriado".
  reason     text,
  created_at timestamptz not null default now(),

  -- Abrir sem dizer a que horas não significa nada.
  constraint business_exceptions_horario_ck check (
    closed
    or (opens_at is not null and closes_at is not null and closes_at > opens_at)
  )
);

create index if not exists business_exceptions_date_idx on business_exceptions (date);

alter table business_exceptions enable row level security;

-- O cliente precisa ler para saber que hoje não abre; só a equipe escreve.
drop policy if exists business_exceptions_public_read on business_exceptions;
create policy business_exceptions_public_read on business_exceptions
  for select using (true);

drop policy if exists business_exceptions_staff_write on business_exceptions;
create policy business_exceptions_staff_write on business_exceptions
  for all to authenticated using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------------------
-- "Está aberto?" passa a consultar a exceção do dia primeiro.
-- ---------------------------------------------------------------------------
create or replace function is_restaurant_open()
returns boolean language sql stable set search_path = public as $$
  with agora as (
    select (now() at time zone 'America/Sao_Paulo') as ts
  ),
  hoje as (
    select e.* from business_exceptions e, agora a where e.date = a.ts::date
  )
  select
    (select accepting_orders from restaurant_settings where id = 1)
    and not exists (select 1 from hoje where closed)
    and (
      -- Exceção que ABRE manda no horário do dia e ignora a grade semanal.
      exists (
        select 1 from hoje h, agora a
        where not h.closed and a.ts::time between h.opens_at and h.closes_at
      )
      or (
        not exists (select 1 from hoje where not closed)
        and exists (
          select 1 from business_hours h, agora a
          where h.active
            and h.weekday = extract(dow from a.ts)::smallint
            and a.ts::time between h.opens_at and h.closes_at
        )
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- Motivo do fechamento, para a tarja do topo dizer algo melhor que "fechado".
-- Devolve null quando não há exceção hoje — aí vale a mensagem de horário.
-- ---------------------------------------------------------------------------
create or replace function closed_reason_today()
returns text language sql stable set search_path = public as $$
  select e.reason
  from business_exceptions e
  where e.date = (now() at time zone 'America/Sao_Paulo')::date
    and e.closed
  limit 1;
$$;

grant execute on function closed_reason_today() to anon, authenticated;
