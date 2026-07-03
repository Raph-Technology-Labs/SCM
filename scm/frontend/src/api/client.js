// Central API client. All backend calls go through here.
const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function request(path, { method = "GET", body, isForm = false } = {}) {
  const opts = { method, headers: {} };

  // identify the logged-in user (simple header-based auth, no JWT)
  try {
    const raw = localStorage.getItem("mv_user");
    if (raw) {
      const u = JSON.parse(raw);
      if (u?.user_id != null) opts.headers["X-User-Id"] = String(u.user_id);
    }
  } catch {
    /* ignore */
  }

  if (body && !isForm) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  } else if (isForm) {
    opts.body = body; // FormData; browser sets the boundary header
  }

  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data.detail) detail = data.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  login: (username, password) =>
    request("/auth/login", { method: "POST", body: { username, password } }),

  // AI models
  listModels: () => request("/ai-models"),
  addModel: (payload) => request("/ai-models", { method: "POST", body: payload }),

  // Parts
  listParts: () => request("/parts"),
  addPart: (payload) => request("/parts", { method: "POST", body: payload }),
  importPartsExcel: (file) => {
    const form = new FormData();
    form.append("file", file);
    return request("/parts/import-excel", { method: "POST", body: form, isForm: true });
  },

  // Sessions report
  listSessions: () => request("/sessions"),

  // Dashboard
  dashboardSummary: () => request("/dashboard/summary"),
  statusBreakdown: () => request("/dashboard/status-breakdown"),
  defectBreakdown: () => request("/dashboard/defect-breakdown"),
  timeseries: () => request("/dashboard/timeseries"),
  topParts: () => request("/dashboard/top-parts"),
};

// WebSocket URL for the realtime feed (http -> ws, https -> wss)
export const WS_URL = BASE.replace(/^http/, "ws") + "/ws/live";
