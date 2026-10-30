// Turns a portal /api/ai/office snapshot into one desk state per agent.
// Loaded as a classic script in the window and with require() in tests.
(function (root) {
  const STATES = {
    working: { label: "做緊嘢", color: "#5fd38a" },
    waiting: { label: "等你批", color: "#f2c14e" },
    queued: { label: "排緊隊", color: "#7fa7ff" },
    failed: { label: "出錯", color: "#ff6b6b" },
    paused: { label: "暫停", color: "#9a8aa8" },
    idle: { label: "得閒", color: "#c9b8d8" },
  };

  function deriveAgents(snapshot, now = new Date()) {
    const tasks = snapshot?.tasks ?? [];
    const events = snapshot?.events ?? [];
    const pending = new Set(snapshot?.pending_approvals ?? []);
    const today = now.toDateString();
    return (snapshot?.agents ?? []).map((agent) => {
      // Tasks arrive newest first.
      const mine = tasks.filter((task) => task.assigned_agent === agent.key);
      const running = mine.find((task) => task.status === "running");
      const waiting = mine.find((task) => task.status === "waiting_for_approval" || task.status === "waiting_for_input" || pending.has(task.id) && task.status !== "completed");
      const queued = mine.filter((task) => task.status === "queued");
      const latest = mine[0];
      const state = agent.enabled === false ? "paused"
        : running ? "working"
        : waiting ? "waiting"
        : queued.length ? "queued"
        : latest?.status === "failed" ? "failed"
        : "idle";
      // The oldest queued task is the one that will be picked up next.
      const current = running ?? waiting ?? queued[queued.length - 1] ?? (state === "failed" ? latest : null);
      const ids = new Set(mine.map((task) => task.id));
      const lastEvent = events.find((event) => ids.has(event.task_id)) ?? null;
      const doneToday = mine.filter((task) => task.status === "completed" && task.completed_at && new Date(task.completed_at).toDateString() === today).length;
      return { ...agent, state, current, queued: queued.length, lastEvent, doneToday };
    });
  }

  function ago(value, now = Date.now()) {
    const minutes = Math.max(0, Math.round((now - new Date(value).getTime()) / 60000));
    if (minutes < 1) return "啱啱";
    if (minutes < 60) return `${minutes} 分鐘前`;
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `${hours} 小時前` : `${Math.round(hours / 24)} 日前`;
  }

  const label = (value) => String(value ?? "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

  const api = { STATES, deriveAgents, ago, label };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OfficeState = api;
})(typeof window !== "undefined" ? window : globalThis);
