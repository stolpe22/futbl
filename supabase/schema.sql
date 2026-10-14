-- =====================================================================
-- Futebol da Missão — schema completo
-- Rode este arquivo inteiro no Supabase: Dashboard > SQL Editor > New query
-- É idempotente: pode rodar de novo sem quebrar nada.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('admin', 'organizador', 'jogador');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.rsvp_status as enum ('vou', 'talvez', 'nao_vou');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.game_status as enum ('marcado', 'cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.poll_kind as enum ('data', 'campo', 'livre');
exception when duplicate_object then null; end $$;
-- "Campo e horário": a pessoa escolhe 1 campo e depois os horários que pode
alter type public.poll_kind add value if not exists 'jogo';

-- ---------------------------------------------------------------------
-- Convites: só quem está aqui consegue criar conta
-- ---------------------------------------------------------------------
create table if not exists public.invites (
  email       text primary key check (email = lower(trim(email)) and email like '%_@_%._%'),
  role        public.app_role not null default 'jogador',
  name        text,
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- O dono do sistema
insert into public.invites (email, role, name)
values ('stolpe02@gmail.com', 'admin', 'Admin')
on conflict (email) do update set role = 'admin';

-- ---------------------------------------------------------------------
-- Perfis
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  name        text not null default '',
  phone       text,
  role        public.app_role not null default 'jogador',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Pessoas de teste: só o admin (e outras pessoas de teste) enxergam
alter table public.invites  add column if not exists is_test boolean not null default false;
alter table public.profiles add column if not exists is_test boolean not null default false;

-- ---------------------------------------------------------------------
-- Funções auxiliares (security definer para não cair em recursão de RLS)
-- ---------------------------------------------------------------------
create or replace function public.my_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active)
$$;

create or replace function public.is_organizer()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin', 'organizador'), false)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

-- De quem é a visão: o próprio usuário ou, no "Ver como" do admin, a pessoa simulada
-- (header x-ver-como). Só o admin pode usar, e só serve para ver MENOS, nunca mais.
create or replace function public.viewer_id()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare h text;
begin
  if public.is_admin() then
    h := current_setting('request.headers', true)::json->>'x-ver-como';
    if h ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return h::uuid;
    end if;
  end if;
  return auth.uid();
end $$;

-- Quem está vendo (de verdade ou simulado) é admin?
create or replace function public.viewer_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = public.viewer_id() and role = 'admin' and active)
$$;

-- Posso ver esta pessoa (e o que ela fez)? Pessoa de teste some para quem é de verdade.
-- Admin vê tudo; pessoas de teste se veem entre si.
create or replace function public.can_see_user(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is null
      or p_user = public.viewer_id()
      or public.viewer_is_admin()
      or coalesce((select is_test from public.profiles where id = public.viewer_id()), false)
      or not coalesce((select is_test from public.profiles where id = p_user), false)
$$;

-- Usado na tela de login para dar uma mensagem clara antes de tentar cadastrar
create or replace function public.is_email_invited(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.invites where email = lower(trim(p_email)))
$$;
grant execute on function public.is_email_invited(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Bloqueia cadastro de quem não foi convidado
-- ---------------------------------------------------------------------
create or replace function public.guard_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.invites where email = lower(new.email)) then
    raise exception 'EMAIL_NAO_CONVIDADO: % não está na lista de participantes', new.email;
  end if;
  return new;
end $$;

drop trigger if exists guard_signup on auth.users;
create trigger guard_signup before insert on auth.users
  for each row execute function public.guard_signup();

-- Cria o perfil com o papel definido no convite
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inv public.invites;
begin
  select * into inv from public.invites where email = lower(new.email);
  insert into public.profiles (id, email, name, role, is_test)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), inv.name, split_part(new.email, '@', 1)),
    coalesce(inv.role, 'jogador'),
    coalesce(inv.is_test, false)
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Só admin muda papel ou ativa/desativa alguém
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.active is distinct from old.active or new.is_test is distinct from old.is_test)
     and not public.is_admin() then
    raise exception 'Só o admin pode mudar o papel, desativar alguém ou marcar como teste';
  end if;
  if new.id = auth.uid() and new.role is distinct from old.role and old.role = 'admin' then
    raise exception 'Você não pode tirar seu próprio acesso de admin';
  end if;
  new.email := old.email;
  return new;
end $$;

drop trigger if exists guard_profile_update on public.profiles;
create trigger guard_profile_update before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------
-- Campos
-- ---------------------------------------------------------------------
create table if not exists public.fields (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(trim(name)) > 0),
  address         text,
  lat             double precision not null,
  lng             double precision not null,
  surface         text not null default 'society' check (surface in ('society', 'grama', 'futsal', 'areia', 'outro')),
  price_per_hour  numeric(10,2) check (price_per_hour is null or price_per_hour >= 0),
  price_notes     text,
  phone           text,
  website         text,
  instagram       text,
  other_social    text,
  maps_url        text,
  notes           text,
  created_by      uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- ID do lugar no Google (o único dado do Google que os termos deixam guardar). Usado para a foto.
alter table public.fields add column if not exists google_place_id text;

-- ---------------------------------------------------------------------
-- Jogos (agenda)
-- ---------------------------------------------------------------------
create table if not exists public.games (
  id            uuid primary key default gen_random_uuid(),
  title         text not null default 'Futebol' check (length(trim(title)) > 0),
  starts_at     timestamptz not null,
  duration_min  int not null default 60 check (duration_min between 15 and 600),
  field_id      uuid references public.fields(id) on delete set null,
  max_players   int check (max_players is null or max_players > 0),
  price_total   numeric(10,2) check (price_total is null or price_total >= 0),
  notes         text,
  status        public.game_status not null default 'marcado',
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);
create index if not exists games_starts_at_idx on public.games (starts_at);

create table if not exists public.rsvps (
  game_id     uuid not null references public.games(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  status      public.rsvp_status not null,
  updated_at  timestamptz not null default now(),
  primary key (game_id, user_id)
);

-- Ninguém confirma "Vou" em dois jogos com horários que se sobrepõem (campos diferentes,
-- mesmo horário). Jogos cancelados não contam. "Talvez" e "Não vou" ficam livres.
create or replace function public.guard_rsvp_overlap()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  g        record;
  conflict record;
begin
  if new.status <> 'vou' then return new; end if;
  select starts_at, duration_min, status into g from public.games where id = new.game_id;
  if g.status = 'cancelado' then return new; end if;
  select gm.starts_at, coalesce(f.name, gm.title) as place into conflict
  from public.rsvps r
  join public.games gm on gm.id = r.game_id
  left join public.fields f on f.id = gm.field_id
  where r.user_id = new.user_id and r.status = 'vou' and r.game_id <> new.game_id
    and gm.status <> 'cancelado'
    and gm.starts_at < g.starts_at + make_interval(mins => g.duration_min)
    and g.starts_at < gm.starts_at + make_interval(mins => gm.duration_min)
  order by gm.starts_at
  limit 1;
  if found then
    raise exception 'CONFLITO_HORARIO: %', conflict.place using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists guard_rsvp_overlap on public.rsvps;
create trigger guard_rsvp_overlap before insert or update on public.rsvps
  for each row execute function public.guard_rsvp_overlap();

-- ---------------------------------------------------------------------
-- Votações
-- ---------------------------------------------------------------------
create table if not exists public.polls (
  id           uuid primary key default gen_random_uuid(),
  question     text not null check (length(trim(question)) > 0),
  kind         public.poll_kind not null default 'livre',
  multiple     boolean not null default true,
  closes_at    timestamptz,
  closed       boolean not null default false,
  game_id      uuid references public.games(id) on delete set null,
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);

create table if not exists public.poll_options (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid not null references public.polls(id) on delete cascade,
  label      text not null check (length(trim(label)) > 0),
  starts_at  timestamptz,
  field_id   uuid references public.fields(id) on delete set null,
  position   int not null default 0
);
create index if not exists poll_options_poll_idx on public.poll_options (poll_id);
-- Pergunta extra no fim da votação ("Bora de churras depois?"). Nulo = pergunta principal.
-- Cada pergunta extra vale um voto por pessoa.
alter table public.poll_options add column if not exists question text;

create table if not exists public.poll_votes (
  option_id  uuid not null references public.poll_options(id) on delete cascade,
  poll_id    uuid not null references public.polls(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (option_id, user_id)
);
create index if not exists poll_votes_poll_idx on public.poll_votes (poll_id);

create or replace function public.poll_is_open(p_poll uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.polls
    where id = p_poll and not closed and (closes_at is null or closes_at > now())
  )
$$;

-- Votação de escolha única: trocar o voto apaga o anterior.
-- Em "Campo e horário" ('jogo') são duas perguntas na mesma votação: o campo é sempre
-- um só por pessoa; os horários seguem a opção "multiple" da votação.
create or replace function public.single_choice_vote()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_kind     text;
  v_multiple boolean;
  v_is_field boolean;
  v_question text;
begin
  -- garante que o voto aponta para a votação certa da opção
  select poll_id, field_id is not null, question into new.poll_id, v_is_field, v_question
    from public.poll_options where id = new.option_id;
  select kind::text, multiple into v_kind, v_multiple from public.polls where id = new.poll_id;

  if v_question is not null then
    -- pergunta extra: um voto por pessoa, só dentro dela
    delete from public.poll_votes pv
    using public.poll_options po
    where pv.option_id = po.id
      and pv.poll_id = new.poll_id and pv.user_id = new.user_id and pv.option_id <> new.option_id
      and po.question = v_question;
  elsif v_kind = 'jogo' then
    if v_is_field or not v_multiple then
      delete from public.poll_votes pv
      using public.poll_options po
      where pv.option_id = po.id
        and pv.poll_id = new.poll_id and pv.user_id = new.user_id and pv.option_id <> new.option_id
        and po.question is null and (po.field_id is not null) = v_is_field;
    end if;
  elsif not v_multiple then
    delete from public.poll_votes pv
    using public.poll_options po
    where pv.option_id = po.id
      and pv.poll_id = new.poll_id and pv.user_id = new.user_id and pv.option_id <> new.option_id
      and po.question is null;
  end if;
  return new;
end $$;

drop trigger if exists single_choice_vote on public.poll_votes;
create trigger single_choice_vote before insert on public.poll_votes
  for each row execute function public.single_choice_vote();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.invites      enable row level security;
alter table public.profiles     enable row level security;
alter table public.fields       enable row level security;
alter table public.games        enable row level security;
alter table public.rsvps        enable row level security;
alter table public.polls        enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes   enable row level security;

-- invites: organizador vê e cria; só admin cria organizador/admin
drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites for select to authenticated using (public.is_organizer() and (not is_test or public.viewer_is_admin()));
drop policy if exists invites_insert on public.invites;
create policy invites_insert on public.invites for insert to authenticated
  with check (public.is_organizer() and ((role = 'jogador' and not is_test) or public.is_admin()));
drop policy if exists invites_update on public.invites;
create policy invites_update on public.invites for update to authenticated
  using (public.is_organizer()) with check (public.is_organizer() and ((role = 'jogador' and not is_test) or public.is_admin()));
drop policy if exists invites_delete on public.invites;
create policy invites_delete on public.invites for delete to authenticated
  using (public.is_organizer() and (role = 'jogador' or public.is_admin()));

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using ((public.is_member() or id = auth.uid()) and public.can_see_user(id));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- fields: todo membro vê e cadastra; edita/apaga quem criou ou organizador
drop policy if exists fields_select on public.fields;
create policy fields_select on public.fields for select to authenticated using (public.is_member());
drop policy if exists fields_insert on public.fields;
create policy fields_insert on public.fields for insert to authenticated with check (public.is_member());
drop policy if exists fields_update on public.fields;
create policy fields_update on public.fields for update to authenticated
  using (public.is_organizer() or created_by = auth.uid());
drop policy if exists fields_delete on public.fields;
create policy fields_delete on public.fields for delete to authenticated
  using (public.is_organizer() or created_by = auth.uid());

-- Campo com jogo marcado (passado ou futuro, não cancelado) não pode ser apagado:
-- o jogo perderia o lugar. Cancele o jogo ou troque o campo dele antes.
create or replace function public.guard_field_delete()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from public.games where field_id = old.id and status <> 'cancelado';
  if n > 0 then
    raise exception 'CAMPO_COM_JOGO: %', n using errcode = 'P0001';
  end if;
  return old;
end $$;

drop trigger if exists guard_field_delete on public.fields;
create trigger guard_field_delete before delete on public.fields
  for each row execute function public.guard_field_delete();

-- games: membro vê; organizador gerencia
drop policy if exists games_select on public.games;
create policy games_select on public.games for select to authenticated using (public.is_member());
drop policy if exists games_write on public.games;
create policy games_write on public.games for all to authenticated
  using (public.is_organizer()) with check (public.is_organizer());

-- rsvps: membro vê todos; cada um mexe só no seu
drop policy if exists rsvps_select on public.rsvps;
create policy rsvps_select on public.rsvps for select to authenticated using (public.is_member() and public.can_see_user(user_id));
drop policy if exists rsvps_insert on public.rsvps;
create policy rsvps_insert on public.rsvps for insert to authenticated
  with check (public.is_member() and user_id = auth.uid());
drop policy if exists rsvps_update on public.rsvps;
create policy rsvps_update on public.rsvps for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists rsvps_delete on public.rsvps;
create policy rsvps_delete on public.rsvps for delete to authenticated using (user_id = auth.uid());

-- polls / options: membro vê; organizador gerencia
drop policy if exists polls_select on public.polls;
create policy polls_select on public.polls for select to authenticated using (public.is_member());
drop policy if exists polls_write on public.polls;
create policy polls_write on public.polls for all to authenticated
  using (public.is_organizer()) with check (public.is_organizer());

drop policy if exists poll_options_select on public.poll_options;
create policy poll_options_select on public.poll_options for select to authenticated using (public.is_member());
drop policy if exists poll_options_write on public.poll_options;
create policy poll_options_write on public.poll_options for all to authenticated
  using (public.is_organizer()) with check (public.is_organizer());

-- votes: membro vê; vota só em votação aberta e só por si
drop policy if exists poll_votes_select on public.poll_votes;
create policy poll_votes_select on public.poll_votes for select to authenticated using (public.is_member() and public.can_see_user(user_id));
drop policy if exists poll_votes_insert on public.poll_votes;
create policy poll_votes_insert on public.poll_votes for insert to authenticated
  with check (public.is_member() and user_id = auth.uid() and public.poll_is_open(poll_id));
drop policy if exists poll_votes_delete on public.poll_votes;
create policy poll_votes_delete on public.poll_votes for delete to authenticated
  using (user_id = auth.uid() and public.poll_is_open(poll_id));

-- ---------------------------------------------------------------------
-- Tempo real (presença e votos atualizam sozinhos na tela)
-- ---------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.rsvps;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.poll_votes;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Sem confirmação por email: libera contas criadas antes de desligar
-- "Confirm email" no Supabase (que ficaram presas como não confirmadas)
-- ---------------------------------------------------------------------
update auth.users set email_confirmed_at = now() where email_confirmed_at is null;

-- ---------------------------------------------------------------------
-- Cota do Google Places: conta cada chamada ANTES de fazer e nunca deixa
-- passar do limite grátis. Passou do limite -> app usa a busca gratuita.
-- Limites com folga abaixo da cota grátis do Google.
-- ---------------------------------------------------------------------
create table if not exists public.api_usage (
  month  text not null,              -- 'YYYY-MM' (fuso do Pacífico, igual à cobrança do Google)
  sku    text not null,
  count  int  not null default 0,
  primary key (month, sku)
);
alter table public.api_usage enable row level security;
drop policy if exists api_usage_select on public.api_usage;
create policy api_usage_select on public.api_usage for select to authenticated using (public.is_member());

create or replace function public.quota_limit(p_sku text)
returns int language sql immutable as $$
  select case p_sku
    when 'text_search'        then 3500   -- Text Search Pro; grátis: 5.000
    when 'autocomplete'       then 7000   -- (não usado mais) grátis: 10.000
    when 'details_essentials' then 7000   -- grátis: 10.000
    when 'details_enterprise' then 900    -- cobrado como Enterprise + Atmosphere; grátis: 1.000
    when 'photo'              then 800    -- Place Details Photos: 1 por foto mostrada; grátis: 1.000
    else 0
  end
$$;

-- Reserva 1 uso se ainda houver cota. Retorna true se pode chamar o Google.
create or replace function public.use_quota(p_sku text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  m text := to_char(now() at time zone 'America/Los_Angeles', 'YYYY-MM');
  ok boolean;
begin
  if not public.is_member() then return false; end if;
  insert into public.api_usage (month, sku) values (m, p_sku) on conflict do nothing;
  update public.api_usage set count = count + 1
   where month = m and sku = p_sku and count < public.quota_limit(p_sku)
  returning true into ok;
  return coalesce(ok, false);
end $$;
grant execute on function public.use_quota(text) to authenticated;

create or replace function public.quota_status()
returns table (sku text, used int, quota int) language sql stable security definer set search_path = public as $$
  select s.sku, coalesce(u.count, 0), public.quota_limit(s.sku)
  from unnest(array['text_search', 'details_enterprise', 'photo']) as s(sku)
  left join public.api_usage u
    on u.sku = s.sku and u.month = to_char(now() at time zone 'America/Los_Angeles', 'YYYY-MM')
  where public.is_member()
$$;
grant execute on function public.quota_status() to authenticated;

-- ---------------------------------------------------------------------
-- Sugestões: qualquer jogador sugere um campo (e opcionalmente dia/hora).
-- Outros apoiam (+1). O organizador aprova (vira jogo oficial) ou recusa.
-- ---------------------------------------------------------------------
do $$ begin
  create type public.suggestion_status as enum ('pendente', 'aprovada', 'recusada');
exception when duplicate_object then null; end $$;

create table if not exists public.suggestions (
  id            uuid primary key default gen_random_uuid(),
  field_id      uuid not null references public.fields(id) on delete cascade,
  starts_at     timestamptz,                       -- null = só o campo, sem horário
  duration_min  int not null default 60 check (duration_min between 15 and 600),
  note          text,
  status        public.suggestion_status not null default 'pendente',
  game_id       uuid references public.games(id) on delete set null,
  decided_by    uuid references public.profiles(id) on delete set null,
  decided_at    timestamptz,
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);
create index if not exists suggestions_field_idx on public.suggestions (field_id);
-- uma sugestão pendente por campo+horário: quem sugerir igual vira apoio
create unique index if not exists suggestions_pending_uniq
  on public.suggestions (field_id, coalesce(starts_at, 'epoch'::timestamptz))
  where status = 'pendente';

create table if not exists public.suggestion_supports (
  suggestion_id uuid not null references public.suggestions(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  created_at    timestamptz not null default now(),
  primary key (suggestion_id, user_id)
);

alter table public.suggestions         enable row level security;
alter table public.suggestion_supports enable row level security;

drop policy if exists suggestions_select on public.suggestions;
create policy suggestions_select on public.suggestions for select to authenticated using (public.is_member() and public.can_see_user(created_by));
drop policy if exists suggestions_update on public.suggestions;
create policy suggestions_update on public.suggestions for update to authenticated
  using (public.is_organizer()) with check (public.is_organizer());
drop policy if exists suggestions_delete on public.suggestions;
create policy suggestions_delete on public.suggestions for delete to authenticated
  using (public.is_organizer() or (created_by = auth.uid() and status = 'pendente'));

drop policy if exists supports_select on public.suggestion_supports;
create policy supports_select on public.suggestion_supports for select to authenticated using (public.is_member() and public.can_see_user(user_id));
drop policy if exists supports_insert on public.suggestion_supports;
create policy supports_insert on public.suggestion_supports for insert to authenticated
  with check (public.is_member() and user_id = auth.uid());
drop policy if exists supports_delete on public.suggestion_supports;
create policy supports_delete on public.suggestion_supports for delete to authenticated using (user_id = auth.uid());

-- Sugere (ou apoia, se já existir igual pendente). Retorna o id da sugestão.
create or replace function public.suggest(
  p_field_id uuid, p_starts_at timestamptz default null, p_duration int default 60, p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if not public.is_member() then raise exception 'Você não tem permissão para isso'; end if;
  if p_starts_at is not null and p_starts_at < now() then raise exception 'SUGESTAO_PASSADO'; end if;
  select id into sid from public.suggestions
   where field_id = p_field_id and status = 'pendente'
     and coalesce(starts_at, 'epoch'::timestamptz) = coalesce(p_starts_at, 'epoch'::timestamptz);
  if sid is null then
    insert into public.suggestions (field_id, starts_at, duration_min, note, created_by)
    values (p_field_id, p_starts_at, coalesce(p_duration, 60), nullif(trim(p_note), ''), auth.uid())
    returning id into sid;
  end if;
  insert into public.suggestion_supports (suggestion_id, user_id) values (sid, auth.uid())
  on conflict do nothing;
  return sid;
end $$;
grant execute on function public.suggest(uuid, timestamptz, int, text) to authenticated;

-- Ranking: campos com mais pessoas diferentes sugerindo/apoiando nos últimos N dias
create or replace function public.field_ranking(p_days int default 90)
returns table (field_id uuid, name text, people bigint, suggestions bigint, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  select f.id, f.name, count(distinct sp.user_id), count(distinct s.id), max(sp.created_at)
  from public.suggestions s
  join public.suggestion_supports sp on sp.suggestion_id = s.id
  join public.fields f on f.id = s.field_id
  where public.is_member() and sp.created_at > now() - make_interval(days => p_days)
  group by f.id, f.name
  order by 3 desc, 5 desc
$$;
grant execute on function public.field_ranking(int) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.suggestion_supports;
exception when duplicate_object then null; end $$;

-- Faz a API enxergar as tabelas e funções novas na hora.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Pedidos de acesso: página pública onde a pessoa deixa nome e email.
-- Ninguém de fora lê a tabela; só envia pelo request_access().
-- O admin aprova (vira convite de jogador) ou recusa.
-- ---------------------------------------------------------------------
do $$ begin
  create type public.request_status as enum ('pendente', 'aprovado', 'recusado');
exception when duplicate_object then null; end $$;

create table if not exists public.access_requests (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email = lower(trim(email)) and email like '%_@_%._%' and length(email) <= 200),
  name        text not null check (length(trim(name)) between 2 and 80),
  phone       text check (phone is null or length(phone) <= 30),
  note        text check (note is null or length(note) <= 300),
  status      public.request_status not null default 'pendente',
  decided_by  uuid references public.profiles(id) on delete set null,
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);
-- um pedido pendente por email: pedir de novo só atualiza
create unique index if not exists access_requests_pending_uniq on public.access_requests (email) where status = 'pendente';

alter table public.access_requests enable row level security;
drop policy if exists access_requests_select on public.access_requests;
create policy access_requests_select on public.access_requests for select to authenticated using (public.is_admin());

-- Envia (ou atualiza) um pedido. Responde o que aconteceu, sem revelar dados de ninguém.
create or replace function public.request_access(p_name text, p_email text, p_phone text default null, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  e text := lower(trim(p_email));
begin
  if e is null or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(e) > 200 then return 'email_invalido'; end if;
  if p_name is null or length(trim(p_name)) < 2 then return 'nome_invalido'; end if;
  if exists (select 1 from public.invites where email = e) then return 'ja_convidado'; end if;
  -- freio contra spam: no máximo 300 pedidos esperando
  if (select count(*) from public.access_requests where status = 'pendente') >= 300 then return 'lotado'; end if;
  insert into public.access_requests (email, name, phone, note)
  values (e, left(trim(p_name), 80), nullif(left(trim(coalesce(p_phone, '')), 30), ''), nullif(left(trim(coalesce(p_note, '')), 300), ''))
  on conflict (email) where status = 'pendente'
  do update set name = excluded.name, phone = excluded.phone, note = excluded.note, created_at = now();
  return 'ok';
end $$;
grant execute on function public.request_access(text, text, text, text) to anon, authenticated;

-- Admin decide: aprovar cria o convite (jogador; pode marcar como teste)
create or replace function public.decide_access_request(p_id uuid, p_approve boolean, p_test boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare r public.access_requests;
begin
  if not public.is_admin() then raise exception 'Só o admin pode aprovar pedidos de acesso'; end if;
  select * into r from public.access_requests where id = p_id and status = 'pendente' for update;
  if not found then raise exception 'Esse pedido já foi decidido'; end if;
  if p_approve then
    insert into public.invites (email, role, name, invited_by, is_test)
    values (r.email, 'jogador', r.name, auth.uid(), coalesce(p_test, false))
    on conflict (email) do nothing;
  end if;
  update public.access_requests
     set status = case when p_approve then 'aprovado'::public.request_status else 'recusado'::public.request_status end,
         decided_by = auth.uid(), decided_at = now()
   where id = p_id;
end $$;
grant execute on function public.decide_access_request(uuid, boolean, boolean) to authenticated;
