import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/20260911010000_add_social_platform_captions.sql",
  import.meta.url,
);

test("platform caption migration adds JSON storage and backfills shared captions", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(
    sql,
    /add column if not exists platform_captions jsonb not null default '\{\}'::jsonb/i,
  );
  assert.match(sql, /jsonb_typeof\(platform_captions\) = 'object'/i);
  assert.match(sql, /jsonb_object_agg/i);
  assert.match(sql, /task\.post_caption/i);
});
