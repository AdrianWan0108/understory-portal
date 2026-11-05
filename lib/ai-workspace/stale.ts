// A queued or running task whose row has not changed for this long never
// reached n8n, or n8n stopped reporting on it. Every n8n event bumps updated_at.
export const STALE_AFTER_MS = 30 * 60 * 1000;

export function isStaleTask(task: { status: string; updated_at?: string | null; requested_at?: string | null }, now = Date.now()) {
  if (task.status !== "queued" && task.status !== "running") return false;
  const last = Date.parse(task.updated_at ?? task.requested_at ?? "");
  return Number.isFinite(last) && now - last > STALE_AFTER_MS;
}

export const CANCELLABLE_STATUSES = new Set(["queued", "running", "waiting_for_input", "waiting_for_approval", "failed"]);
