import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/20260904010000_add_social_creative_drive_link.sql",
  import.meta.url,
);

test("social posts support a production creative link and carousel-wide captions are cleared", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /add column if not exists creative_drive_link text/i);
  assert.match(sql, /set post_caption = ''/i);
  assert.match(sql, /where format = 'carousel'/i);
});
