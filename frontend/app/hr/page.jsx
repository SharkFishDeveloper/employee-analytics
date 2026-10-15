"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AgCharts } from "ag-charts-react";
import { ModuleRegistry, AllCommunityModule } from "ag-charts-community";
import SectionNav from "@/components/SectionNav";
import FlipCard from "@/components/FlipCard";
import { KPIS as KPI_EXPLAIN, CHARTS as CHART_EXPLAIN } from "@/components/explain/hr";
import { KPIS as EMPLOYEE_KPIS } from "@/components/explain/employee";

ModuleRegistry.registerModules([AllCommunityModule]);

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "recommendations", label: "Recommendations" },
  { id: "kpis", label: "KPIs & charts" },
  { id: "people", label: "People & managers" },
  { id: "departments", label: "Departments" },
  { id: "insights", label: "Insights" },
];

const BRAND = {
  initials: "H",
  title: "HR Analytics",
  subtitle: "Company dashboard",
  footer: "Company-wide view of every department and manager.",
};

const BLUE = "#2563eb";
const GRAY = "#94a3b8";

// KPIs hidden from the frontend everywhere (cards, charts).
const HIDDEN_KPIS = new Set(["co2_saved", "renewable", "renewable_energy"]);

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

function initialsOf(name) {
  return String(name || "?")
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------
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
          />
        )}
        <div
          className="absolute -top-1 h-3.5 w-px bg-slate-400"
          style={{ left: pos(company) }}
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
    <FlipCard
      className="rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
      how={EMPLOYEE_KPIS[kpi.key]}
      item={kpi}
    >
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
    </FlipCard>
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

      {/* {item.why && (
        <div className="mt-4 rounded-xl bg-white/70 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Why it matters
          </p>
          <p className="mt-1 text-sm text-slate-600">{item.why}</p>
        </div>
      )} */}

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

function ChartCard({ chartKey, title, subtitle, options, full }) {
  return (
    <FlipCard
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${
        full ? "lg:col-span-2" : ""
      }`}
      how={CHART_EXPLAIN[chartKey]}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <span className="text-[11px] text-slate-400">{subtitle}</span>
      </div>
      <div className="h-72 w-full">
        <AgCharts options={options} />
      </div>
    </FlipCard>
  );
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------
function departmentIndexOptions(rows, compare) {
  const data = rows.map((r) => ({
    department: r.department,
    index: r.index,
    company_avg: r.company_avg,
  }));
  const series = [
    {
      type: "bar",
      xKey: "department",
      yKey: "index",
      yName: "Department index",
      fill: BLUE,
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

function barOptions({ data, xKey, yKey, horizontal = false, fill = BLUE }) {
  return {
    theme: chartTheme,
    background: { fill: "transparent" },
    data,
    axes: horizontal
      ? [
          { type: "category", position: "left" },
          { type: "number", position: "bottom" },
        ]
      : [
          { type: "category", position: "bottom" },
          { type: "number", position: "left" },
        ],
    series: [{ type: "bar", xKey, yKey, fill, cornerRadius: 4 }],
  };
}

function donutOptions({ data, labelKey, countKey = "count" }) {
  return {
    theme: chartTheme,
    background: { fill: "transparent" },
    data,
    series: [
      {
        type: "donut",
        angleKey: countKey,
        legendItemKey: labelKey,
        calloutLabelKey: labelKey,
        innerRadiusRatio: 0.62,
        cornerRadius: 4,
        strokeWidth: 2,
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

function scatterOptions({ data, xKey, yKey, xLabel, yLabel }) {
  return {
    theme: chartTheme,
    background: { fill: "transparent" },
    data,
    axes: [
      { type: "number", position: "bottom", title: { text: xLabel } },
      { type: "number", position: "left", title: { text: yLabel } },
    ],
    series: [
      {
        type: "scatter",
        xKey,
        yKey,
        xName: xLabel,
        yName: yLabel,
        fill: "#6366f1",
        stroke: "#4338ca",
        marker: { size: 10, fillOpacity: 0.75, strokeOpacity: 0.5 },
      },
    ],
  };
}

function groupedBarOptions({ data, xKey, series }) {
  return {
    theme: chartTheme,
    background: { fill: "transparent" },
    data,
    axes: [
      { type: "category", position: "bottom" },
      { type: "number", position: "left" },
    ],
    series: series.map(({ yKey, name, fill }) => ({
      type: "bar",
      xKey,
      yKey,
      yName: name,
      fill,
      cornerRadius: 4,
    })),
  };
}

function areaOptions({ data, xKey, yKey, fill, stroke, label }) {
  return {
    theme: chartTheme,
    background: { fill: "transparent" },
    data,
    axes: [
      { type: "category", position: "bottom" },
      { type: "number", position: "left", title: { text: label } },
    ],
    series: [
      {
        type: "area",
        xKey,
        yKey,
        yName: label,
        fill,
        stroke,
        fillOpacity: 0.25,
        marker: { enabled: true, size: 4 },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------
function Leaderboard({ rows, onPick }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          Top performers
        </h2>
        <span className="text-xs text-slate-400">{rows.length} people</span>
      </div>
      <ol className="mt-4 space-y-1">
        {rows.map((r, i) => (
          <li key={r.employee_id}>
            <button
              type="button"
              onClick={() => onPick(r.employee_id, r.is_manager)}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-slate-50"
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  i === 0
                    ? "bg-amber-100 text-amber-700"
                    : i < 3
                    ? "bg-slate-200 text-slate-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium text-slate-800">
                    {r.name}
                  </span>
                  {r.is_manager && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                      Manager
                    </span>
                  )}
                </span>
                <span className="block truncate text-[11px] text-slate-400">
                  {r.job_role} · {r.department}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 sm:block">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${Math.min(100, r.score)}%`,
                      background: scoreColor(r.score),
                    }}
                  />
                </span>
                <span
                  className="w-10 text-right text-sm font-bold"
                  style={{ color: scoreColor(r.score) }}
                >
                  {r.score?.toFixed(1)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Department card (with all employees)
// ---------------------------------------------------------------------------
function DepartmentCard({ dept, onPick }) {
  const [expanded, setExpanded] = useState(false);
  const employees = dept.employees || [];
  const shown = expanded ? employees : employees.slice(0, 5);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{dept.name}</h3>
          <p className="mt-1 text-xs text-slate-500">
            Head {dept.head_name || "—"} · {dept.location || "—"} ·{" "}
            {dept.employee_count} people
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">
            Dept index
          </p>
          <p
            className="text-3xl font-bold"
            style={{ color: scoreColor(dept.composite_index) }}
          >
            {dept.composite_index ?? "—"}
          </p>
        </div>
      </div>

      {/* Manager */}
      {dept.manager?.employee_id && (
        <button
          type="button"
          onClick={() => onPick(dept.manager.employee_id, true)}
          className="mt-4 flex w-full items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-left hover:bg-slate-100"
        >
          <span className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">
              Manager
            </span>
            <span className="text-sm font-medium text-slate-800">
              {dept.manager.name}
            </span>
          </span>
          <span className="flex items-center gap-2">
            {dept.manager.standing && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${standingColor(
                  dept.manager.standing
                )}`}
              >
                {dept.manager.standing}
              </span>
            )}
            <span
              className="text-sm font-bold"
              style={{ color: scoreColor(dept.manager.composite) }}
            >
              {dept.manager.composite?.toFixed(1) ?? "—"}
            </span>
          </span>
        </button>
      )}

      {/* KPIs */}
      <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {Object.entries(dept.kpis)
          .filter(([key]) => !HIDDEN_KPIS.has(key))
          .map(([key, kpi]) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <span className="text-sm text-slate-500">{kpi.label}</span>
            <span className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">
                {formatValue(kpi.value, kpi.unit)}
              </span>
              <span
                className={`w-14 text-right text-[11px] font-medium ${deltaTone(
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

      {/* Employees */}
      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">
            Employees ({dept.employee_count})
          </p>
          {employees.length > 5 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              {expanded ? "Show less" : `View all ${employees.length}`}
            </button>
          )}
        </div>
        <div className="mt-2 divide-y divide-slate-100">
          {shown.map((emp) => (
            <button
              key={emp.employee_id}
              type="button"
              onClick={() => onPick(emp.employee_id, emp.is_manager)}
              className="flex w-full items-center justify-between gap-3 py-2 text-left hover:bg-slate-50"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-slate-800">
                    {emp.name}
                  </span>
                  {emp.is_manager && (
                    <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                      Mgr
                    </span>
                  )}
                </span>
                <span className="block truncate text-[11px] text-slate-400">
                  {emp.job_role} · {emp.location}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="hidden text-[11px] text-slate-400 sm:block">
                  Perf {formatValue(emp.performance_rating)}
                </span>
                <span
                  className="w-9 text-right text-sm font-semibold"
                  style={{ color: scoreColor(emp.composite) }}
                >
                  {emp.composite?.toFixed(1) ?? "—"}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Individual drill-down (reuses the employee endpoint)
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
    ? Object.values(data.kpis).filter(
        (k) => k.primary && !HIDDEN_KPIS.has(k.key)
      )
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
// Page
// ---------------------------------------------------------------------------
export default function HrDashboard() {
  const router = useRouter();
  const [viewerId, setViewerId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [compare, setCompare] = useState(true);
  const [selected, setSelected] = useState(null);

  function openPerson(employeeId, isManager) {
    if (!employeeId) return;
    if (isManager) {
      router.push(`/manager?employee_id=${encodeURIComponent(employeeId)}`);
      return;
    }
    setSelected(employeeId);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setViewerId(params.get("employee_id") || "");
  }, []);

  useEffect(() => {
    if (!viewerId) {
      setLoading(false);
      setError("Employee ID is missing. Return to the login page.");
      return;
    }
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `${API_URL}/hr/?employee_id=${encodeURIComponent(viewerId)}`,
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
  }, [viewerId]);

  const chartCards = useMemo(() => {
    if (!data) return [];
    const c = data.charts || {};
    const has = (rows) => Array.isArray(rows) && rows.length > 0;
    const cards = [];

    if (has(c.department_index)) {
      cards.push({
        key: "dept_index",
        title: "Department performance index",
        subtitle: "Composite index vs company average",
        options: departmentIndexOptions(c.department_index, compare),
        full: true,
      });
    }
    if (has(c.top_performers)) {
      cards.push({
        key: "top",
        title: "Top performers",
        subtitle: "Highest performance index",
        options: barOptions({
          data: [...c.top_performers].reverse(),
          xKey: "name",
          yKey: "score",
          horizontal: true,
        }),
        full: false,
      });
    }
    if (has(c.manager_index)) {
      cards.push({
        key: "mgr",
        title: "Manager performance index",
        subtitle: "Department heads",
        options: barOptions({
          data: c.manager_index,
          xKey: "name",
          yKey: "score",
          fill: "#8b5cf6",
        }),
        full: false,
      });
    }
    if (has(c.department_goal_achievement)) {
      cards.push({
        key: "goal",
        title: "Goal achievement by department",
        subtitle: "Average achievement rate",
        options: barOptions({
          data: c.department_goal_achievement,
          xKey: "department",
          yKey: "value",
          fill: "#10b981",
        }),
        full: false,
      });
    }
    if (has(c.department_engagement)) {
      cards.push({
        key: "eng",
        title: "Engagement by department",
        subtitle: "Average score (out of 5)",
        options: barOptions({
          data: c.department_engagement,
          xKey: "department",
          yKey: "value",
        }),
        full: false,
      });
    }
    if (has(c.department_learning)) {
      cards.push({
        key: "learn",
        title: "Learning completion by department",
        subtitle: "Average completion %",
        options: barOptions({
          data: c.department_learning,
          xKey: "department",
          yKey: "value",
          fill: "#0891b2",
        }),
        full: false,
      });
    }
    if (has(c.department_meeting_efficiency)) {
      cards.push({
        key: "meet",
        title: "Meeting efficiency by department",
        subtitle: "Average efficiency score",
        options: barOptions({
          data: c.department_meeting_efficiency,
          xKey: "department",
          yKey: "value",
          fill: "#f59e0b",
        }),
        full: false,
      });
    }
    if (has(c.performance_distribution)) {
      cards.push({
        key: "dist",
        title: "Company performance distribution",
        subtitle: `${c.performance_distribution.length} employees`,
        options: histogramOptions(c.performance_distribution),
        full: true,
      });
    }
    if (has(c.performance_vs_wellbeing)) {
      cards.push({
        key: "perf_wellbeing",
        title: "Performance vs wellbeing",
        subtitle: `One point per employee (${c.performance_vs_wellbeing.length} people)`,
        options: scatterOptions({
          data: c.performance_vs_wellbeing,
          xKey: "rating",
          yKey: "wellbeing",
          xLabel: "Overall rating (out of 5)",
          yLabel: "Wellbeing (out of 5)",
        }),
        full: true,
      });
    }
    if (has(c.attendance_by_department)) {
      cards.push({
        key: "attendance",
        title: "Meeting attendance by department",
        subtitle: "Average attendance %",
        options: barOptions({
          data: c.attendance_by_department,
          xKey: "department",
          yKey: "value",
          fill: "#0ea5e9",
        }),
        full: false,
      });
    }
    if (has(c.engagement_by_location)) {
      cards.push({
        key: "engagement_loc",
        title: "Engagement by location",
        subtitle: "Average score (out of 5)",
        options: barOptions({
          data: c.engagement_by_location,
          xKey: "location",
          yKey: "value",
          fill: "#84cc16",
        }),
        full: false,
      });
    }
    if (has(c.department_headcount)) {
      cards.push({
        key: "headcount",
        title: "Headcount by department",
        subtitle: "People per department",
        options: donutOptions({
          data: c.department_headcount,
          labelKey: "department",
        }),
        full: false,
      });
    }
    if (has(c.employment_status)) {
      cards.push({
        key: "status",
        title: "Employment status",
        subtitle: "Company-wide",
        options: donutOptions({
          data: c.employment_status,
          labelKey: "status",
        }),
        full: false,
      });
    }
    if (has(c.location_headcount)) {
      cards.push({
        key: "location",
        title: "Headcount by location",
        subtitle: "People per office",
        options: donutOptions({
          data: c.location_headcount,
          labelKey: "location",
        }),
        full: false,
      });
    }
    if (has(c.low_performance_by_department)) {
      cards.push({
        key: "low_perf",
        title: "Low performers by department",
        subtitle: "Share rated below 3.2",
        options: barOptions({
          data: c.low_performance_by_department,
          xKey: "department",
          yKey: "pct",
          fill: "#ef4444",
        }),
        full: false,
      });
    }
    if (has(c.meeting_cost_by_department)) {
      cards.push({
        key: "meeting_cost",
        title: "Meeting cost by department",
        subtitle: "Total meeting-hours",
        options: barOptions({
          data: c.meeting_cost_by_department,
          xKey: "department",
          yKey: "cost_hours",
          fill: "#f59e0b",
        }),
        full: false,
      });
    }
    if (has(c.meeting_type_efficiency)) {
      cards.push({
        key: "meeting_type",
        title: "Meeting efficiency by type",
        subtitle: "Average efficiency score (out of 5)",
        options: barOptions({
          data: c.meeting_type_efficiency,
          xKey: "type",
          yKey: "efficiency",
          fill: "#6366f1",
        }),
        full: false,
      });
    }
    if (has(c.workspace_utilization)) {
      cards.push({
        key: "workspace",
        title: "Workspace utilization",
        subtitle: "Desk & room occupancy by location",
        options: groupedBarOptions({
          data: c.workspace_utilization,
          xKey: "location",
          series: [
            { yKey: "desk_utilization", name: "Desks %", fill: "#2563eb" },
            { yKey: "room_utilization", name: "Rooms %", fill: "#8b5cf6" },
          ],
        }),
        full: false,
      });
    }
    if (has(c.tenure_distribution)) {
      cards.push({
        key: "tenure",
        title: "Tenure distribution",
        subtitle: "Years of service",
        options: donutOptions({
          data: c.tenure_distribution,
          labelKey: "bucket",
        }),
        full: false,
      });
    }
    if (has(c.learning_not_started_by_department)) {
      cards.push({
        key: "learning_gap",
        title: "Learning not started by department",
        subtitle: "Share of courses not started",
        options: barOptions({
          data: c.learning_not_started_by_department,
          xKey: "department",
          yKey: "not_started_pct",
          fill: "#0891b2",
        }),
        full: false,
      });
    }
    if (has(c.one_on_one_by_manager)) {
      cards.push({
        key: "one_on_one",
        title: "One-on-one cadence by manager",
        subtitle: "One-on-ones organized",
        options: barOptions({
          data: [...c.one_on_one_by_manager].reverse(),
          xKey: "name",
          yKey: "count",
          horizontal: true,
          fill: "#0ea5e9",
        }),
        full: false,
      });
    }

    return cards;
  }, [data, compare]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">
        <div className="animate-pulse">Loading HR dashboard…</div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-900">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">
            HR dashboard unavailable
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
    top_performers,
    departments,
    managers,
    org_kpis,
    insights,
    recommendations,
  } = data;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <SectionNav brand={BRAND} sections={SECTIONS} />
      <div className="px-4 pb-8 pt-6 sm:px-8 lg:pl-[17rem] lg:pr-8">
        <div className="mx-auto max-w-7xl space-y-10">
          {/* Header */}
          <header id="overview" className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <Avatar initials={profile.initials} className="h-16 w-16 text-xl" />
              <div>
                <p className="text-xs font-semibold tracking-widest text-blue-600">
                  HR ANALYTICS
                </p>
                <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
                  Company overview
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Signed in as {profile.Employee_Name} · {profile.Job_Role}
                </p>
              </div>
            </div>
            <a
              href="/"
              className="w-fit rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              Sign out
            </a>
          </header>

          {/* Company headline */}
          <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
              <h2 className="text-lg font-semibold text-slate-900">
                Company performance
              </h2>
            <p className="mt-1 text-sm text-slate-500">
              Average composite index across all employees.
            </p>
            <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
              <span className="font-semibold text-slate-600">How it is scored:</span>{" "}
              each person's index averages performance, engagement, wellbeing and
              meeting efficiency (each × 20) plus goal progress, goal achievement
              and learning completion (as %), capped at 100. Departments average
              their people.
            </p>
              <div className="mt-6 flex flex-col items-center gap-8 sm:flex-row">
                <div className="flex flex-col items-center gap-5">
                  <CompositeRing score={headline.company_composite} />
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    Company index
                  </span>
                </div>
                <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-3">
                  {[
                    ["Employees", headline.employee_count],
                    ["Active", headline.active_count],
                    ["Departments", headline.department_count],
                    ["Managers", headline.manager_count],
                    [
                      "Best dept",
                      headline.best_department
                        ? `${headline.best_department.name} (${headline.best_department.composite_index})`
                        : "—",
                    ],
                    [
                      "Top performer",
                      headline.top_performer
                        ? `${headline.top_performer.name} (${headline.top_performer.score})`
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
                      <p className="mt-1 truncate text-sm font-bold text-slate-900">
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
                  Company insights
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
                  Organisation KPIs and the charts behind them — hover for details.
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
            {org_kpis?.length > 0 && (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {org_kpis
                .filter((kpi) => !HIDDEN_KPIS.has(kpi.key))
                .map((kpi) => (
                <FlipCard
                  key={kpi.key}
                  className="rounded-2xl border border-slate-200 bg-white shadow-sm"
                  how={KPI_EXPLAIN[kpi.key]}
                  item={kpi}
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
                </FlipCard>
              ))}
              </div>
            )}
            {chartCards.length > 0 && (
              <div className="mt-8">
                <h3 className="mb-4 text-lg font-semibold text-slate-900">
                  KPI charts
                </h3>
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {chartCards.map(({ key, ...cardProps }) => (
                  <ChartCard key={key} chartKey={key} {...cardProps} />
                ))}
                </div>
              </div>
            )}
          </section>

          {/* Top performers + managers */}
          <section id="people" className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Leaderboard rows={top_performers} onPick={openPerson} />

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">
                  Department managers
                </h2>
                <span className="text-xs text-slate-400">{managers.length}</span>
              </div>
              <div className="mt-4 max-h-[28rem] overflow-auto rounded-xl border border-slate-100">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Manager</th>
                      <th className="px-3 py-2 text-right font-medium">Team</th>
                      <th className="px-3 py-2 text-right font-medium">Index</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managers.map((m, i) => (
                      <tr
                        key={m.employee_id}
                        onClick={() => openPerson(m.employee_id, true)}
                        className="cursor-pointer border-b border-slate-100 hover:bg-blue-50/60"
                      >
                        <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2">
                          <span className="font-medium text-slate-800">
                            {m.name}
                          </span>
                          <span className="block text-[11px] text-slate-400">
                            {m.department}
                            {m.standing ? ` · ${m.standing}` : ""}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-600">
                          {m.team_size}
                          <span className="block text-[11px] text-slate-400">
                            team {m.team_index}
                          </span>
                        </td>
                        <td
                          className="px-3 py-2 text-right font-semibold"
                          style={{ color: scoreColor(m.composite) }}
                        >
                          {m.composite?.toFixed(1) ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Departments */}
          <section id="departments">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-slate-900">
                Departments
              </h2>
              <p className="text-sm text-slate-500">
                Performance, manager and every employee in each department.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {departments.map((dept) => (
                <DepartmentCard
                  key={dept.department_id}
                  dept={dept}
                  onPick={openPerson}
                />
              ))}
            </div>
          </section>

          {/* Insights grid */}
          <section id="insights">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">
                All insights
              </h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                {insights.length} insights
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {insights.map((insight, index) => (
                <InsightCard
                  key={`${insight.title}-${index}`}
                  insight={insight}
                />
              ))}
            </div>
          </section>

          <footer className="pb-6 text-center text-xs text-slate-400">
            HR Analytics Portal · {headline.employee_count} employees ·{" "}
            {headline.department_count} departments
          </footer>
        </div>
      </div>

      {selected && (
        <Drilldown employeeId={selected} onClose={() => setSelected(null)} />
      )}
    </main>
  );
}
