import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/20260911020000_add_social_platform_schedule_statuses.sql",
  import.meta.url,
);

test("platform schedule status migration adds JSON storage and backfills scheduled cards", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(
    sql,
    /add column if not exists platform_schedule_statuses jsonb not null default '\{\}'::jsonb/i,
  );
  assert.match(
    sql,
    /jsonb_typeof\(platform_schedule_statuses\) = 'object'/i,
  );
  assert.match(sql, /jsonb_object_agg\(btrim\(channel\), to_jsonb\(true\)\)/i);
  assert.match(sql, /task\.publishing_status = 'scheduled'/i);
});
