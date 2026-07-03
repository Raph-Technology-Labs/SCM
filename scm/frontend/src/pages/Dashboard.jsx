import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api/client";
import { useLiveSummary } from "../api/useLive";

const OK = "#1e9e6a";
const NOK = "#d64545";
const PENDING = "#8a93a2";
const BLUE = "#2f6fed";

function Kpi({ label, value, accent }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={accent ? { color: accent } : undefined}>{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const { summary, live } = useLiveSummary();
  const [series, setSeries] = useState([]);
  const [status, setStatus] = useState([]);
  const [defects, setDefects] = useState([]);
  const [top, setTop] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [ts, st, df, tp] = await Promise.all([
          api.timeseries(),
          api.statusBreakdown(),
          api.defectBreakdown(),
          api.topParts(),
        ]);
        setSeries(ts);
        setStatus(st);
        setDefects(df);
        setTop(tp);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, []);

  // prefer live status breakdown when the socket is pushing it
  const statusData = summary?.status_breakdown || status;
  const statusColors = { OK, NOK, Pending: PENDING };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Inspection overview and live production metrics.</p>
        </div>
        <span className={"live-badge " + (live ? "on" : "off")}>
          <span className="live-dot" /> {live ? "Live" : "Polling"}
        </span>
      </div>

      {error && <div className="msg msg-error">{error}</div>}

      <div className="kpi-grid">
        <Kpi label="Parts" value={summary?.parts_total ?? "—"} />
        <Kpi label="AI models" value={summary?.models_total ?? "—"} />
        <Kpi label="Sessions" value={summary?.sessions_total ?? "—"} />
        <Kpi label="Total inspected" value={summary ? summary.total_inspected.toLocaleString() : "—"} />
        <Kpi label="OK rate" value={summary ? `${summary.ok_rate}%` : "—"} accent={OK} />
        <Kpi
          label="Avg parts / min"
          value={summary?.avg_parts_per_minute ?? "—"}
          accent={BLUE}
        />
      </div>

      <div className="chart-grid">
        <div className="chart-card wide">
          <h3>Units inspected per day</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={series} margin={{ left: -12, right: 8, top: 6 }}>
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BLUE} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={BLUE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#6a7382" }} />
              <YAxis tick={{ fontSize: 11, fill: "#6a7382" }} />
              <Tooltip />
              <Area type="monotone" dataKey="inspected" stroke={BLUE} fill="url(#g)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Inspection status</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={statusData}
                dataKey="count"
                nameKey="status"
                innerRadius={58}
                outerRadius={92}
                paddingAngle={2}
              >
                {statusData.map((d) => (
                  <Cell key={d.status} fill={statusColors[d.status] || PENDING} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="legend">
            {statusData.map((d) => (
              <span key={d.status} className="legend-item">
                <span className="legend-dot" style={{ background: statusColors[d.status] || PENDING }} />
                {d.status} · {d.count}
              </span>
            ))}
          </div>
        </div>

        <div className="chart-card">
          <h3>Defects by type</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={defects} margin={{ left: -12, right: 8, top: 6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
              <XAxis dataKey="defect" tick={{ fontSize: 10, fill: "#6a7382" }} interval={0} />
              <YAxis tick={{ fontSize: 11, fill: "#6a7382" }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill={NOK} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card wide">
          <h3>Top parts by units inspected</h3>
          {top.length === 0 ? (
            <div className="empty">No session data yet.</div>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Code</th><th>Name</th><th>Sessions</th><th>Inspected</th></tr>
              </thead>
              <tbody>
                {top.map((p) => (
                  <tr key={p.part_code}>
                    <td className="mono">{p.part_code}</td>
                    <td>{p.part_name}</td>
                    <td className="mono">{p.sessions}</td>
                    <td className="mono">{p.inspected.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
