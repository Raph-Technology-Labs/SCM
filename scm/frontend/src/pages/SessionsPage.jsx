import { useEffect, useState } from "react";
import { api } from "../api/client";

function fmt(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d) ? ts : d.toLocaleString();
}

export default function SessionsPage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setRows(await api.listSessions());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Sessions</h1>
          <p className="page-sub">Inspection sessions, newest first.</p>
        </div>
      </div>

      {error && <div className="msg msg-error">{error}</div>}

      <div className="card">
        {loading ? (
          <div className="empty">Loading sessions…</div>
        ) : rows.length === 0 ? (
          <div className="empty">No sessions recorded yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th><th>Part</th><th>Count</th><th>Status</th><th>Started</th><th>Ended</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.id}</td>
                  <td>
                    <span className="mono">{s.part_code}</span> · {s.part_name}
                  </td>
                  <td className="mono">{s.part_count}</td>
                  <td>
                    {s.overall_status === "OK" && <span className="pill pill-ok">OK</span>}
                    {s.overall_status === "NOK" && <span className="pill pill-nok">NOK</span>}
                    {!s.overall_status && <span className="pill pill-muted">—</span>}
                  </td>
                  <td>{fmt(s.session_start)}</td>
                  <td>{fmt(s.session_end)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
