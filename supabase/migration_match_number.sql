-- Adds a short, human-friendly sequential match number (like the old
-- sheet's "M108", "M109"...) instead of showing UUID fragments.
alter table matches add column if not exists match_number serial;
