const { app, BrowserWindow, shell, dialog } = require("electron");
const path = require("path");
const { startBackend, stopBackend } = require("./backend.cjs");

const isDev = !app.isPackaged;
const frontendRoot = path.join(__dirname, "..");
const backendRoot = path.join(frontendRoot, "..", "backend");   // scm/backend

if (isDev) {
  try { require("dotenv").config({ path: path.join(frontendRoot, ".env") }); } catch {}
}

// Remote/VM Linux boxes often have flaky GPU drivers -> white window.
// Remove these two lines if rendering feels sluggish on good hardware.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-dev-shm-usage");
app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("no-sandbox");

let mainWindow = null;
let splash = null;
let apiBaseUrl = null;

function createSplash() {
  splash = new BrowserWindow({
    width: 420, height: 220, frame: false, resizable: false,
    center: true, alwaysOnTop: true, show: true,
  });
  splash.loadFile(path.join(__dirname, "splash.html"));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1600, height: 900, show: false, autoHideMenuBar: true,
    icon: path.join(frontendRoot, "build-assets", "icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
      additionalArguments: [`--api-base-url=${apiBaseUrl}`],
    },
  });

  if (isDev) {
    mainWindow.loadURL(`http://localhost:${process.env.VITE_DEV_PORT || 5180}`);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(frontendRoot, "dist", "index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    splash?.destroy();
    splash = null;
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) =>
    console.error("Load failed:", url, code, desc));

  mainWindow.on("closed", () => { mainWindow = null; });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // createSplash();
    try {
      const { port } = await startBackend({
        isPackaged: app.isPackaged,
        resourcesPath: process.resourcesPath,
        backendRoot,
        logDir: app.getPath("logs"),
      });
      apiBaseUrl = `http://127.0.0.1:${port}`;
      createMainWindow();
    } catch (err) {
      splash?.destroy();
      dialog.showErrorBox("Startup failed", String(err.message || err));
      app.quit();
    }
  });
}

app.on("before-quit", stopBackend);
app.on("window-all-closed", () => {
  stopBackend();
  if (process.platform !== "darwin") app.quit();
});
process.on("exit", stopBackend);