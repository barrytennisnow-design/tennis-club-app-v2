-- Run after schema.sql. Seeds the courts your club already uses,
-- pulled from the old Match Matrix spreadsheet.
insert into courts (name, location) values
  ('Langford 1', 'Langford'),
  ('Langford 2', 'Langford'),
  ('Eagle Marsh 1', 'Eagle Marsh'),
  ('Eagle Marsh 2', 'Eagle Marsh');

-- Set yourself as the manager once you've logged in the first time
-- (replace with your real email):
-- update players set role = 'manager' where email = 'barrytennisnow@gmail.com';
