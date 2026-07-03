import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export default function PartsPage() {
  const { isAdmin } = useAuth();
  const [parts, setParts] = useState([]);
  const [models, setModels] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [p, m] = await Promise.all([api.listParts(), api.listModels()]);
        setParts(p);
        setModels(Object.fromEntries(m.map((x) => [x.model_id, x.model_name])));
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
          <h1 className="page-title">Parts</h1>
          <p className="page-sub">Registered parts and their linked inspection models.</p>
        </div>
        <Link to="/parts/new" className="btn btn-primary" style={isAdmin ? undefined : { display: "none" }}>Add new part</Link>
      </div>

      {error && <div className="msg msg-error">{error}</div>}

      <div className="card">
        {loading ? (
          <div className="empty">Loading parts…</div>
        ) : parts.length === 0 ? (
          <div className="empty">No parts yet. Add one to get started.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Mode</th>
                <th>Linked model</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.part_id}>
                  <td className="mono">{p.part_code}</td>
                  <td>{p.part_name}</td>
                  <td>{p.mode_of_operation}</td>
                  <td>
                    {p.ai_model_id ? (
                      <span className="mono">{models[p.ai_model_id] || `#${p.ai_model_id}`}</span>
                    ) : (
                      <span className="pill pill-muted">none</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
