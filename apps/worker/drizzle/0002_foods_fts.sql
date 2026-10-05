-- Owns: full-text search over the foods cache (SPEC §6 food matching): the foods_fts FTS5 table on (name, brand), the
-- triggers that keep it in step with `foods`, and the backfill. food-sources' searchLocal() queries it instead of scanning
-- `foods` with LIKE. The porter tokenizer folds "almonds"/"almond", "cooked"/"cook"; diacritics are removed.
-- food_id is UNINDEXED (stored, not searched); the triggers delete by it, which reads the FTS table, so the update trigger
-- fires only when name or brand actually change (an upsert of the same food is free).
-- A rebuild of `foods` ("__new_foods") drops these triggers: re-create them in that migration.
-- `wrangler d1 export` cannot dump virtual tables; the app's own export is per-table JSON and skips foods_fts.
CREATE VIRTUAL TABLE IF NOT EXISTS `foods_fts` USING fts5(food_id UNINDEXED, name, brand, tokenize = 'porter unicode61 remove_diacritics 2');
--> statement-breakpoint
INSERT INTO `foods_fts` (food_id, name, brand) SELECT id, name, coalesce(brand, '') FROM `foods`;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `foods_fts_insert` AFTER INSERT ON `foods` BEGIN
  INSERT INTO `foods_fts` (food_id, name, brand) VALUES (new.id, new.name, coalesce(new.brand, ''));
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `foods_fts_delete` AFTER DELETE ON `foods` BEGIN
  DELETE FROM `foods_fts` WHERE food_id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `foods_fts_update` AFTER UPDATE OF name, brand ON `foods`
WHEN old.name IS NOT new.name OR old.brand IS NOT new.brand BEGIN
  DELETE FROM `foods_fts` WHERE food_id = old.id;
  INSERT INTO `foods_fts` (food_id, name, brand) VALUES (new.id, new.name, coalesce(new.brand, ''));
END;
