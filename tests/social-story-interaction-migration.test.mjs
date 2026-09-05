import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/20260905000000_add_social_story_interaction.sql",
  import.meta.url,
);

test("social Story interactions are structured and safe for existing cards", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /add column if not exists story_interaction jsonb not null/i);
  assert.match(sql, /default '\{"type":"none","prompt":"","options":\[\]\}'::jsonb/i);
  assert.match(sql, /jsonb_typeof\(story_interaction\) = 'object'/i);
  assert.doesNotMatch(sql, /update\s+public\.tasks/i);
});
