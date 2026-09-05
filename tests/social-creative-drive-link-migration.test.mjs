import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/20260904010000_add_social_creative_drive_link.sql",
  import.meta.url,
);

test("social posts support a production creative link without rewriting existing content", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /add column if not exists creative_drive_link text/i);
  assert.doesNotMatch(sql, /update\s+public\.tasks/i);
});
