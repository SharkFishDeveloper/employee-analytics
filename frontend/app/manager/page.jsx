"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AgCharts } from "ag-charts-react";
import { ModuleRegistry, AllCommunityModule } from "ag-charts-community";
import SectionNav from "@/components/SectionNav";

ModuleRegistry.registerModules([AllCommunityModule]);

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "recommendations", label: "Recommendations" },
  { id: "kpis", label: "KPIs & charts" },
  { id: "departments", label: "Departments" },
  { id: "team", label: "Your people" },
];

const BRAND = {
  initials: "M",
  title: "Manager Analytics",
  subtitle: "Team dashboard",
  footer: "Team view across the departments you manage.",
};

const BLUE = "#2563eb";
const GRAY = "#94a3b8";

const PALETTE = [
  "#2563eb", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#0891b2", "#db2777", "#65a30d", "#ea580c", "#0d9488",
];

const chartTheme = {
  baseTheme: "ag-default",
  palette: { fills: PALETTE, strokes: PALETTE },
};

const SEVERITY = {
  positive: {
    card: "border-emerald-200 bg-emerald-50/60",
    badge: "bg-emerald-100 text-emerald-700",
    label: "Positive",
  },
  warning: {
    card: "border-amber-200 bg-amber-50/60",
    badge: "bg-amber-100 text-amber-700",
    label: "Attention",
  },
  info: {
    card: "border-sky-200 bg-sky-50/60",
    badge: "bg-sky-100 text-sky-700",
    label: "Insight",
  },
};

const PRIORITY_STYLE = {
  high: {
    card: "border-rose-200 bg-rose-50/60",
    badge: "bg-rose-100 text-rose-700",
    step: "bg-rose-600 text-white",
    label: "High priority",
  },
  medium: {
    card: "border-amber-200 bg-amber-50/60",
    badge: "bg-amber-100 text-amber-700",
    step: "bg-amber-500 text-white",
    label: "Medium",
  },
  low: {
    card: "border-sky-200 bg-sky-50/60",
    badge: "bg-sky-100 text-sky-700",
    step: "bg-sky-600 text-white",
    label: "Low",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatValue(value, unit) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const formatted = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(value);
  if (unit === "%") return `${formatted}%`;
  return unit ? `${formatted} ${unit}` : formatted;
}

function formatDelta(value, unit) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  const formatted = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(value);
  if (unit === "%") return `${sign}${formatted}%`;
  return `${sign}${formatted}${unit ? ` ${unit}` : ""}`;
}

function standingColor(standing) {
  if (standing === "Top 10%" || standing === "Top 25%")
    return "text-emerald-700 bg-emerald-50";
  if (standing === "Above average") return "text-sky-700 bg-sky-50";
  if (standing === "Below average") return "text-amber-700 bg-amber-50";
  if (standing === "Bottom 25%") return "text-rose-700 bg-rose-50";
  return "text-slate-600 bg-slate-100";
}

function deltaTone(delta, higherIsBetter) {
  if (delta === null || delta === undefined) return "text-slate-400";
  if (delta === 0) return "text-slate-500";
  const good = higherIsBetter ? delta > 0 : delta < 0;
  return good ? "text-emerald-600" : "text-rose-600";
}

function scoreColor(value) {
  if (value == null) return "#cbd5e1";
  if (value >= 75) return "#10b981";
  if (value >= 60) return "#2563eb";
  if (value >= 45) return "#f59e0b";
  return "#f43f5e";
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------
function CompositeRing({ score, size = 40 }) {
  const value = score ?? 0;
  const deg = Math.max(0, Math.min(100, value)) * 3.6;
  const color = scoreColor(score);
  return (
    <div
      className="relative flex items-center justify-center rounded-full"
      style={{
        width: `${size * 4}px`,
        height: `${size * 4}px`,
        background: `conic-gradient(${color} ${deg}deg, #e2e8f0 ${deg}deg)`,
      }}
    >
      <div
        className="flex flex-col items-center justify-center rounded-full bg-white"
        style={{ width: `${size * 4 - 32}px`, height: `${size * 4 - 32}px` }}
      >
        <span className="text-4xl font-bold text-slate-900">
          {value ? value.toFixed(0) : "—"}
        </span>
        <span className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
          of 100
        </span>
      </div>
    </div>
  );
}

function ComparisonTrack({ value, benchmark, unit }) {
  const company = benchmark?.company_avg;
  const dept = benchmark?.department_avg;
  const max =
    Math.max(
      Math.abs(value ?? 0),
      Math.abs(company ?? 0),
      Math.abs(dept ?? 0),
      1
    ) * 1.15;
  const pos = (v) =>
    `${Math.min(100, Math.max(0, (Math.abs(v ?? 0) / max) * 100))}%`;

  return (
    <div className="mt-5">
      <div className="relative h-1.5 rounded-full bg-slate-100">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-blue-100"
          style={{ width: pos(company) }}
        />
        {dept != null && (
          <div
            className="absolute -top-1 h-3.5 w-px bg-slate-300"
            style={{ left: pos(dept) }}
            title="Department avg"
          />
        )}
        <div
          className="absolute -top-1 h-3.5 w-px bg-slate-400"
          style={{ left: pos(company) }}
          title="Company avg"
        />
        <div
          className="absolute -top-[5px] h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white bg-blue-600 shadow"
          style={{ left: pos(value) }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
        <span>
          Company avg{" "}
          <span className="font-medium text-slate-600">
            {formatValue(company, unit)}
          </span>
        </span>
        <span>
          Rank{" "}
          <span className="font-medium text-slate-600">
            #{benchmark.rank}/{benchmark.peers}
          </span>
        </span>
      </div>
    </div>
  );
}

function KpiCard({ kpi }) {
  const { label, unit, value, benchmark, higher_is_better } = kpi;
  const has = benchmark && benchmark.employee_value !== null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {has && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${standingColor(
              benchmark.standing
            )}`}
          >
            {benchmark.standing}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <span className="text-3xl font-bold tracking-tight text-slate-900">
          {formatValue(value, unit)}
        </span>
        {has && (
          <span
            className={`pb-1 text-xs font-semibold ${deltaTone(
              benchmark.delta,
              higher_is_better
            )}`}
          >
            {formatDelta(benchmark.delta, unit)}
          </span>
        )}
      </div>
      {has && <ComparisonTrack value={value} benchmark={benchmark} unit={unit} />}
    </div>
  );
}

function InsightCard({ insight }) {
  const style = SEVERITY[insight.severity] || SEVERITY.info;
  return (
    <article className={`rounded-2xl border p-5 ${style.card}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-slate-900">{insight.title}</h3>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.badge}`}
        >
          {style.label}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{insight.message}</p>
      <p className="mt-3 text-[11px] uppercase tracking-wide text-blue-600">
        {insight.category}
      </p>
    </article>
  );
}

function RecommendationCard({ item }) {
  const style = PRIORITY_STYLE[item.priority] || PRIORITY_STYLE.low;
  const actions = item.actions || [];

  return (
    <article className={`flex flex-col rounded-2xl border p-5 ${style.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">{item.title}</h3>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-400">
            {item.category} · {item.kpi}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.badge}`}
        >
          {style.label}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-600">{item.summary}</p>

      {actions.length > 0 && (
        <ol className="mt-4 space-y-2">
          {actions.map((action, index) => (
            <li key={index} className="flex gap-3 text-sm text-slate-700">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${style.step}`}
              >
                {index + 1}
              </span>
              <span>{action}</span>
            </li>
          ))}
        </ol>
      )}

      {item.why && (
        <div className="mt-4 rounded-xl bg-white/70 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Why it matters
          </p>
          <p className="mt-1 text-sm text-slate-600">{item.why}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/70 pt-3 text-[11px] text-slate-500">
        {item.expected_impact && (
          <span className="rounded-full bg-white px-2 py-0.5 font-medium text-slate-600">
            Impact: {item.expected_impact}
          </span>
        )}
        {item.target && (
          <span className="rounded-full bg-white px-2 py-0.5 font-medium text-slate-600">
            {item.target}
          </span>
        )}
        {typeof item.confidence === "number" && (
          <span className="ml-auto font-medium text-slate-400">
            Confidence {Math.round(item.confidence * 100)}%
          </span>
        )}
      </div>
    </article>
  );
}

function Recommendations({ data, title = "AI recommendations" }) {
  const items = data?.items || [];
  if (items.length === 0) return null;

  return (
    <section id="recommendations">
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">
            {data?.summary ||
              "Prioritised actions generated from your latest metrics."}
          </p>
        </div>
        <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
          {items.length} actions
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <RecommendationCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function Avatar({ initials, tone = "blue", className = "" }) {
  const tones = {
    blue: "from-blue-500 to-violet-500",
    slate: "from-slate-400 to-slate-600",
  };
  return (
    <div
      className={`flex items-center justify-center rounded-2xl bg-gradient-to-br ${
        tones[tone]
      } font-bold text-white shadow-sm ${className}`}
    >
      {initials}
    </div>
  );
}

function initialsOf(name) {
  return String(name || "?")
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Department card
// ---------------------------------------------------------------------------
function DepartmentCard({ dept, onPick }) {
  const indexPct = (v) => `${Math.max(0, Math.min(100, v ?? 0))}%`;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-900">{dept.name}</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                dept.assignment_type === "Primary"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-violet-100 text-violet-700"
              }`}
            >
              {dept.assignment_type}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Head {dept.head || "—"} · {dept.location || "—"} ·{" "}
            {dept.employee_count} people
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">
            Perf. index
          </p>
          <p
            className="text-3xl font-bold"
            style={{ color: scoreColor(dept.composite_index) }}
          >
            {dept.composite_index ?? "—"}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <div className="relative h-2 rounded-full bg-slate-100">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-blue-500"
            style={{ width: indexPct(dept.composite_index) }}
          />
          {dept.company_composite != null && (
            <div
              className="absolute -top-1 h-4 w-0.5 bg-slate-400"
              style={{ left: indexPct(dept.company_composite) }}
              title={`Company avg ${dept.company_composite}`}
            />
          )}
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          Company avg {dept.company_composite ?? "—"}
        </p>
      </div>

      {/* KPI grid */}
      <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {Object.entries(dept.kpis).map(([key, kpi]) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <span className="text-sm text-slate-500">{kpi.label}</span>
            <span className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">
                {formatValue(kpi.value, kpi.unit)}
              </span>
              <span
                className={`w-16 text-right text-[11px] font-medium ${deltaTone(
                  kpi.delta,
                  kpi.higher_is_better
                )}`}
              >
                {formatDelta(kpi.delta, kpi.unit)}
              </span>
            </span>
          </div>
        ))}
      </div>

      {/* People */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-emerald-600">
            Top performers
          </p>
          <ul className="mt-2 space-y-1.5">
            {dept.top_performers.map((p) => (
              <li key={p.employee_id}>
                <button
                  type="button"
                  onClick={() => onPick(p.employee_id)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-sm hover:bg-slate-50"
                >
                  <span className="text-slate-700">{p.name}</span>
                  <span className="font-semibold text-emerald-600">
                    {p.score?.toFixed(1)}
                  </span>
                </button>
              </li>
            ))}
            {dept.top_performers.length === 0 && (
              <li className="px-2 text-sm text-slate-400">No data.</li>
            )}
          </ul>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-amber-600">
            Watchlist
          </p>
          <ul className="mt-2 space-y-1.5">
            {dept.watchlist.map((p) => (
              <li key={p.employee_id}>
                <button
                  type="button"
                  onClick={() => onPick(p.employee_id)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-sm hover:bg-slate-50"
                >
                  <span className="text-slate-700">{p.name}</span>
                  <span className="font-semibold text-amber-600">
                    {p.score?.toFixed(1)}
                  </span>
                </button>
              </li>
            ))}
            {dept.watchlist.length === 0 && (
              <li className="px-2 text-sm text-slate-400">No data.</li>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Team table
// ---------------------------------------------------------------------------
const TEAM_COLUMNS = [
  { key: "composite", label: "Index" },
  { key: "performance_rating", label: "Perf." },
  { key: "goal_progress", label: "Goals %" },
  { key: "engagement_score", label: "Engage" },
  { key: "wellbeing_score", label: "Wellbeing" },
  { key: "learning_completion_rate", label: "Learning %" },
  { key: "goals_overdue", label: "Overdue" },
];

function TeamTable({ team, departments, onPick }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [sortKey, setSortKey] = useState("composite");
  const [sortDir, setSortDir] = useState("desc");

  const rows = useMemo(() => {
    let list = team.filter((r) => r.composite != null);
    if (scope !== "all") {
      list = list.filter((r) => r.department_id === scope);
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.name?.toLowerCase().includes(q) ||
          r.job_role?.toLowerCase().includes(q) ||
          r.employee_id?.toLowerCase().includes(q)
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    });
    return list;
  }, [team, scope, query, sortKey, sortDir]);

  function toggleSort(key) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const tabs = [
    ["all", `All (${team.length})`],
    ...departments.map((d) => [d.department_id, d.name]),
  ];

  return (
    <section
      id="team"
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Your people</h2>
          <p className="text-sm text-slate-500">
            Click any person to open their individual performance.
          </p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or role…"
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-64"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setScope(key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              scope === key
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 max-h-[32rem] overflow-auto rounded-xl border border-slate-100">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Role</th>
              {TEAM_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className="cursor-pointer select-none px-3 py-2 text-right font-medium hover:text-slate-600"
                >
                  {col.label}
                  {sortKey === col.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.employee_id}
                onClick={() => onPick(r.employee_id)}
                className="cursor-pointer border-b border-slate-100 hover:bg-blue-50/60"
              >
                <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{r.name}</span>
                    {r.is_direct_report && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                        Report
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {r.employee_id}
                    {r.standing ? ` · ${r.standing}` : ""}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  {r.job_role}
                </td>
                <td
                  className="px-3 py-2 text-right font-semibold"
                  style={{ color: scoreColor(r.composite) }}
                >
                  {r.composite?.toFixed(1) ?? "—"}
                </td>
                <td className="px-3 py-2 text-right text-slate-600">
                  {formatValue(r.performance_rating)}
                </td>
                <td className="px-3 py-2 text-right text-slate-600">
                  {formatValue(r.goal_progress, "%")}
                </td>
                <td className="px-3 py-2 text-right text-slate-600">
                  {formatValue(r.engagement_score)}
                </td>
                <td className="px-3 py-2 text-right text-slate-600">
                  {formatValue(r.wellbeing_score)}
                </td>
                <td className="px-3 py-2 text-right text-slate-600">
                  {formatValue(r.learning_completion_rate, "%")}
                </td>
                <td className="px-3 py-2 text-right">
                  <span
                    className={
                      r.goals_overdue ? "font-semibold text-rose-600" : "text-slate-400"
                    }
                  >
                    {r.goals_overdue ?? 0}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-slate-400">
                  No people match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Individual drill-down (reuses the employee dashboard endpoint)
// ---------------------------------------------------------------------------
function Drilldown({ employeeId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    fetch(`${API_URL}/employee/?employee_id=${encodeURIComponent(employeeId)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.detail || `Request failed: ${res.status}`);
        }
        return res.json();
      })
      .then(setData)
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [employeeId]);

  const primary = data
    ? Object.values(data.kpis).filter((k) => k.primary)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-slate-50 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <p className="text-xs font-semibold tracking-widest text-blue-600">
            INDIVIDUAL PERFORMANCE
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-600 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        {loading && (
          <div className="flex flex-1 items-center justify-center text-slate-500">
            <span className="animate-pulse">Loading {employeeId}…</span>
          </div>
        )}

        {error && (
          <div className="p-6">
            <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
              {error}
            </p>
          </div>
        )}

        {data && !loading && (
          <div className="space-y-6 p-6">
            <div className="flex items-center gap-4">
              <Avatar
                initials={data.profile.initials}
                tone="slate"
                className="h-14 w-14 text-lg"
              />
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {data.profile.Employee_Name}
                </h2>
                <p className="text-sm text-slate-500">
                  {data.profile.Job_Role} · {data.profile.Department}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row">
              <div className="flex flex-col items-center gap-4">
                <CompositeRing score={data.headline.score} size={32} />
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${standingColor(
                    data.headline.standing
                  )}`}
                >
                  {data.headline.standing || "—"}
                </span>
              </div>
              <div className="grid flex-1 grid-cols-2 gap-3">
                {[
                  ["Company avg", data.headline.company_avg?.toFixed(1)],
                  ["Dept avg", data.headline.department_avg?.toFixed(1)],
                  [
                    "Company rank",
                    data.headline.rank
                      ? `#${data.headline.rank}/${data.headline.peers}`
                      : "—",
                  ],
                  [
                    "Dept rank",
                    data.headline.department_rank
                      ? `#${data.headline.department_rank}/${data.headline.department_peers}`
                      : "—",
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center"
                  >
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">
                      {label}
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Key metrics
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {primary.map((kpi) => (
                  <KpiCard key={kpi.key} kpi={kpi} />
                ))}
              </div>
            </div>

            {data.insights?.length > 0 && (
              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Insights
                </h3>
                <div className="space-y-3">
                  {data.insights.map((insight, i) => (
                    <InsightCard key={`${insight.title}-${i}`} insight={insight} />
                  ))}
                </div>
              </div>
            )}

            <a
              href={`/employee?employee_id=${encodeURIComponent(employeeId)}`}
              className="block rounded-xl bg-blue-600 py-3 text-center font-semibold text-white transition hover:bg-blue-500"
            >
              Open full employee dashboard →
            </a>
          </div>
        )}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------
function indexChartOptions(rows, compare) {
  const data = rows.map((r) => ({
    department: r.department,
    mine: r.is_mine ? r.index : null,
    others: r.is_mine ? null : r.index,
    company_avg: r.company_avg,
  }));
  const series = [
    {
      type: "bar",
      xKey: "department",
      yKey: "mine",
      yName: "Your departments",
      fill: "#2563eb",
      cornerRadius: 4,
    },
    {
      type: "bar",
      xKey: "department",
      yKey: "others",
      yName: "Other departments",
      fill: "#cbd5e1",
      cornerRadius: 4,
    },
  ];
  if (compare) {
    series.push({
      type: "line",
      xKey: "department",
      yKey: "company_avg",
      yName: "Company avg",
      stroke: GRAY,
      strokeWidth: 2,
      lineDash: [6, 4],
      marker: { enabled: true, size: 5, fill: GRAY, stroke: GRAY },
    });
  }
  return {
    theme: chartTheme,
    background: { fill: "transparent" },
    data,
    axes: [
      { type: "category", position: "bottom" },
      { type: "number", position: "left" },
    ],
    series,
  };
}

function performanceLineOptions(rows, myNames) {
  const keys = rows.length
    ? Object.keys(rows[0]).filter((k) => k !== "dimension")
    : [];
  const mine = new Set(myNames || []);
  const series = keys.map((key, i) => {
    let color = PALETTE[i % PALETTE.length];
    let strokeWidth = 1.6;
    let strokeOpacity = 0.55;
    let lineDash;
    if (key === "Your departments") {
      color = "#0f172a";
      strokeWidth = 3.5;
      strokeOpacity = 1;
    } else if (key === "Company") {
      color = "#94a3b8";
      strokeWidth = 2;
      strokeOpacity = 1;
      lineDash = [6, 4];
    } else if (mine.has(key)) {
      strokeWidth = 3;
      strokeOpacity = 1;
    }
    return {
      type: "line",
      xKey: "dimension",
      yKey: key,
      yName: key,
      stroke: color,
      strokeWidth,
      strokeOpacity,
      lineDash,
      marker: { enabled: true, size: 4, fill: color, stroke: color },
    };
  });
  return {
    theme: chartTheme,
    background: { fill: "transparent" },
    data: rows,
    axes: [
      { type: "category", position: "bottom" },
      { type: "number", position: "left" },
    ],
    series,
  };
}

function engagementChartOptions(rows, compare) {
  const series = [
    {
      type: "bar",
      xKey: "department",
      yKey: "engagement",
      yName: "Engagement",
      fill: "#2563eb",
      cornerRadius: 4,
    },
    {
      type: "bar",
      xKey: "department",
      yKey: "wellbeing",
      yName: "Wellbeing",
      fill: "#8b5cf6",
      cornerRadius: 4,
    },
  ];
  if (compare) {
    series.push(
      {
        type: "line",
        xKey: "department",
        yKey: "company_engagement",
        yName: "Engagement avg",
        stroke: "#1d4ed8",
        strokeWidth: 2,
        lineDash: [6, 4],
        marker: { enabled: true, size: 4, fill: "#1d4ed8", stroke: "#1d4ed8" },
      },
      {
        type: "line",
        xKey: "department",
        yKey: "company_wellbeing",
        yName: "Wellbeing avg",
        stroke: "#6d28d9",
        strokeWidth: 2,
        lineDash: [6, 4],
        marker: { enabled: true, size: 4, fill: "#6d28d9", stroke: "#6d28d9" },
      }
    );
  }
  return {
    theme: chartTheme,
    background: { fill: "transparent" },
    data: rows,
    axes: [
      { type: "category", position: "bottom" },
      { type: "number", position: "left" },
    ],
    series,
  };
}

function objectivesChartOptions(rows) {
  return {
    theme: chartTheme,
    background: { fill: "transparent" },
    data: rows,
    axes: [
      { type: "category", position: "bottom" },
      { type: "number", position: "left" },
    ],
    series: [
      {
        type: "line",
        xKey: "period",
        yKey: "objectives",
        yName: "Objectives (due)",
        stroke: "#2563eb",
        strokeWidth: 3,
        marker: { enabled: true, size: 6, fill: "#2563eb", stroke: "#2563eb" },
      },
      {
        type: "line",
        xKey: "period",
        yKey: "achieved",
        yName: "Achieved",
        stroke: "#10b981",
        strokeWidth: 3,
        lineDash: [6, 4],
        marker: { enabled: true, size: 6, fill: "#10b981", stroke: "#10b981" },
      },
    ],
  };
}

function goalStatusChartOptions(rows) {
  return donutChartOptions(rows, "status");
}

function donutChartOptions(rows, labelKey) {
  return {
    theme: chartTheme,
    background: { fill: "transparent" },
    data: rows,
    series: [
      {
        type: "donut",
        angleKey: "count",
        legendItemKey: labelKey,
        calloutLabelKey: labelKey,
        innerRadiusRatio: 0.62,
        cornerRadius: 4,
        strokeWidth: 2,
      },
    ],
  };
}

function weeklyLineOptions(rows) {
  const keys = rows.length
    ? Object.keys(rows[0]).filter((k) => k !== "week")
    : [];
  const series = keys.map((key, i) => {
    const isCompany = key === "Company";
    const color = isCompany ? "#94a3b8" : PALETTE[i % PALETTE.length];
    return {
      type: "line",
      xKey: "week",
      yKey: key,
      yName: key,
      stroke: color,
      strokeWidth: isCompany ? 2 : 2.2,
      strokeOpacity: isCompany ? 1 : 0.9,
      lineDash: isCompany ? [6, 4] : undefined,
      marker: { enabled: true, size: 4, fill: color, stroke: color },
    };
  });
  return {
    theme: chartTheme,
    background: { fill: "transparent" },
    data: rows,
    axes: [
      { type: "category", position: "bottom", title: { text: "Week" } },
      { type: "number", position: "left", title: { text: "Engagement" } },
    ],
    series,
  };
}

function goalHealthOptions(rows) {
  const defs = [
    ["completed", "Completed", "#10b981"],
    ["in_progress", "In progress", "#2563eb"],
    ["overdue", "Overdue", "#ef4444"],
    ["not_started", "Not started", "#cbd5e1"],
  ];
  return {
    theme: chartTheme,
    background: { fill: "transparent" },
    data: rows,
    axes: [
      { type: "category", position: "bottom" },
      { type: "number", position: "left", title: { text: "Goals" } },
    ],
    series: defs.map(([key, name, fill]) => ({
      type: "bar",
      xKey: "department",
      yKey: key,
      yName: name,
      fill,
      stacked: true,
      cornerRadius: 2,
    })),
  };
}

function hBarOptions(rows, xKey, yKey, fill = BLUE) {
  return {
    theme: chartTheme,
    background: { fill: "transparent" },
    data: rows,
    axes: [
      { type: "category", position: "left" },
      { type: "number", position: "bottom" },
    ],
    series: [{ type: "bar", xKey, yKey, fill, cornerRadius: 4 }],
  };
}

function officeRemoteOptions(rows) {
  return {
    theme: chartTheme,
    background: { fill: "transparent" },
    data: rows,
    axes: [
      { type: "category", position: "bottom", title: { text: "Week" } },
      { type: "number", position: "left", title: { text: "Avg days / person" } },
    ],
    series: [
      {
        type: "area",
        xKey: "week",
        yKey: "office_days",
        yName: "Office days",
        fill: "#2563eb",
        stroke: "#1d4ed8",
        fillOpacity: 0.25,
        marker: { enabled: true, size: 4 },
      },
      {
        type: "area",
        xKey: "week",
        yKey: "remote_days",
        yName: "Remote days",
        fill: "#10b981",
        stroke: "#059669",
        fillOpacity: 0.25,
        marker: { enabled: true, size: 4 },
      },
    ],
  };
}

function objectivesPacingOptions(rows) {
  return {
    theme: chartTheme,
    background: { fill: "transparent" },
    data: rows,
    axes: [
      { type: "category", position: "bottom" },
      { type: "number", position: "left", title: { text: "Completion %" } },
    ],
    series: [
      {
        type: "bar",
        xKey: "period",
        yKey: "completion_rate",
        yName: "Completion rate",
        fill: "#8b5cf6",
        cornerRadius: 4,
      },
    ],
  };
}

function deptBarOptions(rows, valueKey) {
  return {
    theme: chartTheme,
    background: { fill: "transparent" },
    data: rows,
    axes: [
      { type: "category", position: "bottom" },
      { type: "number", position: "left" },
    ],
    series: [
      {
        type: "bar",
        xKey: "department",
        yKey: valueKey,
        fill: BLUE,
        cornerRadius: 4,
      },
    ],
  };
}

function histogramOptions(values) {
  return {
    theme: chartTheme,
    background: { fill: "transparent" },
    data: values,
    axes: [
      { type: "number", position: "bottom", title: { text: "Performance index" } },
      { type: "number", position: "left", title: { text: "People" } },
    ],
    series: [
      {
        type: "histogram",
        xKey: "score",
        yName: "People",
        fill: "#2563eb",
        stroke: "#1d4ed8",
        fillOpacity: 0.65,
        cornerRadius: 2,
      },
    ],
  };
}

function ChartCard({ title, subtitle, options, full }) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${
        full ? "lg:col-span-2" : ""
      }`}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <span className="text-[11px] text-slate-400">{subtitle}</span>
      </div>
      <div className="h-72 w-full">
        <AgCharts options={options} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ManagerDashboard() {
  const [managerId, setManagerId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [compare, setCompare] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setManagerId(params.get("employee_id") || "");
  }, []);

  useEffect(() => {
    if (!managerId) {
      setLoading(false);
      setError("Manager ID is missing. Return to the login page.");
      return;
    }
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `${API_URL}/manager/?manager_id=${encodeURIComponent(managerId)}`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.detail || `Request failed: ${res.status}`);
        }
        setData(await res.json());
      } catch (err) {
        if (err.name !== "AbortError") setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [managerId]);

  const ownPrimary = useMemo(() => {
    if (!data) return [];
    return Object.values(data.own.kpis).filter((k) => k.primary);
  }, [data]);

  const chartCards = useMemo(() => {
    if (!data) return [];
    const c = data.charts || {};
    const has = (rows) => Array.isArray(rows) && rows.length > 0;
    const myNames = (data.profile?.managed_departments || []).map((d) => d.name);
    const cards = [];

    if (has(c.all_department_index)) {
      cards.push({
        key: "dept_index",
        title: "All departments — performance index",
        subtitle: "Your departments vs the rest of the company",
        options: indexChartOptions(c.all_department_index, compare),
        full: false,
      });
    }
    if (has(c.engagement_wellbeing)) {
      cards.push({
        key: "engagement",
        title: "Engagement vs wellbeing",
        subtitle: "Department averages (dashed = company avg)",
        options: engagementChartOptions(c.engagement_wellbeing, compare),
        full: false,
      });
    }
    if (has(c.performance_by_dimension)) {
      cards.push({
        key: "perf_dept",
        title: "Performance by dimension — all departments",
        subtitle: "Your departments in bold, all others for comparison (out of 5)",
        options: performanceLineOptions(c.performance_by_dimension, myNames),
        full: true,
      });
    }
    if (has(c.objectives_vs_achieved)) {
      cards.push({
        key: "objectives",
        title: "Objectives vs achieved",
        subtitle: "Goals due per month vs completed",
        options: objectivesChartOptions(c.objectives_vs_achieved),
        full: false,
      });
    }
    if (has(c.weekly_engagement_by_department)) {
      cards.push({
        key: "weekly_eng",
        title: "Engagement trend by department",
        subtitle: "Weekly average across your teams",
        options: weeklyLineOptions(c.weekly_engagement_by_department),
        full: true,
      });
    }
    if (has(c.overdue_goals_by_department)) {
      cards.push({
        key: "overdue_goals",
        title: "Overdue goals per member",
        subtitle: "Average overdue goals by department",
        options: deptBarOptions(c.overdue_goals_by_department, "overdue_per_member"),
        full: false,
      });
    }
    if (has(c.goal_status)) {
      cards.push({
        key: "goal_status",
        title: "Goal status mix",
        subtitle: "Your teams' goals",
        options: goalStatusChartOptions(c.goal_status),
        full: false,
      });
    }
    if (has(c.team_work_mode_mix)) {
      cards.push({
        key: "work_mode",
        title: "Team work-mode mix",
        subtitle: "Where your team works from",
        options: donutChartOptions(c.team_work_mode_mix, "Work_Mode"),
        full: false,
      });
    }
    if (has(c.learning_by_department)) {
      cards.push({
        key: "learning",
        title: "Learning completion by department",
        subtitle: "Average completion %",
        options: deptBarOptions(c.learning_by_department, "completion_rate"),
        full: false,
      });
    }
    if (has(c.meeting_efficiency_by_department)) {
      cards.push({
        key: "meetings",
        title: "Meeting efficiency by department",
        subtitle: "Average efficiency score",
        options: deptBarOptions(c.meeting_efficiency_by_department, "score"),
        full: false,
      });
    }
    if (has(c.team_performance_distribution)) {
      cards.push({
        key: "team_dist",
        title: "Team performance distribution",
        subtitle: `${c.team_performance_distribution.length} people`,
        options: histogramOptions(c.team_performance_distribution),
        full: true,
      });
    }
    if (has(c.goal_health_by_department)) {
      cards.push({
        key: "goal_health",
        title: "Goal health by department",
        subtitle: "Status of every team goal you own",
        options: goalHealthOptions(c.goal_health_by_department),
        full: true,
      });
    }
    if (has(c.objectives_pacing)) {
      cards.push({
        key: "pacing",
        title: "Objective completion pacing",
        subtitle: "Completed share of goals due each month",
        options: objectivesPacingOptions(c.objectives_pacing),
        full: false,
      });
    }
    if (has(c.meeting_load_by_member)) {
      cards.push({
        key: "meeting_load",
        title: "Meeting load by person",
        subtitle: "Meeting cost-hours (top 12)",
        options: hBarOptions(c.meeting_load_by_member, "name", "cost_hours", "#f59e0b"),
        full: false,
      });
    }
    if (has(c.office_vs_remote_weekly)) {
      cards.push({
        key: "office_remote",
        title: "Office vs remote days",
        subtitle: "Average days per person each week",
        options: officeRemoteOptions(c.office_vs_remote_weekly),
        full: false,
      });
    }
    if (has(c.learning_not_started_by_department)) {
      cards.push({
        key: "learning_gap",
        title: "Learning gap by department",
        subtitle: "Share of courses not started",
        options: deptBarOptions(c.learning_not_started_by_department, "not_started_pct"),
        full: false,
      });
    }
    if (has(c.engagement_trend_low)) {
      cards.push({
        key: "engagement_low",
        title: "Engagement of lowest performers",
        subtitle: "Weekly — spot disengagement early",
        options: weeklyLineOptions(c.engagement_trend_low),
        full: true,
      });
    }

    return cards;
  }, [data, compare]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">
        <div className="animate-pulse">Loading manager dashboard…</div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-900">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">
            Manager dashboard unavailable
          </h1>
          <p className="mt-3 text-rose-600">{error || "No data returned."}</p>
          <a href="/" className="mt-5 inline-block text-blue-600">
            Back to login
          </a>
        </div>
      </main>
    );
  }

  const {
    profile,
    headline,
    own,
    departments,
    team,
    team_kpis,
    insights,
    recommendations,
    context,
    meta,
  } = data;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <SectionNav brand={BRAND} sections={SECTIONS} />
      <div className="px-4 pb-8 pt-6 sm:px-8 lg:pl-[17rem] lg:pr-8">
        <div className="mx-auto max-w-7xl space-y-10">
          {/* Header */}
          <header id="overview" className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <Avatar
                initials={profile.initials}
                className="h-16 w-16 text-xl"
              />
              <div>
                <p className="text-xs font-semibold tracking-widest text-blue-600">
                  MANAGER ANALYTICS
                </p>
                <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
                  {profile.Employee_Name}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {profile.Job_Role} · {profile.Department} · {profile.Location}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                  {profile.managed_departments.map((d) => (
                    <span
                      key={d.department_id}
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        d.assignment_type === "Primary"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-violet-100 text-violet-700"
                      }`}
                    >
                      {d.name} · {d.assignment_type}
                    </span>
                  ))}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                    {context.total_employees} employees company-wide
                  </span>
                </div>
              </div>
            </div>
            <a
              href="/"
              className="w-fit rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              Sign out
            </a>
          </header>

          {/* Own performance */}
          <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
              <h2 className="text-lg font-semibold text-slate-900">
                Your performance
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Your own composite index and how it compares to other managers.
              </p>
              <div className="mt-6 flex flex-col items-center gap-8 sm:flex-row">
                <div className="flex flex-col items-center gap-5">
                  <CompositeRing score={headline.score} />
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${standingColor(
                      headline.standing
                    )}`}
                  >
                    {headline.standing || "—"}
                  </span>
                </div>
                <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    ["Your index", headline.score?.toFixed(1)],
                    ["Company avg", headline.company_avg?.toFixed(1)],
                    ["Dept avg", headline.department_avg?.toFixed(1)],
                    ["Managers rank", `${headline.rank} / ${headline.peers}`],
                    ["Team size", meta.data_period.team_size],
                    ["Direct reports", meta.data_period.direct_reports],
                    ["Departments", context.managed_department_count],
                    ["Company index", context.company_composite?.toFixed(1)],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center"
                    >
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">
                        {label}
                      </p>
                      <p className="mt-1 text-lg font-bold text-slate-900">
                        {value ?? "—"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">
                  Manager insights
                </h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                  {insights.length}
                </span>
              </div>
              <div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
                {insights.map((insight, i) => {
                  const style = SEVERITY[insight.severity] || SEVERITY.info;
                  return (
                    <div
                      key={`${insight.title}-${i}`}
                      className={`rounded-xl border p-4 ${style.card}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          {insight.title}
                        </p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.badge}`}
                        >
                          {style.label}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {insight.message}
                      </p>
                    </div>
                  );
                })}
                {insights.length === 0 && (
                  <p className="text-sm text-slate-400">No insights yet.</p>
                )}
              </div>
            </div>
          </section>

          {/* AI recommendations */}
          <Recommendations data={recommendations} />

          {/* KPIs */}
          <section id="kpis">
            <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">KPIs</h2>
                <p className="text-sm text-slate-500">
                  Team health, your own metrics and the charts behind them.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCompare((v) => !v)}
                className={`w-fit rounded-xl border px-4 py-2 text-sm font-medium transition ${
                  compare
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span
                  className={`mr-2 inline-block h-2 w-2 rounded-full align-middle ${
                    compare ? "bg-blue-500" : "bg-slate-400"
                  }`}
                />
                Company average: {compare ? "On" : "Off"}
              </button>
            </div>

            {team_kpis?.length > 0 && (
              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Team health
                </h3>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {team_kpis.map((kpi) => (
                    <div
                      key={kpi.key}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <p className="text-sm font-medium text-slate-500">
                        {kpi.label}
                      </p>
                      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
                        {kpi.value ?? "—"}
                        {kpi.unit ? (
                          <span className="ml-1 text-lg font-semibold text-slate-400">
                            {kpi.unit}
                          </span>
                        ) : null}
                      </p>
                      {kpi.note && (
                        <p className="mt-2 text-xs leading-5 text-slate-400">
                          {kpi.note}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {ownPrimary.length > 0 && (
              <div className={team_kpis?.length > 0 ? "mt-8" : ""}>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Your key metrics
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {ownPrimary.map((kpi) => (
                    <KpiCard key={kpi.key} kpi={kpi} />
                  ))}
                </div>
              </div>
            )}

            {chartCards.length > 0 && (
              <div className="mt-8">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  KPI charts
                </h3>
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  {chartCards.map(({ key, ...cardProps }) => (
                    <ChartCard key={key} {...cardProps} />
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Departments */}
          <section id="departments">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-slate-900">
                Your departments
              </h2>
              <p className="text-sm text-slate-500">
                KPIs and insights for each department you manage.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {departments.map((dept) => (
                <DepartmentCard key={dept.department_id} dept={dept} onPick={setSelected} />
              ))}
            </div>
          </section>

          {/* Team */}
          <TeamTable
            team={team}
            departments={departments}
            onPick={setSelected}
          />

          <footer className="pb-6 text-center text-xs text-slate-400">
            Manager Analytics Portal · {meta.data_period.team_size} people across{" "}
            {context.managed_department_count} department(s)
          </footer>
        </div>
      </div>

      {selected && (
        <Drilldown employeeId={selected} onClose={() => setSelected(null)} />
      )}
    </main>
  );
}
