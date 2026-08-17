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

  // Dev: BACKEND_PYTHON from .env, else a venv inside backend/.
  // NO bare "python3" fallback — system Python lacks fastapi and the
  // resulting ModuleNotFoundError is far more confusing than a clear throw.
  const py =
    (process.env.BACKEND_PYTHON && process.env.BACKEND_PYTHON.trim()) ||
    [
      path.join(backendRoot, "venv", "bin", "python"),
      path.join(backendRoot, ".venv", "bin", "python"),
    ].find((p) => fs.existsSync(p));

  if (!py || !fs.existsSync(py)) {
    throw new Error(
      `Python interpreter not found.\n\n` +
      `Set BACKEND_PYTHON in frontend/.env to your venv's python.\n` +
      `Find it with:  vision_env && which python\n\n` +
      `Tried: ${py || "(nothing configured)"}`
    );
  }

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

  logStream.write(`\n=== ${new Date().toISOString()} ===\n`);
  logStream.write(`interpreter: ${cmd}\n`);
  logStream.write(`args: ${args.join(" ")}\n`);
  logStream.write(`cwd: ${cwd}\n`);
  logStream.write(`port: ${port}\n\n`);

  // Also to the terminal, so you see it without opening the log
  console.log(`[backend] ${cmd} ${args.join(" ")}`);
  console.log(`[backend] log: ${logPath}`);

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