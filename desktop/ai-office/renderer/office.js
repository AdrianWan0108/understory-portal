// Pixel art office. Everything is drawn on a 320x200 grid and scaled up by a
// whole number, so each "pixel" stays a crisp square.
(function () {
  const { STATES, deriveAgents, ago, label } = window.OfficeState;
  const W = 320, H = 200, POLL_MS = 10000;
  const canvas = document.getElementById("office");
  const ctx = canvas.getContext("2d");
  const tooltip = document.getElementById("tooltip");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let S = 3;

  const looks = {
    operations: { shirt: "#7d4fa8", hair: "#2b1e2f", skin: "#f1c9a5", prop: "headset" },
    content: { shirt: "#d2648a", hair: "#6b3a22", skin: "#e8b48e", prop: "pen" },
    research: { shirt: "#3f8aa0", hair: "#1f1b24", skin: "#f4d3b5", prop: "glasses" },
    creative: { shirt: "#e0913f", hair: "#3b2a4a", skin: "#c98e66", prop: "beret" },
    growth: { shirt: "#46a067", hair: "#8a5a2b", skin: "#f0c29c", prop: "tie" },
  };
  const extraLooks = [
    { shirt: "#5c7bd6", hair: "#3a2a1e", skin: "#e9be98", prop: "none" },
    { shirt: "#b8566a", hair: "#151018", skin: "#d6a07a", prop: "none" },
  ];
  const lookFor = (agent, index) => looks[agent.visual_key] ?? looks[agent.key] ?? extraLooks[index % extraLooks.length];

  // Desk tops; the agent's seat is just behind the middle of each desk.
  const desks = [{ x: 22, y: 78 }, { x: 92, y: 78 }, { x: 162, y: 78 }, { x: 22, y: 128 }, { x: 92, y: 128 }, { x: 162, y: 128 }];
  const seat = (desk) => ({ x: desk.x + 22, y: desk.y + 4 });
  const lounge = [{ x: 52, y: 189 }, { x: 72, y: 189 }, { x: 146, y: 186 }, { x: 178, y: 186 }, { x: 112, y: 184 }, { x: 206, y: 184 }];
  const meeting = [{ x: 262, y: 100 }, { x: 280, y: 100 }, { x: 298, y: 100 }, { x: 262, y: 138 }, { x: 280, y: 138 }, { x: 298, y: 138 }];
  const CORRIDOR = 168, AISLES = [10, 82, 152, 224];
  const aisleNear = (x) => x >= 238 ? x : AISLES.reduce((best, aisle) => Math.abs(aisle - x) < Math.abs(best - x) ? aisle : best);

  let snapshot = null, desksState = [], people = new Map(), selected = null, hovered = null, tick = 0;

  // ---------- drawing helpers ----------
  const px = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  function text(value, x, y, size, color, align = "left", weight = "700") {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `${weight} ${size * S}px -apple-system, "PingFang HK", "Helvetica Neue", sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.fillStyle = color;
    ctx.fillText(value, Math.round(x * S), Math.round(y * S));
    ctx.restore();
  }

  function drawRoom(now) {
    // Back wall with window, sign and clock.
    px(0, 0, W, 44, "#4a3566");
    for (let x = 0; x < W; x += 8) px(x, 0, 1, 42, "#433060");
    px(0, 40, W, 4, "#2f2142");
    const hour = now.getHours();
    const sky = hour >= 7 && hour < 17 ? "#8ecae6" : hour >= 17 && hour < 19 ? "#f4a261" : "#1d2a4a";
    px(12, 8, 56, 24, "#2f2142"); px(14, 10, 52, 20, sky);
    if (sky === "#1d2a4a") [[20, 14], [34, 22], [48, 13], [58, 24], [27, 26]].forEach(([x, y]) => px(x, y, 1, 1, "#fff6c2"));
    else { px(22, 16, 10, 3, "#ffffff"); px(25, 14, 5, 2, "#ffffff"); px(46, 22, 12, 3, "#ffffff"); }
    px(39, 10, 2, 20, "#2f2142"); px(14, 19, 52, 2, "#2f2142");
    px(96, 12, 118, 16, "#2f2142");
    text("UNDERSTORY & CO.  AI OFFICE", 155, 20, 5.5, "#e8d8ff", "center");
    px(240, 10, 30, 14, "#1a1324");
    text(now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), 255, 17, 5.5, "#5fd38a", "center");
    // Wooden floor, carpet in the meeting room.
    px(0, 44, 236, H - 44, "#bb9163");
    for (let y = 44; y < H; y += 8) for (let x = -12; x < 236; x += 24) px(x + (y / 8 % 2) * 12, y, 23, 7, y / 8 % 2 ? "#c49a6c" : "#bb9163");
    px(0, 44, 236, 1, "#9b734c");
    px(240, 44, 80, H - 44, "#5d4280");
    for (let y = 48; y < H; y += 6) for (let x = 242; x < W; x += 6) px(x, y, 1, 1, "#6a4d8f");
    // Partition with a door gap at the corridor.
    px(236, 44, 4, CORRIDOR - 58, "#2f2142"); px(236, CORRIDOR + 10, 4, H - CORRIDOR - 10, "#2f2142");
    text("會議室", 246, 52, 6, "#f2e7ff");
    // Meeting table and chairs.
    px(254, 110, 52, 16, "#8b5e3c"); px(254, 124, 52, 3, "#6b4529");
    // Lounge: sofa, coffee bar, plants.
    px(40, 182, 44, 12, "#7d4fa8"); px(40, 178, 44, 5, "#6a4090"); px(37, 180, 4, 14, "#5d377f"); px(83, 180, 4, 14, "#5d377f");
    px(132, 170, 58, 10, "#6b4529"); px(132, 168, 58, 3, "#8b5e3c");
    px(138, 158, 10, 10, "#333038"); px(140, 160, 6, 3, "#ff6b6b");
    px(170, 160, 6, 8, "#ffffff"); px(172, 158, 2, 2, "#d6d0dc");
    [[2, 52], [222, 52], [222, 186], [306, 186]].forEach(([x, y]) => { px(x + 2, y + 6, 8, 7, "#a0522d"); px(x, y, 12, 7, "#3e8a5a"); px(x + 3, y - 3, 6, 4, "#52a86f"); });
  }

  function drawDesk(desk, info, index) {
    const { x, y } = desk;
    px(x, y, 44, 12, "#8b5e3c"); px(x, y + 10, 44, 2, "#6b4529");
    px(x + 2, y + 12, 3, 6, "#5a3a22"); px(x + 39, y + 12, 3, 6, "#5a3a22");
    // Side monitor showing what the agent is up to.
    const state = info?.state ?? "empty";
    px(x + 31, y - 9, 12, 9, "#1a1324");
    const screen = state === "working" ? "#1e4d33" : state === "failed" ? "#4d1e1e" : state === "waiting" ? "#4d4220" : "#232030";
    px(x + 32, y - 8, 10, 7, screen);
    if (state === "working") for (let line = 0; line < 3; line++) px(x + 33, y - 7 + line * 2, 2 + ((tick / 6 + line * 3 + index) % 7), 1, "#5fd38a");
    if (state === "failed") px(x + 36, y - 6, 2, 3, "#ff6b6b");
    px(x + 36, y, 2, 1, "#1a1324");
    // Laptop facing the agent; its lid faces us and glows while working.
    px(x + 15, y - 5, 14, 6, state === "working" ? "#d9d4e3" : "#a49cb3");
    px(x + 21, y - 3, 2, 2, state === "working" ? (tick % 30 < 15 ? "#5fd38a" : "#8af0ae") : "#7a7189");
    // Mug and paper for a lived-in look.
    px(x + 4, y + 2, 3, 3, "#ffffff"); px(x + 8, y + 3, 5, 3, "#efe7d2");
    if (!info) return;
    text(info.name.replace(/ Agent$/, ""), x + 22, y + 7, 4.5, "#fff6e0", "center");
    if (state === "paused") { px(x + 10, y - 14, 24, 9, "#fff6c2"); text("暫停", x + 22, y - 9.5, 5, "#2a1d36", "center"); }
  }

  function drawPerson(person, look) {
    const { x, y } = person;
    const top = y - 17;
    const walking = person.moving;
    const step = walking ? Math.floor(tick / 8) % 2 : 0;
    const asleep = person.state === "idle" && !walking;
    // Legs and shoes.
    px(x - 3, top + 13, 2, 3 + (step ? -1 : 0), "#2d2638"); px(x + 1, top + 13, 2, 3 + (step ? 0 : -1), "#2d2638");
    px(x - 3, top + 16 + (step ? -1 : 0), 3, 1, "#120d18"); px(x + 1, top + 16 + (step ? 0 : -1), 3, 1, "#120d18");
    // Body and arms; typing arms bob while working.
    const bob = person.state === "working" && !walking && !reducedMotion ? Math.floor(tick / 5) % 2 : 0;
    px(x - 4, top + 8, 8, 5, look.shirt);
    const typing = person.state === "working" && !walking;
    px(x - 5, top + 9 - bob, 1, 4, look.shirt); px(x + 4, top + 9 - (typing ? 1 - bob : 0), 1, 4, look.shirt);
    px(x - 5, top + 13 - bob, 1, 1, look.skin); px(x + 4, top + 13, 1, 1, look.skin);
    if (look.prop === "tie") px(x - 0.5, top + 8, 1, 4, "#1d4d2f");
    // Head.
    px(x - 3, top + 2, 6, 6, look.skin);
    px(x - 4, top, 8, 3, look.hair); px(x - 4, top + 3, 1, 3, look.hair); px(x + 3, top + 3, 1, 3, look.hair);
    if (asleep) { px(x - 2, top + 5, 2, 1, "#2a1e26"); px(x + 1, top + 5, 2, 1, "#2a1e26"); }
    else { px(x - 2, top + 4, 1, 2, "#2a1e26"); px(x + 1, top + 4, 1, 2, "#2a1e26"); }
    px(x - 1, top + 7, 2, 1, person.state === "failed" ? "#7a2f2f" : "#b5574b");
    if (look.prop === "glasses") { px(x - 3, top + 4, 3, 1, "#1a1324"); px(x, top + 4, 3, 1, "#1a1324"); }
    if (look.prop === "headset") { px(x - 4, top - 1, 8, 1, "#1a1324"); px(x - 5, top + 3, 1, 3, "#1a1324"); px(x - 4, top + 6, 2, 1, "#1a1324"); }
    if (look.prop === "beret") { px(x - 4, top - 2, 8, 2, "#c0394b"); px(x - 1, top - 3, 2, 1, "#c0394b"); }
    if (look.prop === "pen") px(x + 4, top + 1, 1, 4, "#f2c14e");
  }

  function drawBubble(person) {
    if (person.moving) return;
    const { x } = person;
    const y = person.y - 30;
    const state = person.state;
    const content = state === "working" ? "dots" : state === "waiting" ? "!" : state === "queued" ? String(person.queued || "…") : state === "failed" ? "×" : state === "idle" ? "z" : null;
    if (!content) return;
    const color = STATES[state]?.color ?? "#ffffff";
    px(x - 6, y, 12, 9, "#120d18"); px(x - 5, y + 1, 10, 7, "#fffbe9"); px(x - 1, y + 9, 2, 2, "#120d18"); px(x - 1, y + 8, 2, 1, "#fffbe9");
    if (content === "dots") for (let dot = 0; dot < 3; dot++) { const on = reducedMotion || Math.floor(tick / 10) % 4 > dot; px(x - 4 + dot * 3, y + 4, 2, 2, on ? "#2e6a40" : "#c8c2d0"); }
    else if (content === "z") text(Math.floor(tick / 30) % 2 ? "z" : "z z", x, y + 4.6, 4.5, "#7a6a8a", "center");
    else text(content, x, y + 4.6, 6, state === "waiting" ? "#b07a10" : state === "failed" ? "#c0392b" : "#34508a", "center", "800");
    px(x + 5, y - 1, 2, 2, color);
  }

  function drawPeopleTag(person) {
    if (person.atDesk) return;
    text(person.name.replace(/ Agent$/, ""), person.x, person.y + 4, 4.2, "#fff6e0", "center");
  }

  // ---------- movement ----------
  function targetFor(info, index, counters) {
    if (info.state === "paused") return null;
    if (info.state === "waiting") return meeting[counters.meeting++ % meeting.length];
    if (info.state === "idle") return lounge[counters.lounge++ % lounge.length];
    return desks[index] ? seat(desks[index]) : lounge[counters.lounge++ % lounge.length];
  }

  function routeTo(person, target) {
    const from = { x: person.x, y: person.y };
    const fromAisle = aisleNear(from.x), toAisle = aisleNear(target.x);
    const points = [{ x: fromAisle, y: from.y }, { x: fromAisle, y: CORRIDOR }, { x: toAisle, y: CORRIDOR }, { x: toAisle, y: target.y }, target];
    person.path = points.filter((point, i) => i === points.length - 1 || point.x !== (points[i - 1] ?? from).x || point.y !== (points[i - 1] ?? from).y);
    person.target = target;
  }

  function syncPeople() {
    const counters = { meeting: 0, lounge: 0 };
    const seen = new Set();
    desksState.forEach((info, index) => {
      seen.add(info.key);
      const target = targetFor(info, index, counters);
      let person = people.get(info.key);
      if (!person) {
        const start = target ?? { x: 230, y: CORRIDOR };
        person = { key: info.key, x: start.x, y: start.y, path: [], target: start, moving: false, index };
        people.set(info.key, person);
      }
      Object.assign(person, { name: info.name, state: info.state, queued: info.queued, index, away: !target });
      if (target && (person.target.x !== target.x || person.target.y !== target.y)) routeTo(person, target);
    });
    for (const key of people.keys()) if (!seen.has(key)) people.delete(key);
  }

  function step() {
    for (const person of people.values()) {
      const next = person.path[0];
      person.moving = Boolean(next);
      if (!next) { person.atDesk = desks[person.index] && person.x === seat(desks[person.index]).x && person.y === seat(desks[person.index]).y; continue; }
      person.atDesk = false;
      const speed = reducedMotion ? 100 : 0.8;
      const dx = next.x - person.x, dy = next.y - person.y;
      if (Math.abs(dx) <= speed && Math.abs(dy) <= speed) { person.x = next.x; person.y = next.y; person.path.shift(); }
      else if (Math.abs(dx) > speed) person.x += Math.sign(dx) * speed;
      else person.y += Math.sign(dy) * speed;
    }
  }

  // ---------- frame ----------
  function frame() {
    tick++;
    step();
    const now = new Date();
    ctx.setTransform(S, 0, 0, S, 0, 0);
    ctx.imageSmoothingEnabled = false;
    drawRoom(now);
    // Depth sort desks and people by their base line so desks hide seated legs.
    const items = desks.map((desk, index) => ({ depth: desk.y + 6, draw: () => drawDesk(desk, desksState[index], index) }));
    for (const person of people.values()) {
      if (person.away && !person.moving) continue;
      const info = desksState[person.index];
      items.push({ depth: person.y, draw: () => { drawPerson(person, lookFor(info, person.index)); if (selected === person.key || hovered === person.key) px(person.x - 5, person.y + 1, 10, 1, "#c9a4ff"); } });
    }
    items.sort((a, b) => a.depth - b.depth).forEach((item) => item.draw());
    for (const person of people.values()) if (!person.away || person.moving) { drawBubble(person); drawPeopleTag(person); }
    const pending = snapshot?.pending_approvals?.length ?? 0;
    if (pending) { px(276, 46, 40, 11, "#f2c14e"); px(276, 57, 40, 2, "#b07a10"); text(`等你批 ${pending}`, 296, 51.5, 5, "#2a1d06", "center", "800"); }
    if (!snapshot) text("連接緊 portal…", 118, 110, 7, "#fff6e0", "center");
    window.requestAnimationFrame(frame);
  }

  function resize() {
    const box = canvas.parentElement.getBoundingClientRect();
    // Fill the space; the backing store stays a whole multiple of the grid.
    const fit = Math.min((box.width - 24) / W, (box.height - 24) / H);
    S = Math.max(2, Math.ceil(fit * devicePixelRatio));
    canvas.width = W * S; canvas.height = H * S;
    canvas.style.width = `${Math.floor(W * fit)}px`; canvas.style.height = `${Math.floor(H * fit)}px`;
  }

  // ---------- interaction ----------
  function personAt(event) {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * W, y = (event.clientY - rect.top) / rect.height * H;
    for (const person of people.values()) {
      if (person.away && !person.moving) continue;
      if (Math.abs(x - person.x) <= 6 && y >= person.y - 20 && y <= person.y + 2) return person;
    }
    const deskIndex = desks.findIndex((desk) => x >= desk.x && x <= desk.x + 44 && y >= desk.y - 14 && y <= desk.y + 18);
    return deskIndex >= 0 && desksState[deskIndex] ? people.get(desksState[deskIndex].key) : null;
  }
  const infoFor = (key) => desksState.find((info) => info.key === key);
  function openAgent(key) {
    const info = infoFor(key);
    if (!info) return;
    selected = key; renderPanel();
    void window.office.open(info.current?.portal_deep_link ?? `/team-hub/ai-workspace/tasks?agent=${encodeURIComponent(info.key)}`);
  }
  canvas.addEventListener("mousemove", (event) => {
    const person = personAt(event);
    hovered = person?.key ?? null;
    canvas.classList.toggle("clickable", Boolean(person));
    const info = person && infoFor(person.key);
    if (!info) { tooltip.hidden = true; return; }
    tooltip.replaceChildren();
    const title = document.createElement("strong"); title.textContent = `${info.name} · ${STATES[info.state].label}`;
    const body = document.createElement("div");
    body.textContent = info.current ? `${info.current.title}${info.current.current_stage ? ` — ${label(info.current.current_stage)}` : ""}` : info.state === "paused" ? "暫停中" : "冇手頭嘢做";
    tooltip.append(title, body);
    const host = canvas.parentElement.getBoundingClientRect();
    tooltip.style.left = `${Math.min(event.clientX - host.left + 14, host.width - 270)}px`;
    tooltip.style.top = `${event.clientY - host.top + 14}px`;
    tooltip.hidden = false;
  });
  canvas.addEventListener("mouseleave", () => { hovered = null; tooltip.hidden = true; });
  canvas.addEventListener("click", (event) => { const person = personAt(event); if (person) openAgent(person.key); });

  // ---------- side panel ----------
  const el = (tag, className, content) => { const node = document.createElement(tag); if (className) node.className = className; if (content !== undefined) node.textContent = content; return node; };
  function renderPanel() {
    const agentsList = document.getElementById("agents");
    agentsList.replaceChildren(...desksState.map((info) => {
      const button = el("button", `agent${selected === info.key ? " selected" : ""}`);
      button.type = "button";
      const top = el("span", "agent-top"); top.append(el("span", "", info.name));
      const state = el("span", "agent-state"); const swatch = el("i"); swatch.style.background = STATES[info.state].color; state.append(swatch, STATES[info.state].label); top.append(state);
      const taskLine = el("span", "agent-task", info.current ? info.current.title : info.state === "paused" ? "暫停中，唔會接新 task" : "冇手頭嘢做");
      const meta = el("span", "agent-meta", [info.current?.current_stage ? label(info.current.current_stage) : null, `排隊 ${info.queued}`, `今日完成 ${info.doneToday}`].filter(Boolean).join(" · "));
      button.append(top, taskLine, meta);
      button.addEventListener("click", () => openAgent(info.key));
      button.addEventListener("mouseenter", () => { hovered = info.key; });
      button.addEventListener("mouseleave", () => { hovered = null; });
      return el("li").appendChild(button).parentNode;
    }));
    const working = desksState.filter((info) => info.state === "working").length;
    document.getElementById("summary").textContent = snapshot ? `${working} / ${desksState.length} 個 AI 員工做緊嘢` : "";
    const pending = snapshot?.pending_approvals?.length ?? 0;
    const approvals = document.getElementById("approvals");
    approvals.hidden = !pending; approvals.textContent = `✋ 有 ${pending} 樣嘢等你批，撳入去睇`;
    const tasks = new Map((snapshot?.tasks ?? []).map((task) => [task.id, task]));
    const names = new Map(desksState.map((info) => [info.key, info.name]));
    const feed = document.getElementById("feed");
    const events = (snapshot?.events ?? []).slice(0, 15);
    feed.replaceChildren(...(events.length ? events.map((event) => {
      const task = tasks.get(event.task_id);
      const item = el("li"); const button = el("button", "", event.summary);
      button.type = "button"; button.addEventListener("click", () => void window.office.open(task?.portal_deep_link ?? `/team-hub/ai-workspace/tasks/${event.task_id}`));
      item.append(button, el("small", "", [names.get(task?.assigned_agent) ?? "AI", task?.title, ago(event.created_at)].filter(Boolean).join(" · ")));
      return item;
    }) : [el("li", "", "未有 activity。")]));
  }
  document.getElementById("approvals").addEventListener("click", () => void window.office.open("/team-hub/ai-workspace/approvals"));

  // ---------- data ----------
  function setStatus(kind, message) {
    const status = document.getElementById("status");
    status.className = `status ${kind}`;
    document.getElementById("status-text").textContent = message;
  }
  async function refresh() {
    const result = await window.office.snapshot();
    if (result.error === "not_configured") { setStatus("bad", "未連接"); showSettings(); return; }
    if (result.error === "bad_token") { setStatus("bad", "Token 唔啱"); showSettings("Token 唔啱，請再貼一次。"); return; }
    if (result.error) { setStatus("bad", `連唔到 portal（${result.error}）`); return; }
    snapshot = result.data;
    desksState = deriveAgents(snapshot);
    syncPeople(); renderPanel();
    setStatus("ok", `每 10 秒更新 · ${new Date().toLocaleTimeString("en-GB")}`);
  }

  const settings = document.getElementById("settings");
  async function showSettings(message = "") {
    const config = await window.office.getConfig();
    document.getElementById("portal-url").value = config.portalUrl;
    document.getElementById("token").placeholder = config.hasToken ? "已儲存（留空就唔改）" : "AI_OFFICE_TOKEN";
    const error = document.getElementById("settings-error");
    error.textContent = message; error.hidden = !message;
    settings.hidden = false;
  }
  document.getElementById("settings-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = document.getElementById("settings-error");
    try {
      await window.office.saveConfig({ portalUrl: document.getElementById("portal-url").value, token: document.getElementById("token").value });
      document.getElementById("token").value = "";
      settings.hidden = true;
      await refresh();
    } catch (caught) { error.textContent = String(caught?.message ?? caught).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""); error.hidden = false; }
  });
  document.getElementById("settings-cancel").addEventListener("click", () => { settings.hidden = true; });
  document.getElementById("settings-button").addEventListener("click", () => void showSettings());
  window.office.onShowSettings(() => void showSettings());
  window.office.onRefresh(() => void refresh());

  window.addEventListener("resize", resize);
  window.addEventListener("focus", () => void refresh());
  resize();
  window.requestAnimationFrame(frame);
  void refresh();
  window.setInterval(() => void refresh(), POLL_MS);
})();
