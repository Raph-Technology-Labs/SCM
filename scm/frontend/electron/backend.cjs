const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const net = require("net");
const http = require("http");

let proc = null;
let logStream = null;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function resolveCommand({ isPackaged, resourcesPath, backendRoot, port }) {
  if (isPackaged) {
    const bin = path.join(resourcesPath, "backend", "mv-backend");
    if (!fs.existsSync(bin)) throw new Error(`Backend binary missing: ${bin}`);
    return {
      cmd: bin,
      args: ["--host", "127.0.0.1", "--port", String(port)],
      cwd: path.join(resourcesPath, "backend"),
    };
  }

  // Dev: use the backend venv. Checks venv/ then .venv/, falls back to python3.
  const candidates = [
    path.join(backendRoot, "venv", "bin", "python"),
    path.join(backendRoot, ".venv", "bin", "python"),
  ];
  const py = candidates.find((p) => fs.existsSync(p)) || "python3";

  return {
    cmd: py,
    args: ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(port)],
    cwd: backendRoot,
  };
}

function waitForBackend(port, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const attempt = () => {
      const req = http.get(
        { host: "127.0.0.1", port, path: "/", timeout: 1500 },
        (res) => { res.resume(); resolve(res.statusCode < 500); }
      );
      req.on("error", () => {
        if (Date.now() > deadline) return resolve(false);
        setTimeout(attempt, 400);
      });
      req.on("timeout", () => req.destroy());
    };
    attempt();
  });
}

async function startBackend({ isPackaged, resourcesPath, backendRoot, logDir }) {
  const port = await getFreePort();
  const { cmd, args, cwd } = resolveCommand({ isPackaged, resourcesPath, backendRoot, port });

  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, "backend.log");
  logStream = fs.createWriteStream(logPath, { flags: "a" });
  logStream.write(`\n=== ${new Date().toISOString()} :: ${cmd} ${args.join(" ")} (cwd=${cwd}) ===\n`);

  proc = spawn(cmd, args, {
    cwd,
    detached: true,                      // own process group -> kill children too
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });

  proc.stdout.pipe(logStream);
  proc.stderr.pipe(logStream);
  proc.on("error", (e) => logStream?.write(`\nspawn error: ${e.message}\n`));
  proc.on("exit", (code, sig) => {
    logStream?.write(`\n=== exited code=${code} signal=${sig} ===\n`);
    proc = null;
  });

  const ok = await waitForBackend(port);
  if (!ok) {
    stopBackend();
    throw new Error(`Backend did not start on port ${port}.\n\nLog: ${logPath}`);
  }
  return { port, logPath };
}

function stopBackend() {
  if (!proc) return;
  const pid = proc.pid;
  try {
    process.kill(-pid, "SIGTERM");                                   // negative PID = group
    setTimeout(() => { try { process.kill(-pid, "SIGKILL"); } catch {} }, 5000);
  } catch {
    try { proc.kill("SIGKILL"); } catch {}
  }
  proc = null;
  logStream?.end();
  logStream = null;
}

module.exports = { startBackend, stopBackend };