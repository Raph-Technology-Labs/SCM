import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

const MODES = ["Counting", "Defect Detection", "Measurement"];

export default function AddPartPage() {
  const navigate = useNavigate();
  const [models, setModels] = useState([]);
  const [form, setForm] = useState({
    part_code: "",
    part_name: "",
    ai_model_id: "",
    mode_of_operation: "Counting",
    part_weight: "",
    part_inner_diameter: "",
    part_outer_diameter: "",
    part_co_planarity: false,
    part_parallelity: false,
    part_concentricity: false,
  });
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  // inline "add new AI model"
  const [showAddModel, setShowAddModel] = useState(false);
  const [newModelName, setNewModelName] = useState("");
  const [newModelPath, setNewModelPath] = useState("");

  // excel import
  const [file, setFile] = useState(null);
  const [importMsg, setImportMsg] = useState("");

  async function loadModels() {
    try {
      setModels(await api.listModels());
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => { loadModels(); }, []);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toNum(v) {
    return v === "" || v === null ? null : Number(v);
  }

  async function handleAddModel() {
    if (!newModelName.trim()) return;
    setError("");
    try {
      const created = await api.addModel({
        model_name: newModelName.trim(),
        model_path: newModelPath.trim() || null,
      });
      await loadModels();
      set("ai_model_id", String(created.model_id));
      setShowAddModel(false);
      setNewModelName("");
      setNewModelPath("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setOk(""); setBusy(true);
    try {
      await api.addPart({
        part_code: form.part_code.trim(),
        part_name: form.part_name.trim(),
        ai_model_id: form.ai_model_id ? Number(form.ai_model_id) : null,
        mode_of_operation: form.mode_of_operation,
        part_weight: toNum(form.part_weight),
        part_inner_diameter: toNum(form.part_inner_diameter),
        part_outer_diameter: toNum(form.part_outer_diameter),
        part_co_planarity: form.part_co_planarity,
        part_parallelity: form.part_parallelity,
        part_concentricity: form.part_concentricity,
      });
      setOk(`Part "${form.part_code}" added.`);
      setTimeout(() => navigate("/parts"), 700);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    if (!file) return;
    setImportMsg(""); setError("");
    try {
      const r = await api.importPartsExcel(file);
      setImportMsg(
        `Imported ${r.created_parts} parts, created ${r.created_models} models, linked ${r.linked_parts}.` +
          (r.errors?.length ? ` ${r.errors.length} row(s) skipped.` : "")
      );
      await loadModels();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Add new part</h1>
          <p className="page-sub">Register a part and link it to the AI model used for inspection.</p>
        </div>
      </div>

      {error && <div className="msg msg-error">{error}</div>}
      {ok && <div className="msg msg-ok">{ok}</div>}

      <form className="card" onSubmit={handleSubmit}>
        <h3>Part details</h3>
        <div className="grid-2">
          <div className="field">
            <label>Part code</label>
            <input value={form.part_code} onChange={(e) => set("part_code", e.target.value)} required />
          </div>
          <div className="field">
            <label>Part name</label>
            <input value={form.part_name} onChange={(e) => set("part_name", e.target.value)} required />
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label>Mode of operation</label>
            <select value={form.mode_of_operation} onChange={(e) => set("mode_of_operation", e.target.value)}>
              {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="field">
            <label>AI model</label>
            <div className="row-actions">
              <select value={form.ai_model_id} onChange={(e) => set("ai_model_id", e.target.value)} style={{ flex: 1 }}>
                <option value="">— none —</option>
                {models.map((m) => (
                  <option key={m.model_id} value={m.model_id}>
                    {m.model_name} ({m.model_path})
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-ghost" onClick={() => setShowAddModel((s) => !s)}>
                Add new AI model
              </button>
            </div>
          </div>
        </div>

        {showAddModel && (
          <div className="inline-add">
            <div className="grid-2">
              <div className="field">
                <label>Model name (linking name, e.g. bolt)</label>
                <input value={newModelName} onChange={(e) => setNewModelName(e.target.value)} />
              </div>
              <div className="field">
                <label>Weights file (optional, defaults to name.pt)</label>
                <input className="mono" placeholder="bolt.pt" value={newModelPath} onChange={(e) => setNewModelPath(e.target.value)} />
              </div>
            </div>
            <button type="button" className="btn btn-primary" onClick={handleAddModel}>Save model</button>
          </div>
        )}

        <h3 style={{ marginTop: 22 }}>Dimensions</h3>
        <div className="grid-2">
          <div className="field">
            <label>Weight</label>
            <input type="number" step="any" value={form.part_weight} onChange={(e) => set("part_weight", e.target.value)} />
          </div>
          <div className="field">
            <label>Inner diameter</label>
            <input type="number" step="any" value={form.part_inner_diameter} onChange={(e) => set("part_inner_diameter", e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Outer diameter</label>
          <input type="number" step="any" value={form.part_outer_diameter} onChange={(e) => set("part_outer_diameter", e.target.value)} />
        </div>

        <h3 style={{ marginTop: 22 }}>Geometry checks</h3>
        <div className="checks">
          <label><input type="checkbox" checked={form.part_co_planarity} onChange={(e) => set("part_co_planarity", e.target.checked)} /> Co-planarity</label>
          <label><input type="checkbox" checked={form.part_parallelity} onChange={(e) => set("part_parallelity", e.target.checked)} /> Parallelity</label>
          <label><input type="checkbox" checked={form.part_concentricity} onChange={(e) => set("part_concentricity", e.target.checked)} /> Concentricity</label>
        </div>

        <div style={{ marginTop: 20 }}>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save part"}</button>
        </div>
      </form>

      <div className="card">
        <h3>Import parts from Excel</h3>
        <p className="page-sub" style={{ marginTop: 0, marginBottom: 12 }}>
          Upload an .xlsx dump. Each row's <span className="mono">model_name</span> links (or creates) the
          matching model so the backend can load the right <span className="mono">.pt</span> file.
        </p>
        {importMsg && <div className="msg msg-ok">{importMsg}</div>}
        <div className="row-actions">
          <input type="file" accept=".xlsx,.xlsm" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button type="button" className="btn btn-primary" onClick={handleImport} disabled={!file}>Import</button>
        </div>
      </div>
    </div>
  );
}
