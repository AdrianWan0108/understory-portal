import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/20260904000000_reconcile_social_workflow_state.sql",
  import.meta.url,
);

test("the workflow reconciliation migration promotes live links to posted", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /set production_status = 'complete'/i);
  assert.match(sql, /nullif\(btrim\(post\.live_post_url\), ''\) is not null/i);
  assert.match(sql, /publishing_status = 'posted'/i);
  assert.match(sql, /posted_at = coalesce/i);
});
