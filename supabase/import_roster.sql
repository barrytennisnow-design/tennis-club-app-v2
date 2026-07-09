-- Auto-generated from the uploaded Tennis_Player.xlsx 'Roster' tab.
-- 40 players imported, 0 skipped.
--
-- Run this AFTER schema.sql and seed.sql.
-- Imported players have no auth_user_id yet -- they'll be linked
-- automatically the first time they log in via magic link with
-- this same email address (see app/auth/callback/route.ts).

insert into players
  (first_name, last_name, email, phone, address, city, state, zip,
   ranking, days_per_week, days_in_a_row, days_usually_available,
   notes, legacy_access_code, status)
values
  ('Omar', 'M', 'omarrise@yahoo.com', '786-516-6768', NULL, 'Psl', 'FL', '34953', 4.25, 2, 1, 'Mon, Tue', NULL, 'Miami3955', 'active'),
  ('Wadis', 'Maldonado', 'wadismaldonado@me.com', '619-245-1591', '2397 SE Newcastle Ter', 'Port Saint Lucie', 'FL', '34952', 4.25, 1, 1, 'Fri', 'If I don’t have a lesson at the club I’ll play most Fridays..', '12345', 'active'),
  ('JC', 'Andrade', 'juanco67@gmail.com', '561-768-1513', '5473 SE Jennings lane', 'Stuart', 'FL', '34997', 4.0, 1, 1, 'Wed, Thu', NULL, 'Natalia010', 'active'),
  ('Ken', 'Chen', 'kchen888@hotmail.com', '561-351-4194', '2370 NE Ocean Blvd, Unit B-102', 'Stuart', 'FL', '34996', 4.0, 1, 1, 'Sat, Sun', 'In general, I’m available every other weekend.', '84Nanda88', 'active'),
  ('Rich', 'Lichtenwalner', 'lichtenwalner.rich@gmail.com', '610-972-5864', '3343 W Union Street', 'Allentown', 'PA', '18104', 4.0, 4, 3, 'Mon, Tue, Wed, Thu, Fri, Sat, Sun', 'planning to be in FL November to April', 'fltennis', 'active'),
  ('Brendan', 'Phelan', 'brendan_phelan@hotmail.com', '302-388-3489', '1570 SW Lago Cir', 'Palm City', 'FL', '34990', 3.75, 2, 2, 'Mon, Tue, Wed, Thu, Fri, Sat, Sun', NULL, 'WWTT25', 'active'),
  ('Dave', 'Serhal', 'dellis316@gmail.com', '772-828-0774', '8684 se jardin st', 'Hobe Sound', 'FL', '33455', 3.75, 1, 1, 'Sat', NULL, 'Tennis2026', 'active'),
  ('Mike', 'Tune', 'exposmontreal123@hotmail.com', '772-924-8587', '1811 SW Palm City Rd', 'Stuart', 'FL', '34994', 3.75, 4, 2, 'Mon, Tue, Thu, Fri, Sat', 'No', 'Natasha', 'active'),
  ('Tanya', 'Mikel', 'num1tanya@att.net', '772-418-6511', '1147 Nettles Blvd', 'Jensen Beach', 'FL', '34957', 3.75, 2, 2, 'Thu, Fri, Sat, Sun', NULL, '1104Tanya', 'active'),
  ('Al', 'Van Wormer', 'alanvanfish@gmail.com', '772-341-9292', '12420 SW Keating Dr', 'Port St Lucie', 'FL', '34987', 3.5, 4, 2, 'Mon, Tue, Wed, Fri', 'The days will vary, Barry.
2 sets when real hot and humid, 3 sets other times.', '1219magic', 'paused'),
  ('Ann', 'Hamann', 'amhaman@aol.com', '772-521-3847', '3869 Royal Oak', 'Jensen Beach', 'FL', '34957', 3.5, 2, 2, 'Mon, Tue, Wed, Thu, Fri, Sat', NULL, 'JBCCtenpb', 'paused'),
  ('Barry', 'Richman', 'a.bjr2@verizon.net', '215-715-9700', '1145 NE Doubloon Dr', 'Stuart', 'FL', '34996', 3.5, 3, 2, 'Mon, Wed, Fri, Sat', NULL, 'ww666g', 'active'),
  ('Brian', 'Allen', 'sax4u2@bellsouth.net', '772-418-2436', '4916 NW Fitzgerald Ave', 'Port ST Lucie', 'FL', '34983', 3.5, 3, 2, 'Mon, Thu, Fri', NULL, '0604Sax4u2', 'active'),
  ('Chris', 'Segalla', 'christophers1979bch@gmail.com', '781-424-6882', '5313 SE Miles Grant Rd K203', 'Stuart', 'FL', '34997', 3.5, 2, 1, NULL, 'Thank You!', 'EmmaS1', 'active'),
  ('Dana', 'Rankin', 'jardinlabs7@gmail.com', '954-931-0647', '8694 SE Jardin St', 'Hobe Sound', 'FL', '33455', 3.5, 4, 2, NULL, NULL, 'Frida2025', 'active'),
  ('Diane', 'Morrissey', 'dianemorrissey84@gmail.com', '609-618-4193', '13466 SW Gingerline Drive', 'Port St. Lucie', 'FL', '34987', 3.5, 3, 2, NULL, 'I bounce back and forth to NJ so I will give you 1-2 week’s notice when I’ll be in PSL.  Thank you for organizing!!!', 'PSLtennis', 'active'),
  ('Greg', 'Nobles', 'unc1250@yahoo.com', '772-828-1186', '2285 SE Avalon Rd', 'Port Saint Lucie', 'FL', '34952', 3.5, 2, 2, NULL, 'As you know my schedule is all over the place so days available changrs week to week. Sometimes I am not available the whole week.', 'Py3937', 'active'),
  ('Hugo', 'Hidalgo', 'hidalzi59@gmail.com', '786-689-4395', '2534 Southeast Tropical East Circle', 'Port Saint Lucie', 'FL', '34952', 3.5, 2, 1, NULL, NULL, 'Vichanic', 'active'),
  ('Jan', 'Krestan', 'krestanja@gmail.com', '772-924-9012', '3333 Moon Street', 'Palm City', 'FL', '34990', 3.5, 3, 1, 'Mon, Tue, Thu, Fri, Sat', NULL, '12126', 'paused'),
  ('Janet', 'FitzGerald', 'jfitz4@bellsouth.net', '678-316-6850', '244 Ethan Terrace', 'Stuart', 'FL', '34997', 3.5, 3, 1, NULL, NULL, '12345', 'paused'),
  ('John', 'Meehan', 'johnnymac1031@hotmail.com', '772-486-7353', '3775 ne deer oak dr', 'Jensen beach', 'FL', '34987', 3.5, 2, 1, NULL, 'Leaving for up north June 17', 'Blue1', 'active'),
  ('Jon', 'Jeffery', 'jjeffery58@yahoo.com', '949-436-0528', '3323 SE Fairway E', 'Stuart', 'FL', '34997', 3.5, 2, 2, 'Tue, Wed, Thu, Fri', NULL, 'Austin90', 'active'),
  ('Kim', 'Levy', 'lbijrsy@gmail.com', '650-642-0981', '1726 NE Ocean Blvd', 'Stuart', 'FL', '34996', 3.5, 1, 2, 'Mon;Wed;Fri', NULL, 'Alex2539', 'active'),
  ('Leen', 'Dawany', 'leendawany@hotmail.com', '772-370-9910', '897 NW MOSSY', 'Jensen Beach', 'FL', '34957', 3.5, 3, 3, 'Tue, Wed, Thu', NULL, '897mossy', 'active'),
  ('Marcia', 'Patterson', 'marciapatt@bellsouth.net', '949-510-3325', '3323 SE Fairway E', 'Stuart', 'FL', '34997', 3.5, 2, 2, 'Mon, Tue, Wed, Fri, Sat', 'You can use me as a sub as well. If I''m in town I can play most any day', '50194', 'active'),
  ('Rich', 'Licata', 'rlicata64@bellsouth.net', '813-766-5888', '3825 NW Deer Oak Dr', 'Jensen Beach', 'FL', '34957', 3.5, 2, 2, 'Fri, Sat', NULL, 'Deeroak', 'active'),
  ('Stan', 'Zausmer', 'stanleyzed@gmail.com', '301-351-4302', '2370 NE Ocean Blvd, A-206', 'Stuart', 'FL', '34996', 3.5, 3, 2, 'Mon, Wed, Fri, Sat', NULL, 'Tennis', 'paused'),
  ('Steve', 'Tune', 'tunesteve@me.com', '772-205-5585', '1811 SW palm city road A501', 'Stuart', 'FL', '34994', 3.75, 4, 2, 'Mon, Tue, Wed, Thu, Fri, Sat, Sun', NULL, 'tennis1001', 'active'),
  ('Tamma', 'Murphy', 'murphytamma@gmail.com', '602-677-8653', 'Santa cruz Drive', 'Jensen beach', 'FL', '34957', 3.5, 3, 1, 'Mon, Wed, Fri', NULL, 'ABCDE', 'paused'),
  ('Dennis', 'Gerdovich', 'dtgerdo@gmail.com', '571-294-7149', '1674 NW Golden Oak Trail', 'Jensen Beach', 'FL', '34957', 3.25, 1, 1, 'Tue, Thu', NULL, '15600', 'active'),
  ('Dwayne', 'Struble', 'wdwaynes@netscape.net', '772-485-1082', '1529 Se Chiffon Ave', 'Port St Lucie', 'FL', '34952', 3.25, 3, 2, 'Tue, Thu, Sat', 'I can play more starting June 4', '35012', 'active'),
  ('Rob', 'Padovano', 'njregularguy@gmail.com', '609-709-8139', '10851 s ocean dr lot 17', 'Jensen Beach', 'FL', '33957', 3.25, 2, 2, 'Mon, Wed, Fri, Sun', 'I have no idea how to rank myself but I figured that''s average?? Thank you', 'slip60', 'active'),
  ('Wendy', 'Shaw', 'wendyrichards49@gmail.com', '952-457-7601', '1599 SW Springfield Ct', 'Palm City', 'FL', '34990', 3.5, 2, 1, 'Mon, Wed', 'Leaving for MN 6/6 - meadows courts or halpatiokee', 'Yellow', 'paused'),
  ('Bill', 'Shaw', 'shawwh@gmail.com', '772-888-5155', '1599 Springfield Ct', 'Palm City', 'FL', '34990', 3.5, 3, 3, 'Mon, Tue, Wed, Thu, Fri, Sat, Sun', NULL, 'meadows', 'paused'),
  ('Chris', 'DeLorenzo', 'delo71@gmail.com', '772-285-6736', '703 SE Hibiscus Ave', 'Stuart', 'FL', '34996', 3.5, 1, 1, 'Wed', 'My schedule is variable. Not much time lately', 'Tennis', 'active'),
  ('Joe', 'Brodsky', 'joebrodsky@comcast.net', '508-776-1842', '1234.0', 'Jensen Beach', 'FL', '34957', 3.5, 5, 5, 'Mon, Tue, Wed, Thu, Fri, Sat, Sun', NULL, 'Joebro', 'paused'),
  ('Armando', 'Gallardo', 'agalardo16@yahoo.com', '561-827-1974', '1225 NW 21 St Apt 615', 'Stuart', 'FL', '34994', 3.25, 2, 2, NULL, 'Sometimes I can play Wednesday and Saturday also.', 'Agalardo16', 'paused'),
  ('Flavio', 'Campaner', 'flavio.campaner@altec.com', '772-321-2008', '2302 se merrill rd', 'Port Saint lucie', 'FL', '34952', 3.5, 2, 2, 'Sat, Sun', 'No', 'Popy2222', 'active'),
  ('Olga', 'Maness', 'teachflaca@gmail.com', '772-214-8577', '3105 SW Solitaire Palm Drive', 'Palm City', 'FL', '34990', 3.5, 2, 2, 'Thu, Fri', NULL, 'Cambrai', 'active'),
  ('Faris', 'Q', 'faris@stanfordalumni.org', '772-204-6894', '897 mossy oak', 'jensen beach', 'FL', '34957', 3.25, 3, 1, 'Mon, Tue, Wed, Thu, Fri, Sat, Sun', 'can start playing on the 9th', '12345', 'active');
