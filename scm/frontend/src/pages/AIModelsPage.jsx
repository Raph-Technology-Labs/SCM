import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export default function AIModelsPage() {
  const { isAdmin } = useAuth();
  const [models, setModels] = useState([]);
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setModels(await api.listModels());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setError("");
    try {
      await api.addModel({ model_name: name.trim(), model_path: path.trim() || null });
      setName(""); setPath("");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">AI models</h1>
          <p className="page-sub">The model registry. A name like <span className="mono">bolt</span> maps to <span className="mono">bolt.pt</span> on the backend.</p>
        </div>
      </div>

      {error && <div className="msg msg-error">{error}</div>}

      {isAdmin && (
      <form className="card" onSubmit={handleAdd}>
        <h3>Add new AI model</h3>
        <div className="grid-2">
          <div className="field">
            <label>Model name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="bolt" />
          </div>
          <div className="field">
            <label>Weights file (optional)</label>
            <input className="mono" value={path} onChange={(e) => setPath(e.target.value)} placeholder="bolt.pt" />
          </div>
        </div>
        <button className="btn btn-primary">Save model</button>
      </form>
      )}

      <div className="card">
        {loading ? (
          <div className="empty">Loading models…</div>
        ) : models.length === 0 ? (
          <div className="empty">No models registered yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>ID</th><th>Name</th><th>Weights file</th><th>Active</th></tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.model_id}>
                  <td className="mono">{m.model_id}</td>
                  <td className="mono">{m.model_name}</td>
                  <td className="mono">{m.model_path}</td>
                  <td>
                    <span className={"pill " + (m.is_active ? "pill-ok" : "pill-muted")}>
                      {m.is_active ? "active" : "inactive"}
                    </span>
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
