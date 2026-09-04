import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/20260903000000_add_social_scheduling_modes.sql",
  import.meta.url,
);

test("the scheduling migration supports automatic and manual reminders", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /add column if not exists scheduling_mode text/i);
  assert.match(sql, /add column if not exists manual_reminder_sent_at timestamptz/i);
  assert.match(sql, /scheduling_mode in \('automatic', 'manual'\)/i);
  assert.match(sql, /format in \('reel', 'carousel', 'image', 'story'\)/i);
  assert.match(sql, /tasks_manual_post_reminder_queue_idx/i);
});
