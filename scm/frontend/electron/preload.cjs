const { contextBridge } = require("electron");

const arg = process.argv.find((a) => a.startsWith("--api-base-url="));
const apiBaseUrl = arg ? arg.split("=").slice(1).join("=") : null;

contextBridge.exposeInMainWorld("ipc", {
  isElectron: true,
  apiBaseUrl,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
});