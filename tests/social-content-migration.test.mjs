import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/20260901000000_unify_social_content_calendar.sql",
  import.meta.url,
);

test("the unified calendar migration preserves legacy review rows and backfills both status dimensions", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /add column if not exists production_status text/i);
  assert.match(sql, /add column if not exists publishing_status text/i);
  assert.match(sql, /when 'for_review' then 'ready_for_review'/i);
  assert.match(sql, /when 'changes_requested' then 'changes_required'/i);
  assert.match(sql, /when posted_at is not null or status = 'posted' then 'posted'/i);
  assert.match(sql, /set division_task_id = canonical\.calendar_id/i);
  assert.match(sql, /social_notification_events/i);
  assert.doesNotMatch(
    sql,
    /delete\s+from\s+public\.division_tasks[\s\S]*internal_approval/i,
  );
});
