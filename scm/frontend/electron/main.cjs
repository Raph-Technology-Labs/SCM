const { app, BrowserWindow, shell, dialog } = require("electron");
const path = require("path");
const { startBackend, stopBackend } = require("./backend.cjs");

const isDev = !app.isPackaged;
const frontendRoot = path.join(__dirname, "..");
const backendRoot = path.join(frontendRoot, "..", "backend");   // scm/backend

if (isDev) {
  try { require("dotenv").config({ path: path.join(frontendRoot, ".env") }); } catch {}
}

// On a hybrid-GPU Linux laptop (Intel + NVIDIA) running native Wayland,
// Chromium's GPU process can silently "succeed" (paints, fires ready-to-show)
// while the compositor never actually presents the window, if it lands on
// the NVIDIA render node. VS Code (also Electron) works around this on the
// exact same kind of machine by pinning to the Wayland ozone backend and
// explicitly overriding the render node to the first GPU (typically the
// integrated one). Harmless on a single-GPU machine or a real X11 session.
//
// Deliberately NOT setting --no-sandbox / --disable-dev-shm-usage here:
// testing on this machine showed the sandboxed broker process is what makes
// shared-memory setup work at all under Wayland; disabling it reproduced the
// same "window never appears" failure, and combined with the flags above it
// made things measurably worse (a runaway shared-memory error loop).
app.commandLine.appendSwitch("ozone-platform", "wayland");
app.commandLine.appendSwitch("render-node-override", "/dev/dri/renderD128");

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
    createSplash();
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