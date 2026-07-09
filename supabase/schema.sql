-- ============================================================
-- Tennis Club Management System — Database Schema
-- Target: Supabase (Postgres + Auth)
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- PLAYERS
-- One row per player. Created at signup (status = pending),
-- linked to a Supabase auth user via auth_user_id.
-- ------------------------------------------------------------
create table players (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text unique not null,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  ranking numeric(3,2),                -- set by manager on approval; player can suggest one at signup
  self_reported_ranking numeric(3,2),  -- what the player entered at signup
  days_per_week int,
  days_in_a_row int,
  days_usually_available text,          -- e.g. 'Mon, Wed, Fri' (free-form, as collected historically)
  legacy_access_code text,              -- old spreadsheet's access code; kept for reference only, not used for login
  access_token text unique default encode(gen_random_bytes(16), 'hex'),  -- permanent bookmarkable login link: /access/<token>
  status text not null default 'pending'
    check (status in ('pending', 'active', 'paused', 'declined')),
  role text not null default 'player'
    check (role in ('player', 'manager')),
  notes text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references players(id)
);

-- ------------------------------------------------------------
-- COURTS
-- ------------------------------------------------------------
create table courts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text
);

-- ------------------------------------------------------------
-- AVAILABILITY
-- Rolling 30-day self-service availability. One row per
-- player per date (+ optional time slot). Players manage
-- their own rows; a row disappears from editability once
-- it's tied to a proposed/confirmed match (enforced in app +
-- via the is_locked helper view below).
-- ------------------------------------------------------------
create table availability (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  date date not null,
  time_slot text not null default 'morning',
  created_at timestamptz not null default now(),
  unique (player_id, date, time_slot)
);

-- ------------------------------------------------------------
-- MATCHES
-- A proposed/confirmed/cancelled 4-player group.
-- ------------------------------------------------------------
create table matches (
  id uuid primary key default gen_random_uuid(),
  match_date date not null,
  time_slot text not null default 'morning',
  court_id uuid references courts(id),
  status text not null default 'draft'
    check (status in ('draft', 'proposed', 'confirmed', 'cancelled')),
  auto_cancel_hours int not null default 24,
  nudge_count int not null default 0,
  created_at timestamptz not null default now(),
  proposed_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz
);

-- ------------------------------------------------------------
-- MATCH_PLAYERS
-- Join table: which 4 players are in a match, and their
-- individual accept/decline response.
-- ------------------------------------------------------------
create table match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  response_status text not null default 'proposed'
    check (response_status in ('proposed', 'accepted', 'declined')),
  responded_at timestamptz,
  decline_reason text,
  unique (match_id, player_id)
);

-- ------------------------------------------------------------
-- EMAIL LOG
-- Replaces the old "Outbox" tab. Every notification the
-- system sends (magic links are handled by Supabase Auth
-- directly and don't need to go through here).
-- ------------------------------------------------------------
create table email_log (
  id uuid primary key default gen_random_uuid(),
  recipient text not null,
  subject text,
  body text,
  status text not null default 'sent',
  sent_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Helper view: a player's date/time-slot combos that are tied
-- up in an active (proposed or confirmed) match, so the
-- frontend can grey these out on the availability calendar.
-- ------------------------------------------------------------
create view locked_availability as
  select mp.player_id, m.match_date as date, m.time_slot
  from match_players mp
  join matches m on m.id = mp.match_id
  where m.status in ('proposed', 'confirmed');

-- ------------------------------------------------------------
-- MATCH STATUS AUTOMATION
-- When a player accepts/declines, check the whole match:
--   - any decline  -> match cancelled
--   - all 4 accept -> match confirmed
-- This mirrors the old spreadsheet's ACCEPTED/DECLINED/
-- CONFIRMED/CANCELLED logic, but runs automatically.
-- ------------------------------------------------------------
create or replace function handle_match_player_response()
returns trigger
language plpgsql
security definer
as $$
declare
  total int;
  accepted int;
  declined int;
begin
  select count(*) into total from match_players where match_id = new.match_id;
  select count(*) into accepted from match_players where match_id = new.match_id and response_status = 'accepted';
  select count(*) into declined from match_players where match_id = new.match_id and response_status = 'declined';

  if declined > 0 then
    update matches set status = 'cancelled', cancelled_at = now()
      where id = new.match_id and status <> 'cancelled';
  elsif accepted = total then
    update matches set status = 'confirmed', confirmed_at = now()
      where id = new.match_id and status <> 'confirmed';
  end if;

  return new;
end;
$$;

create trigger on_match_player_response
  after update of response_status on match_players
  for each row
  execute function handle_match_player_response();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table players enable row level security;
alter table availability enable row level security;
alter table matches enable row level security;
alter table match_players enable row level security;
alter table email_log enable row level security;
alter table courts enable row level security;

-- --- helper: is the current user a manager? ---
create or replace function is_manager()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from players
    where auth_user_id = auth.uid() and role = 'manager'
  );
$$;

-- --- players ---
create policy "players can view own row"
  on players for select
  using (auth_user_id = auth.uid());

create policy "managers can view all players"
  on players for select
  using (is_manager());

create policy "anyone can insert their own signup row"
  on players for insert
  with check (auth_user_id = auth.uid() or auth_user_id is null);

create policy "players can update own profile fields"
  on players for update
  using (auth_user_id = auth.uid());

create policy "managers can update any player"
  on players for update
  using (is_manager());

-- --- availability ---
create policy "players manage own availability"
  on availability for all
  using (player_id in (select id from players where auth_user_id = auth.uid()))
  with check (player_id in (select id from players where auth_user_id = auth.uid()));

create policy "managers view all availability"
  on availability for select
  using (is_manager());

-- --- courts ---
create policy "everyone can read courts"
  on courts for select
  using (true);

create policy "managers manage courts"
  on courts for all
  using (is_manager());

-- --- matches ---
create policy "players view matches they're in"
  on matches for select
  using (id in (
    select match_id from match_players mp
    join players p on p.id = mp.player_id
    where p.auth_user_id = auth.uid()
  ));

create policy "managers manage all matches"
  on matches for all
  using (is_manager());

-- --- match_players ---
create policy "players view their own match entries"
  on match_players for select
  using (player_id in (select id from players where auth_user_id = auth.uid()));

create policy "players respond to their own match entries"
  on match_players for update
  using (player_id in (select id from players where auth_user_id = auth.uid()))
  with check (player_id in (select id from players where auth_user_id = auth.uid()));

create policy "managers manage all match_players"
  on match_players for all
  using (is_manager());

-- --- email_log ---
create policy "managers view email log"
  on email_log for select
  using (is_manager());

-- ============================================================
-- SEED: mark the club organizer as manager after their first
-- login. Run manually once, replacing the email:
-- ============================================================
-- update players set role = 'manager' where email = 'barrytennisnow@gmail.com';
