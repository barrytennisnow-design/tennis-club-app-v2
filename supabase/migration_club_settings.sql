-- ============================================================
-- Migration: club settings (default court + default time)
-- Single-row settings table -- the "id" check constraint
-- guarantees there's ever only one row.
-- ============================================================

create table if not exists club_settings (
  id boolean primary key default true check (id),
  default_court_id uuid references courts(id),
  default_time_slot text not null default 'morning',
  default_time_display text not null default '8:00am warmup, 8:15am start play'
);

insert into club_settings (id) values (true) on conflict (id) do nothing;

alter table club_settings enable row level security;

create policy "everyone can read settings"
  on club_settings for select
  using (true);

create policy "managers can update settings"
  on club_settings for update
  using (is_manager());
