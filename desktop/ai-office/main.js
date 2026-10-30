// AI Office: a small always-available window that polls the portal's
// read-only /api/ai/office snapshot. All network calls happen here in the main
// process, so the token never reaches page script and CORS does not apply.
const { app, BrowserWindow, ipcMain, Menu, net, protocol, safeStorage, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

// The window is served from office://app/ rather than file:// so the 3D
// scene can load three.js as an ES module.
protocol.registerSchemesAsPrivileged([{ scheme: "office", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const roots = [["/vendor/three/", path.join(__dirname, "node_modules", "three", "build")], ["/", path.join(__dirname, "renderer")]];
function serveOffice(request) {
  const { pathname } = new URL(request.url);
  const [prefix, root] = roots.find(([candidate]) => pathname.startsWith(candidate));
  const file = path.join(root, decodeURIComponent(pathname.slice(prefix.length)));
  if (path.relative(root, file).startsWith("..")) return new Response("Not found", { status: 404 });
  return net.fetch(pathToFileURL(file).toString());
}

const configPath = () => path.join(app.getPath("userData"), "office.json");

function readConfig() {
  try { return JSON.parse(fs.readFileSync(configPath(), "utf8")); } catch { return {}; }
}
function writeConfig(config) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), { mode: 0o600 });
}
function readToken(config) {
  if (!config.token) return "";
  try { return config.encrypted ? safeStorage.decryptString(Buffer.from(config.token, "base64")) : config.token; } catch { return ""; }
}
function normalizeOrigin(value) {
  const url = new URL(String(value).trim());
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Portal URL must start with https://");
  return url.origin;
}

let win;
function createWindow() {
  const config = readConfig();
  win = new BrowserWindow({
    width: 1180, height: 720, minWidth: 900, minHeight: 560,
    title: "AI Office", backgroundColor: "#1d1528", alwaysOnTop: Boolean(config.alwaysOnTop),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.loadURL("office://app/index.html");
  buildMenu();
}

function buildMenu() {
  const config = readConfig();
  const login = app.getLoginItemSettings().openAtLogin;
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: "appMenu" },
    { label: "Office", submenu: [
      { label: "Always on top", type: "checkbox", checked: Boolean(config.alwaysOnTop), click: (item) => { writeConfig({ ...readConfig(), alwaysOnTop: item.checked }); win?.setAlwaysOnTop(item.checked); } },
      { label: "Open at login", type: "checkbox", checked: login, click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }) },
      { type: "separator" },
      { label: "Connection settings…", click: () => win?.webContents.send("office:show-settings") },
      { label: "Refresh now", accelerator: "CmdOrCtrl+R", click: () => win?.webContents.send("office:refresh") },
    ] },
    { role: "editMenu" },
    { role: "windowMenu" },
  ]));
}

ipcMain.handle("office:get-config", () => {
  const config = readConfig();
  return { portalUrl: config.portalUrl ?? "", hasToken: Boolean(readToken(config)) };
});

ipcMain.handle("office:save-config", (_event, input) => {
  const portalUrl = normalizeOrigin(input?.portalUrl ?? "");
  const config = { ...readConfig(), portalUrl };
  const token = String(input?.token ?? "").trim();
  if (token) {
    const encrypted = safeStorage.isEncryptionAvailable();
    config.token = encrypted ? safeStorage.encryptString(token).toString("base64") : token;
    config.encrypted = encrypted;
  }
  writeConfig(config);
  return { portalUrl, hasToken: Boolean(readToken(config)) };
});

ipcMain.handle("office:snapshot", async () => {
  const config = readConfig();
  const token = readToken(config);
  if (!config.portalUrl || !token) return { error: "not_configured" };
  try {
    const response = await fetch(`${config.portalUrl}/api/ai/office`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) return { error: "bad_token" };
    if (!response.ok) return { error: body.error ?? `Portal returned ${response.status}` };
    return { data: body };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Network error" };
  }
});

// Only links back into the configured portal are opened, in the default browser.
ipcMain.handle("office:open", (_event, link) => {
  const { portalUrl } = readConfig();
  if (!portalUrl || typeof link !== "string") return;
  const url = new URL(link, portalUrl);
  if (url.origin === portalUrl) void shell.openExternal(url.toString());
});

app.whenReady().then(() => {
  protocol.handle("office", serveOffice);
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
