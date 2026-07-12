-- Lets a manager override the time shown for one specific match,
-- instead of always using the club-wide default. Null = use the
-- default from club_settings.
alter table matches add column if not exists time_display text;
