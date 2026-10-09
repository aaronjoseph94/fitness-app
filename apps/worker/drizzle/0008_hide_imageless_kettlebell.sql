-- Owns: two changes to a database that already exists (Aaron, 2026-10-09). (1) Hiding the three kettlebell moves
-- free-exercise-db ships without pictures (Kettlebell Halo, Kettlebell Halo with Overhead Extension, Kettlebell Overhead
-- Triceps Extension). A fresh database takes the same rows from the seed (seed/equipment/anytime-fitness.json name
-- pattern), with the same ids (seedId("exclusion:<slug>")), so INSERT OR IGNORE makes this a no-op there; the JOIN writes
-- a row only when its exercise exists. (2) Rewording the two seeded texts that named him (the adjustable bench note and
-- the bodyweight exclusion reason) to the seed's new wording, so his name can't reach a prompt through them. Each
-- UPDATE matches the old seeded text exactly, so a note he wrote himself is never touched, and a rerun changes nothing.
INSERT OR IGNORE INTO exercise_exclusions (id, exercise_id, reason)
SELECT v.column1, e.id, v.column3 FROM (VALUES
  ('5fb8ae5d-4b6f-5d10-9b77-f2cf5a02a7fd', '5f25c175-128f-5e91-80d2-157572e6f1bd', 'No pictures of it in the exercise library.'),
  ('c5f904e2-d5e7-598e-bb5b-0c57a66115ae', '5cef3612-2074-5018-af52-9d9f3e6ae2ad', 'No pictures of it in the exercise library.'),
  ('bb7e6cf8-e48d-5d2f-9354-430d64681929', '7efcda7e-6fee-5168-bf82-7770c5837dc9', 'No pictures of it in the exercise library.')
) AS v JOIN exercises e ON e.id = v.column2;
--> statement-breakpoint
UPDATE equipment_profile
SET note = 'Flat, incline and decline (assumed with the racks; not on the club''s list).', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE equipment = 'adjustable bench' AND note = 'Flat, incline and decline (not on Aaron''s list; assumed with the racks).';
--> statement-breakpoint
UPDATE exercise_exclusions
SET reason = 'Bodyweight exercise; training is machines and free weights only (SPEC §2).', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE reason = 'Bodyweight exercise; Aaron trains with machines and free weights only (SPEC §2).';
