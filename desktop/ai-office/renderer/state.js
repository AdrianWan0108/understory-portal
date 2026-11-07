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

  // Event board cards for the side panel. Counts and dates come from the
  // portal; this only picks the wording and what to show first.
  function shortDate(value) {
    return value ? `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}` : "";
  }
  function countdownText(board) {
    if (board.stage === "live") return "活動進行中";
    if (board.stage === "after") return "活動完咗，記得 follow up";
    if (board.days_to_start === 0) return "今日開始";
    return `仲有 ${board.days_to_start} 日`;
  }
  function itemText(item, extra) {
    return [item.title, [shortDate(item.due_date), item.owner, extra].filter(Boolean).join(" · ")];
  }
  function deriveEventBoards(snapshot) {
    return (snapshot?.event_boards ?? []).map((board) => ({
      id: board.plan_id,
      title: board.title,
      countdown: countdownText(board),
      percent: board.progress?.percent ?? 0,
      progressText: `${board.progress?.done ?? 0}/${board.progress?.total ?? 0} 完成`,
      sections: [
        { key: "blocked", title: "🔴 卡住", items: (board.blocked ?? []).map((item) => itemText(item, item.blocker)) },
        { key: "overdue", title: "⚠️ 過咗期", items: (board.overdue ?? []).map((item) => itemText(item)) },
        { key: "due_soon", title: "⏰ 3 日內到期", items: (board.due_soon ?? []).map((item) => itemText(item)) },
        { key: "waiting", title: "⏳ 等緊人", items: (board.waiting ?? []).map((item) => itemText(item, item.waiting_on && `等 ${item.waiting_on}`)) },
      ].filter((section) => section.items.length),
      owners: (board.owners ?? []).map((entry) => ({ owner: entry.owner, open: entry.open, next: entry.next?.[0]?.title ?? "" })),
    }));
  }

  const api = { STATES, deriveAgents, deriveEventBoards, ago, label };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OfficeState = api;
})(typeof window !== "undefined" ? window : globalThis);
