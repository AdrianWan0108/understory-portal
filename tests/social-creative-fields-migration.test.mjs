import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20261115210231_add_social_creative_fields.sql",
  import.meta.url,
);

test("creative fields migration adds focused social copy fields", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /add column if not exists hook text not null default ''/i);
  assert.match(
    sql,
    /add column if not exists hashtags text\[\] not null default '\{\}'::text\[\]/i,
  );
  assert.match(
    sql,
    /add column if not exists collaborator_usernames text\[\] not null default '\{\}'::text\[\]/i,
  );
  assert.match(sql, /reel_details ->> 'hook'/i);
});
