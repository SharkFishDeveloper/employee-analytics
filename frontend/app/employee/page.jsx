"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AgCharts } from "ag-charts-react";
import { ModuleRegistry, AllCommunityModule } from "ag-charts-community";
import SectionNav from "@/components/SectionNav";
import FlipCard from "@/components/FlipCard";
import { KPIS as KPI_EXPLAIN, CHARTS as CHART_EXPLAIN } from "@/components/explain/employee";

ModuleRegistry.registerModules([AllCommunityModule]);

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "recommendations", label: "Recommendations" },
  { id: "kpis", label: "KPIs & charts" },
  { id: "benchmark", label: "Benchmark table" },
  { id: "insights", label: "Insights" },
  { id: "details", label: "Goals & learning" },
  { id: "context", label: "Meetings & context" },
];

const BRAND = {
  initials: "E",
  title: "Employee Analytics",
  subtitle: "Personal dashboard",
  footer: "Individual view, compared against the whole company.",
};

// ---------------------------------------------------------------------------
// Theme / palette (light)
// ---------------------------------------------------------------------------
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

const KPI_GROUPS = [
  "Productivity",
  "Wellbeing",
  "Work location",
  "Sustainability",
  "Meetings",
  "Learning",
  "Performance",
  "Goals",
];

// KPIs hidden from the frontend everywhere (cards, tables, charts).
const HIDDEN_KPIS = new Set([
  "co2_saved",
  "renewable",
  "renewable_energy",
  "commute_distance_saved",
]);

// Hide any insight/recommendation text that mentions CO2 / emissions.
const CO2_RE = /co2|co₂|emission/i;
const hasCo2 = (obj) => CO2_RE.test(JSON.stringify(obj || {}));

// ---------------------------------------------------------------------------
// Formatting helpers
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

// ---------------------------------------------------------------------------
// Chart option builders (free community series only: bar/line/area/donut)
// ---------------------------------------------------------------------------
const categoryAxis = (horizontal) =>
  horizontal
    ? { type: "category", position: "left" }
    : { type: "category", position: "bottom" };

const numberAxis = (horizontal) =>
  horizontal
    ? { type: "number", position: "bottom" }
    : { type: "number", position: "left" };

function buildOptions(spec, { compare }) {
  const base = {
    theme: chartTheme,
    background: { fill: "transparent" },
    data: spec.data,
  };

  if (spec.kind === "donut") {
    return {
      ...base,
      series: [
        {
          type: "donut",
          angleKey: "count",
          legendItemKey: spec.labelKey,
          calloutLabelKey: spec.labelKey,
          innerRadiusRatio: 0.62,
          cornerRadius: 4,
          strokeWidth: 2,
          tooltip: {
            renderer: ({ datum }) => ({
              title: String(datum[spec.labelKey]),
              content: `You: ${datum.count}\nCompany avg: ${
                datum.company_avg ?? "—"
              }`,
            }),
          },
        },
      ],
    };
  }

  if (spec.kind === "scatter") {
    const series = [
      {
        type: "scatter",
        xKey: spec.xKey,
        yKey: spec.yKey,
        xName: spec.xLabel || spec.xKey,
        yName: spec.yLabel || spec.yKey,
        fill: BLUE,
        stroke: BLUE,
        marker: { size: 12, fillOpacity: 0.85, strokeOpacity: 0.35 },
      },
    ];
    if (compare) {
      series.push({
        type: "scatter",
        xKey: `company_${spec.xKey}`,
        yKey: `company_${spec.yKey}`,
        xName: `Company ${spec.xLabel || spec.xKey}`,
        yName: "Company avg",
        fill: GRAY,
        stroke: GRAY,
        marker: { size: 8, fillOpacity: 0.35, strokeOpacity: 0.4 },
      });
    }
    return {
      ...base,
      axes: [
        { type: "number", position: "bottom", title: { text: spec.xLabel } },
        { type: "number", position: "left", title: { text: spec.yLabel } },
      ],
      series,
    };
  }

  const horizontal = spec.kind === "horizontal-bar";
  const axes = [categoryAxis(horizontal), numberAxis(horizontal)];
  const series = [];

  const youSeries = {
    bar: {
      type: "bar",
      xKey: spec.xKey,
      yKey: spec.valueKey,
      yName: "You",
      fill: BLUE,
      cornerRadius: 4,
    },
    line: {
      type: "line",
      xKey: spec.xKey,
      yKey: spec.valueKey,
      yName: "You",
      stroke: BLUE,
      strokeWidth: 3,
      marker: { enabled: true, size: 5, fill: BLUE, stroke: BLUE },
    },
    area: {
      type: "area",
      xKey: spec.xKey,
      yKey: spec.valueKey,
      yName: "You",
      stroke: BLUE,
      strokeWidth: 2.5,
      fill: BLUE,
      fillOpacity: 0.22,
      marker: { enabled: true, size: 4, fill: BLUE, stroke: BLUE },
    },
  }[
    spec.youShape ||
      (spec.kind === "area-line" ? "area" : spec.kind === "line" ? "line" : "bar")
  ];

  const companySeries = {
    bar: {
      type: "bar",
      xKey: spec.xKey,
      yKey: "company_avg",
      yName: "Company avg",
      fill: GRAY,
      cornerRadius: 4,
    },
    line: {
      type: "line",
      xKey: spec.xKey,
      yKey: "company_avg",
      yName: "Company avg",
      stroke: GRAY,
      strokeWidth: 2,
      lineDash: [6, 4],
      marker: { enabled: true, size: 4, fill: GRAY, stroke: GRAY },
    },
    area: {
      type: "area",
      xKey: spec.xKey,
      yKey: "company_avg",
      yName: "Company avg",
      stroke: GRAY,
      strokeWidth: 2,
      fill: GRAY,
      fillOpacity: 0.1,
      lineDash: [6, 4],
      marker: { enabled: true, size: 3, fill: GRAY, stroke: GRAY },
    },
  }[
    spec.companyShape ||
      (["bar-line", "line", "area-line"].includes(spec.kind) ? "line" : "bar")
  ];

  series.push(youSeries);
  if (compare) series.push(companySeries);

  return { ...base, axes, series };
}

// ---------------------------------------------------------------------------
// KPI card (redesigned)
// ---------------------------------------------------------------------------
function KpiCard({ kpi }) {
  const { label, unit, value, benchmark } = kpi;
  const company = benchmark?.company_avg;
  const note =
    company != null
      ? `Company avg ${formatValue(company, unit)}`
      : null;

  return (
    <FlipCard
      className="rounded-2xl border border-slate-200 bg-white shadow-sm"
      how={KPI_EXPLAIN[kpi.key]}
      item={kpi}
    >
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
        {formatValue(value, "")}
        {unit ? (
          <span className="ml-1 text-lg font-semibold text-slate-400">
            {unit}
          </span>
        ) : null}
      </p>
      {note && (
        <p className="mt-2 text-xs leading-5 text-slate-400">{note}</p>
      )}
    </FlipCard>
  );
}

function ChartCard({ card }) {
  return (
    <FlipCard
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${
        card.full ? "lg:col-span-2" : ""
      }`}
      how={CHART_EXPLAIN[card.key]}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900">{card.title}</h3>
        <span className="text-[11px] text-slate-400">{card.subtitle}</span>
      </div>
      <div className="h-72 w-full">
        <AgCharts options={card.options} />
      </div>
    </FlipCard>
  );
}

// ---------------------------------------------------------------------------
// AI recommendations (rule-based, generated from the live KPI data)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Composite ring (with clear spacing to the standing label)
// ---------------------------------------------------------------------------
function CompositeRing({ score }) {
  const value = score ?? 0;
  const deg = Math.max(0, Math.min(100, value)) * 3.6;
  const color =
    value >= 75 ? "#10b981" : value >= 60 ? "#2563eb" : value >= 45 ? "#f59e0b" : "#f43f5e";
  return (
    <div
      className="relative flex h-40 w-40 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(${color} ${deg}deg, #e2e8f0 ${deg}deg)`,
      }}
    >
      <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-white">
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

// ---------------------------------------------------------------------------
// Ranking panel with company / department scope
// ---------------------------------------------------------------------------
function Ranking({ headline, departmentName }) {
  const [scope, setScope] = useState("company");
  const scrollRef = useRef(null);

  const list =
    scope === "company"
      ? headline.ranking || []
      : headline.department_ranking || [];

  useEffect(() => {
    const el = scrollRef.current?.querySelector("[data-you='true']");
    if (el && scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, el.offsetTop - 120);
    }
  }, [scope, list]);

  const tabs = [
    ["company", "Company"],
    ["department", departmentName || "Department"],
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Team ranking</h2>
        <span className="text-xs text-slate-400">{list.length} people</span>
      </div>

      <div className="mb-3 inline-flex rounded-lg bg-slate-100 p-1">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setScope(key)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              scope === key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        ref={scrollRef}
        className="max-h-72 overflow-y-auto rounded-xl border border-slate-100"
      >
        <table className="w-full text-sm">
          <tbody>
            {list.map((row) => (
              <tr
                key={row.employee_id}
                data-you={row.is_you ? "true" : "false"}
                className={
                  row.is_you
                    ? "bg-blue-50"
                    : row.rank % 2
                    ? "bg-white"
                    : "bg-slate-50"
                }
              >
                <td className="w-10 py-2 pl-3 text-right font-mono text-xs text-slate-400">
                  {row.rank}
                </td>
                <td className="py-2 pl-3 text-slate-700 text-sm">
                  {row.name}
                  {row.is_you && (
                    <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                      You
                    </span>
                  )}
                </td>
                <td className="py-2 text-right text-xs text-slate-400">
                  {row.department}
                </td>
                <td className="py-2 pr-3 text-right font-semibold text-slate-700">
                  {row.score?.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProgressBar({ value, max = 100, tone = "blue" }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100 || 0));
  const colors = {
    blue: "bg-blue-500",
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-rose-500",
  };
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
      <div className={`h-full rounded-full ${colors[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value ?? "—"}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------
export default function EmployeeDashboard() {
  const [employeeId, setEmployeeId] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [compare, setCompare] = useState(true);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmployeeId(params.get("employee_id") || "");
  }, []);

  useEffect(() => {
    if (!employeeId) {
      setLoading(false);
      setError("Employee ID is missing. Return to the login page.");
      return;
    }

    const controller = new AbortController();

    async function fetchDashboard() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `${API_URL}/employee/?employee_id=${encodeURIComponent(employeeId)}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.detail || `Request failed: ${response.status}`);
        }
        setDashboard(await response.json());
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to load dashboard.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    fetchDashboard();
    return () => controller.abort();
  }, [employeeId]);

  const chartCards = useMemo(() => {
    if (!dashboard) return [];
    const c = dashboard.charts;
    const specs = [
      {
        key: "weekly_work_hours",
        title: "Weekly working hours",
        subtitle: `${c.weekly_work_hours?.length || 0} weeks`,
        kind: "bar-line",
        xKey: "week",
        valueKey: "hours",
        unit: "h",
        full: true,
      },
      {
        key: "weekly_focus_hours",
        title: "Weekly individual hours",
        subtitle: "Total hours minus collaboration per week",
        kind: "area-line",
        xKey: "week",
        valueKey: "hours",
        unit: "h",
      },
      {
        key: "engagement_trend",
        title: "Engagement trend",
        subtitle: "Score out of 5 by week",
        kind: "line",
        xKey: "week",
        valueKey: "score",
        unit: "score",
      },
      {
        key: "wellbeing_trend",
        title: "Wellbeing trend",
        subtitle: "Score out of 5 by week",
        kind: "line",
        xKey: "week",
        valueKey: "score",
        unit: "score",
      },
      {
        key: "focus_vs_collaboration",
        title: "Individual vs collaboration",
        subtitle: "Average hours per week",
        kind: "grouped-bar",
        xKey: "activity",
        valueKey: "hours",
        unit: "h",
      },
      {
        key: "office_vs_remote_days",
        title: "Office vs remote days",
        subtitle: "Total days in period",
        kind: "grouped-bar",
        xKey: "work_mode",
        valueKey: "days",
        unit: "days",
      },
      {
        key: "work_mode_distribution",
        title: "Work-mode mix",
        subtitle: "Records by mode",
        kind: "donut",
        labelKey: "Work_Mode",
      },
      {
        key: "performance_dimensions",
        title: "Performance profile",
        subtitle: "You vs company across dimensions",
        kind: "grouped-bar",
        xKey: "dimension",
        valueKey: "score",
        unit: "score",
        full: true,
      },
      {
        key: "learning_by_skill_category",
        title: "Learning completion by skill",
        subtitle: "Average completion %",
        kind: "grouped-bar",
        xKey: "Skill_Category",
        valueKey: "completion_rate",
        unit: "%",
        full: true,
      },
      {
        key: "learning_status_distribution",
        title: "Course status mix",
        subtitle: "Records by status",
        kind: "donut",
        labelKey: "Course_Status",
      },
      {
        key: "goal_progress_by_priority",
        title: "Goal progress by priority",
        subtitle: "Average progress % vs company",
        kind: "grouped-bar",
        xKey: "Priority",
        valueKey: "progress",
        unit: "%",
      },
      {
        key: "goal_status_distribution",
        title: "Goal status",
        subtitle: "Goals by status",
        kind: "grouped-bar",
        xKey: "Goal_Status",
        valueKey: "count",
        unit: "goals",
      },
      {
        key: "goal_priority_distribution",
        title: "Goal priority",
        subtitle: "Goals by priority",
        kind: "donut",
        labelKey: "Priority",
      },
      {
        key: "meeting_performance",
        title: "Meeting performance",
        subtitle: "Percentage vs company average",
        kind: "grouped-bar",
        xKey: "metric",
        valueKey: "value",
        unit: "%",
        full: true,
      },
    ];

    return specs
      .filter((spec) => (c[spec.key] || []).length > 0)
      .map((spec) => {
        const withData = { ...spec, data: c[spec.key] || [] };
        return {
          ...withData,
          options: buildOptions(withData, { compare }),
        };
      });
  }, [dashboard, compare]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">
        <div className="animate-pulse">Loading dashboard…</div>
      </main>
    );
  }

  if (error || !dashboard) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-900">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">Dashboard unavailable</h1>
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
    kpis,
    headline,
    insights: rawInsights = [],
    recommendations: rawRecommendations,
    details,
    context,
  } = dashboard;
  const insights = rawInsights.filter((i) => !hasCo2(i));
  const recommendations = rawRecommendations
    ? {
        ...rawRecommendations,
        items: (rawRecommendations.items || []).filter((i) => !hasCo2(i)),
      }
    : rawRecommendations;
  const kpiList = Object.values(kpis).filter(
    (k) => !HIDDEN_KPIS.has(k.key)
  );
  const primary = kpiList.filter((k) => k.primary);
  const grouped = KPI_GROUPS.map((group) => ({
    group,
    items: kpiList.filter((k) => k.group === group),
  })).filter((g) => g.items.length > 0);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <SectionNav brand={BRAND} sections={SECTIONS} />
      <div className="px-4 pb-8 pt-6 sm:px-8 lg:pl-[17rem] lg:pr-8">
        <div className="mx-auto max-w-7xl space-y-10">
          {/* Header */}
          <header
            id="overview"
            className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-500 text-xl font-bold text-white shadow-sm">
                {profile.initials}
              </div>
              <div>
                <p className="text-xs font-semibold tracking-widest text-blue-600">
                  EMPLOYEE ANALYTICS
                </p>
                <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
                  {profile.Employee_Name}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {profile.Job_Role} · {profile.Department} · {profile.Location}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                    {profile.Employee_ID}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                    {profile.Employment_Type}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                    {profile.Work_Preference}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                    {profile.Active_Status}
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

          {/* Hero: composite standing + ranking */}
          <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
              <h2 className="text-lg font-semibold text-slate-900">Where you stand</h2>
            <p className="mt-1 text-sm text-slate-500">
              A composite index built from performance, engagement, wellbeing,
              goal progress, learning and meeting efficiency.
            </p>
            <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
              <span className="font-semibold text-slate-600">How it is scored:</span>{" "}
              the average of performance, engagement, wellbeing and meeting
              efficiency (each × 20) plus goal progress, goal achievement and
              learning completion (as %). Every part is capped at 100.
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
                    [
                      "Company rank",
                      headline.rank ? `#${headline.rank} / ${headline.peers}` : "—",
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center"
                    >
                      <p className="text-[11px] uppercase tracking-wide text-slate-400">
                        {label}
                      </p>
                      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
                    </div>
                  ))}
                  <div className="col-span-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-center sm:col-span-4">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">
                      Department ranking
                    </p>
                    <p className="mt-1 text-xl font-bold text-slate-900">
                      {headline.department_rank
                        ? `#${headline.department_rank} of ${headline.department_peers} in ${context.department.name}`
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <Ranking headline={headline} departmentName={context.department.name} />
          </section>

          {/* AI recommendations */}
          <Recommendations data={recommendations} />

          {/* KPIs */}
          <section id="kpis">
            <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">KPIs</h2>
                <p className="text-sm text-slate-500">
                  Your key metrics and the charts behind them, compared with all{" "}
                  {headline.peers} employees.
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
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {primary.map((kpi) => (
                <KpiCard key={kpi.key} kpi={kpi} />
              ))}
            </div>
            {chartCards.length > 0 && (
              <div className="mt-8">
                <h3 className="mb-4 text-lg font-semibold text-slate-900">
                  KPI charts
                </h3>
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  {chartCards.map((card) => (
                    <ChartCard key={card.key} card={card} />
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Benchmark table */}
          <section
            id="benchmark"
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">
                Full benchmark table
              </h2>
              <button
                type="button"
                onClick={() => setShowTable((v) => !v)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                {showTable ? "Hide" : "Show"}
              </button>
            </div>

            {showTable && (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-3 py-2">Metric</th>
                      <th className="px-3 py-2 text-right">You</th>
                      <th className="px-3 py-2 text-right">Company avg</th>
                      <th className="px-3 py-2 text-right">Dept avg</th>
                      <th className="px-3 py-2 text-right">Rank</th>
                      <th className="px-3 py-2 text-right">Standing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.map((g) => (
                      <React.Fragment key={g.group}>
                        <tr className="bg-slate-50">
                          <td
                            colSpan={6}
                            className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-blue-600"
                          >
                            {g.group}
                          </td>
                        </tr>
                        {g.items.map((kpi) => (
                          <tr
                            key={kpi.key}
                            className="border-b border-slate-100 hover:bg-slate-50"
                          >
                            <td className="px-3 py-2 text-slate-700">{kpi.label}</td>
                            <td className="px-3 py-2 text-right font-medium text-slate-900">
                              {formatValue(kpi.value, kpi.unit)}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-500">
                              {formatValue(kpi.benchmark?.company_avg, kpi.unit)}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-500">
                              {formatValue(kpi.benchmark?.department_avg, kpi.unit)}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-500">
                              {kpi.benchmark?.rank ?? "—"}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {kpi.benchmark?.standing ? (
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${standingColor(
                                    kpi.benchmark.standing
                                  )}`}
                                >
                                  {kpi.benchmark.standing}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Insights */}
          <section id="insights">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">
                Personalized insights
              </h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                {insights.length} insights
              </span>
            </div>
            {insights.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {insights.map((insight, index) => {
                  const style = SEVERITY[insight.severity] || SEVERITY.info;
                  return (
                    <article
                      key={`${insight.title}-${index}`}
                      className={`rounded-2xl border p-5 ${style.card}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold text-slate-900">
                          {insight.title}
                        </h3>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.badge}`}
                        >
                          {style.label}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        {insight.message}
                      </p>
                      <p className="mt-3 text-[11px] uppercase tracking-wide text-blue-600">
                        {insight.category}
                      </p>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-500">
                No insights available for this employee.
              </p>
            )}
          </section>

          {/* Details */}
          <section id="details" className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Goals */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Goals</h2>
              <div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
                {(details.goals || []).map((goal, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">
                        {goal.goal}
                      </p>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                        {goal.priority}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <ProgressBar
                        value={goal.progress}
                        tone={
                          goal.progress >= 75
                            ? "green"
                            : goal.progress >= 40
                            ? "amber"
                            : "red"
                        }
                      />
                      <span className="w-10 text-right text-xs font-semibold text-slate-600">
                        {goal.progress?.toFixed?.(0) ?? goal.progress}%
                      </span>
                    </div>
                    <div className="mt-1.5 flex justify-between text-[11px] text-slate-400">
                      <span>{goal.category}</span>
                      <span>
                        {goal.status} · due {goal.due_date}
                      </span>
                    </div>
                  </div>
                ))}
                {(!details.goals || details.goals.length === 0) && (
                  <p className="text-sm text-slate-400">No goals recorded.</p>
                )}
              </div>
            </div>

            {/* Learning */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Learning</h2>
              <div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
                {(details.learning_courses || []).map((course, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">
                        {course.course}
                      </p>
                      {course.certification_earned &&
                        String(course.certification_earned).toLowerCase() === "yes" && (
                          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">
                            Certified
                          </span>
                        )}
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <ProgressBar
                        value={(course.completion_rate ?? 0) * 100}
                        tone={
                          (course.completion_rate ?? 0) >= 0.9
                            ? "green"
                            : (course.completion_rate ?? 0) >= 0.5
                            ? "amber"
                            : "red"
                        }
                      />
                      <span className="w-10 text-right text-xs font-semibold text-slate-600">
                        {Math.round((course.completion_rate ?? 0) * 100)}%
                      </span>
                    </div>
                    <div className="mt-1.5 flex justify-between text-[11px] text-slate-400">
                      <span>{course.skill_category}</span>
                      <span>
                        {course.status}
                        {course.assessment_score != null
                          ? ` · score ${course.assessment_score}`
                          : ""}
                      </span>
                    </div>
                  </div>
                ))}
                {(!details.learning_courses ||
                  details.learning_courses.length === 0) && (
                  <p className="text-sm text-slate-400">No courses recorded.</p>
                )}
              </div>
            </div>
          </section>

          {/* Meeting + context */}
          <section id="context" className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                Meeting summary
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  ["Organised", details.meeting_summary.organized, ""],
                  ["Hours", details.meeting_summary.hours, "h"],
                  ["Attendance", details.meeting_summary.attendance_rate, "%"],
                  ["Actions done", details.meeting_summary.action_completion, "%"],
                ].map(([label, value, unit]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                  >
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">
                      {label}
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {formatValue(value, unit)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Long meetings (&gt; 60 min)
                </p>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {(details.long_meetings || []).slice(0, 4).map((m, i) => (
                    <li key={i} className="flex justify-between">
                      <span>
                        {m.Meeting_Type} · {m.Meeting_Date}
                      </span>
                      <span className="text-slate-400">{m.Duration_Minutes} min</span>
                    </li>
                  ))}
                  {(!details.long_meetings || details.long_meetings.length === 0) && (
                    <li className="text-slate-400">None recorded.</li>
                  )}
                </ul>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Department</h2>
              <div className="mt-4 space-y-3 text-sm">
                <Row label="Department" value={context.department.name} />
                <Row label="Head" value={context.department.head} />
                <Row
                  label="Department size"
                  value={`${context.department.employee_count} people`}
                />
                <Row label="Your manager" value={profile.manager_name || "—"} />
                <Row label="Joined" value={profile.Join_Date} />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                Location resources
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                {profile.Location} office · company-level figures
              </p>
              <div className="mt-4 space-y-4">
                {[
                  ["Desk utilization", context.location_resources?.Desk_Utilization],
                  ["Room utilization", context.location_resources?.Room_Utilization],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">{label}</span>
                      <span className="font-medium text-slate-800">
                        {value == null ? "—" : `${Math.round(value * 100)}%`}
                      </span>
                    </div>
                    <div className="mt-1">
                      <ProgressBar value={(value ?? 0) * 100} tone="green" />
                    </div>
                  </div>
                ))}
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Energy consumed</span>
                  <span className="font-medium text-slate-800">
                    {context.location_resources?.Energy_Consumed_kWh ?? "—"} kWh
                  </span>
                </div>
              </div>
            </div>
          </section>

          <footer className="pb-6 text-center text-xs text-slate-400">
            Employee Analytics Portal · Company averages from {headline.peers}{" "}
            employees
          </footer>
        </div>
      </div>
    </main>
  );
}
