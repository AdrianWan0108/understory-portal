const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("office", {
  getConfig: () => ipcRenderer.invoke("office:get-config"),
  saveConfig: (input) => ipcRenderer.invoke("office:save-config", input),
  snapshot: () => ipcRenderer.invoke("office:snapshot"),
  open: (link) => ipcRenderer.invoke("office:open", link),
  onShowSettings: (callback) => ipcRenderer.on("office:show-settings", () => callback()),
  onRefresh: (callback) => ipcRenderer.on("office:refresh", () => callback()),
});
