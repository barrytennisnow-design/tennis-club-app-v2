-- ============================================================
-- Migration: Time slots management table
-- ============================================================

create table if not exists time_slots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  is_default boolean not null default false
);

alter table club_settings add column if not exists default_time_slot_id uuid references time_slots(id);

-- Seed with default time slot
insert into time_slots (name, description, is_default) 
values ('morning', '8:00am warmup, 8:15am start play', true)
on conflict do nothing;

-- Set default in club_settings
update club_settings 
set default_time_slot_id = (select id from time_slots where is_default = true limit 1)
where default_time_slot_id is null;

alter table time_slots enable row level security;

create policy "everyone can read time slots"
  on time_slots for select
  using (true);

create policy "managers manage time slots"
  on time_slots for all
  using (is_manager());
