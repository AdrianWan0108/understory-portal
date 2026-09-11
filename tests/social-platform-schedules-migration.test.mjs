import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/20260911000000_add_social_platform_schedules.sql",
  import.meta.url,
);

test("platform schedule migration adds JSON storage and backfills shared dates", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(
    sql,
    /add column if not exists platform_schedules jsonb not null default '\{\}'::jsonb/i,
  );
  assert.match(sql, /jsonb_typeof\(platform_schedules\) = 'object'/i);
  assert.match(sql, /jsonb_object_agg/i);
  assert.match(sql, /task\.scheduled_at is not null/i);
});
