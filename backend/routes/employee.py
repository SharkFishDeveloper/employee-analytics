"""Employee analytics dashboard.

This module is intentionally self-contained (no separate analytics module).
It loads the CSVs in ``backend/data`` and produces a rich, benchmarked view of a
single employee: KPIs, how the employee compares with every other employee
(company average, department average, percentile and rank) and an interactive
set of chart datasets that always include the company average for comparison.
"""

from pathlib import Path
import math
import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from routes.recommendations import employee_recommendations


router = APIRouter(prefix="/employee", tags=["Employee Dashboard"])

DATA = Path(__file__).resolve().parent.parent / "data"

TRUE_VALUES = {"true", "yes", "1", "y", "t"}

# Performance review columns exposed as a radar / dimension chart.
PERFORMANCE_DIMENSIONS = [
    ("Overall_Rating", "Overall"),
    ("Quality_Score", "Quality"),
    ("Delivery_Score", "Delivery"),
    ("Teamwork_Score", "Teamwork"),
    ("Communication_Score", "Communication"),
]


# ---------------------------------------------------------------------------
# Data loading / generic helpers
# ---------------------------------------------------------------------------

def load(filename):
    """Load a CSV from the data directory into a DataFrame (empty if missing)."""
    path = DATA / filename
    return pd.read_csv(path) if path.exists() else pd.DataFrame()


def records(filename):
    frame = load(filename)
    return frame if frame is not None else pd.DataFrame()


def numeric(series):
    return pd.to_numeric(series, errors="coerce")


def to_num(df, column):
    if df.empty or column not in df.columns:
        return pd.Series(dtype=float)
    return numeric(df[column]).dropna()


def clean(value):
    """Convert pandas/numpy values into JSON-safe Python values."""
    if value is None:
        return None
    if hasattr(value, "item"):
        value = value.item()
    if value is pd.NaT:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def json_records(df):
    if df.empty:
        return []
    frame = df.copy()
    for column in frame.columns:
        if pd.api.types.is_datetime64_any_dtype(frame[column]):
            frame[column] = frame[column].astype(str)
    return [
        {str(k): clean(v) for k, v in row.items()}
        for row in frame.to_dict(orient="records")
    ]


def mean_of(values):
    values = [v for v in values if v is not None and not pd.isna(v)]
    return round(float(sum(values) / len(values)), 2) if values else None


def ids_equal(series, value):
    return series.astype(str).str.strip() == str(value).strip()


# ---------------------------------------------------------------------------
# Per-employee aggregation (used both for the person and for benchmarks)
# ---------------------------------------------------------------------------

def employee_agg(df, id_col, value_col, how="mean", scale=1.0):
    """Return {employee_id: aggregated_value} for a numeric column."""
    if df.empty or id_col not in df.columns or value_col not in df.columns:
        return {}
    temp = df[[id_col, value_col]].copy()
    temp[value_col] = numeric(temp[value_col])
    temp = temp.dropna()
    if temp.empty:
        return {}
    grouped = temp.groupby(id_col)[value_col].agg(how)
    return {
        str(k): round(float(v) * scale, 2)
        for k, v in grouped.items()
        if pd.notna(v)
    }


def employee_ratio(df, id_col, num_col, den_col, scale=100.0):
    """Return {employee_id: sum(num)/sum(den) * scale}."""
    if df.empty or not {id_col, num_col, den_col}.issubset(df.columns):
        return {}
    temp = df[[id_col, num_col, den_col]].copy()
    temp[num_col] = numeric(temp[num_col])
    temp[den_col] = numeric(temp[den_col])
    temp = temp.dropna()
    if temp.empty:
        return {}
    grouped = temp.groupby(id_col)[[num_col, den_col]].sum()
    grouped = grouped[grouped[den_col] > 0]
    return {
        str(k): round(float(row[num_col]) / float(row[den_col]) * scale, 2)
        for k, row in grouped.iterrows()
    }


def employee_true_rate(df, id_col, flag_col, scale=100.0):
    """Return {employee_id: share_of_true_values * scale}."""
    if df.empty or not {id_col, flag_col}.issubset(df.columns):
        return {}
    temp = df[[id_col, flag_col]].copy()
    temp[flag_col] = temp[flag_col].astype(str).str.strip().str.lower()
    grouped = temp.groupby(id_col)[flag_col].apply(
        lambda s: s.isin(TRUE_VALUES).mean()
    )
    return {str(k): round(float(v) * scale, 2) for k, v in grouped.items()}


def employee_true_count(df, id_col, flag_col):
    if df.empty or not {id_col, flag_col}.issubset(df.columns):
        return {}
    temp = df[[id_col, flag_col]].copy()
    temp[flag_col] = temp[flag_col].astype(str).str.strip().str.lower()
    grouped = temp.groupby(id_col)[flag_col].apply(
        lambda s: int(s.isin(TRUE_VALUES).sum())
    )
    return {str(k): int(v) for k, v in grouped.items()}


def employee_count_where(df, id_col, match_col, values):
    if df.empty or not {id_col, match_col}.issubset(df.columns):
        return {}
    temp = df[[id_col, match_col]].copy()
    temp[match_col] = temp[match_col].astype(str).str.strip().str.lower()
    wanted = {str(v).lower() for v in values}
    grouped = temp.groupby(id_col)[match_col].apply(
        lambda s: int(s.isin(wanted).sum())
    )
    return {str(k): int(v) for k, v in grouped.items()}


# ---------------------------------------------------------------------------
# Benchmarking
# ---------------------------------------------------------------------------

def build_benchmark(series, employee_id, dept_by_id, department,
                    higher_is_better=True, scale=1.0):
    """Compare the employee's metric against the whole company and department."""
    if not series:
        return None

    if employee_id in series:
        mine = series[employee_id]
    elif str(employee_id) in series:
        mine = series[str(employee_id)]
    else:
        return None

    values = [v for v in series.values() if v is not None and not pd.isna(v)]
    if not values:
        return None

    org_avg = mean_of(values)
    count = len(values)

    dept_values = [
        v for k, v in series.items()
        if dept_by_id.get(str(k)) == department
    ]
    dept_avg = mean_of(dept_values)

    if higher_is_better:
        better = sum(1 for v in values if v > mine)
        at_or_above = sum(1 for v in values if v <= mine)
    else:
        better = sum(1 for v in values if v < mine)
        at_or_above = sum(1 for v in values if v >= mine)

    rank = better + 1
    percentile = round(at_or_above / count * 100, 1)
    delta = round(mine - org_avg, 2) if org_avg is not None else None
    delta_pct = (
        round((mine - org_avg) / org_avg * 100, 1)
        if org_avg not in (None, 0) else None
    )

    return {
        "employee_value": clean(mine),
        "company_avg": org_avg,
        "department_avg": dept_avg,
        "delta": delta,
        "delta_pct": delta_pct,
        "percentile": percentile,
        "rank": rank,
        "percentile_rank": round((count - rank + 1) / count * 100, 1),
        "peers": count,
        "higher_is_better": higher_is_better,
        "standing": _standing_label(percentile, higher_is_better),
    }


def _standing_label(percentile, higher_is_better=True):
    # ``percentile`` is already a goodness percentile: build_benchmark flips
    # the comparison direction so a higher value always means a better rank,
    # regardless of whether the underlying metric is higher- or lower-is-better.
    score = percentile
    if score >= 90:
        return "Top 10%"
    if score >= 75:
        return "Top 25%"
    if score >= 50:
        return "Above average"
    if score >= 25:
        return "Below average"
    return "Bottom 25%"


# ---------------------------------------------------------------------------
# Chart builders (every comparative series carries a company average)
# ---------------------------------------------------------------------------

def weekly_compare(df, employee_id, value_col, how, value_key, scale=1.0):
    if df.empty or not {"Week_Start", "Employee_ID", value_col}.issubset(df.columns):
        return []

    temp = df[["Week_Start", "Employee_ID", value_col]].copy()
    temp[value_col] = numeric(temp[value_col])
    temp = temp.dropna()
    if temp.empty:
        return []

    pivot = (
        temp.groupby(["Week_Start", "Employee_ID"])[value_col]
        .agg(how)
        .unstack("Employee_ID")
    )

    mine = df[ids_equal(df["Employee_ID"], employee_id)]
    weeks = sorted(str(w) for w in mine["Week_Start"].dropna().unique())
    if not weeks:
        weeks = [str(w) for w in pivot.index]

    result = []
    for week in weeks:
        if week not in pivot.index:
            continue
        row = pivot.loc[week]
        personal = row.get(employee_id)
        company = row.mean(skipna=True)
        result.append({
            "week": week,
            value_key: (
                round(float(personal) * scale, 2)
                if personal is not None and pd.notna(personal) else None
            ),
            "company_avg": (
                round(float(company) * scale, 2)
                if company is not None and pd.notna(company) else None
            ),
        })
    return result


def category_compare(df, employee_id, category_col, value_col, how,
                     value_key, scale=1.0, id_col="Employee_ID"):
    """Per-category comparison of one employee vs the company average.

    Company average is computed fairly: first aggregate each employee within the
    category, then average those per-employee values.
    """
    if df.empty or not {id_col, category_col, value_col}.issubset(df.columns):
        return []

    temp = df[[id_col, category_col, value_col]].copy()
    temp[value_col] = numeric(temp[value_col])
    temp = temp.dropna(subset=[category_col, value_col])
    if temp.empty:
        return []

    per_employee = temp.groupby([category_col, id_col])[value_col].agg(how)
    company = per_employee.groupby(category_col).mean()

    mine_rows = temp[ids_equal(temp[id_col], employee_id)]
    mine = mine_rows.groupby(category_col)[value_col].agg(how)

    categories = list(dict.fromkeys(list(mine.index) + list(company.index)))
    result = []
    for cat in categories:
        personal = mine.get(cat)
        company_value = company.get(cat)
        result.append({
            str(category_col): str(cat),
            value_key: (
                round(float(personal) * scale, 2)
                if personal is not None and pd.notna(personal) else None
            ),
            "company_avg": (
                round(float(company_value) * scale, 2)
                if company_value is not None and pd.notna(company_value) else None
            ),
        })
    return result


def distribution_compare(df, employee_id, category_col, id_col="Employee_ID"):
    """Counts per category for the employee plus the company average count."""
    if df.empty or not {id_col, category_col}.issubset(df.columns):
        return []

    temp = df[[id_col, category_col]].copy()
    temp = temp.dropna(subset=[category_col])

    per_employee = (
        temp.groupby([id_col, category_col]).size().rename("count").reset_index()
    )
    company = per_employee.groupby(category_col)["count"].mean()

    mine = temp[ids_equal(temp[id_col], employee_id)][category_col].value_counts()

    categories = list(dict.fromkeys(list(mine.index) + list(company.index)))
    result = []
    for cat in categories:
        count = int(mine.get(cat, 0))
        result.append({
            category_col: str(cat),
            "count": count,
            "company_avg": round(float(company.get(cat, 0)), 2),
        })
    return result


# ---------------------------------------------------------------------------
# Insights
# ---------------------------------------------------------------------------

def add_insight(insights, category, severity, title, message, metric=None):
    insights.append({
        "category": category,
        "severity": severity,
        "title": title,
        "message": message,
        "metric": metric,
    })


def benchmark_insight(insights, kpi, category, good_threshold, low_threshold,
                      good_title, low_title, unit=""):
    benchmark = kpi.get("benchmark")
    if not benchmark or benchmark.get("employee_value") is None:
        return
    value = benchmark["employee_value"]
    percentile = benchmark.get("percentile", 50)
    company = benchmark.get("company_avg")

    def fmt(v):
        return f"{v}{unit}" if v is not None else "n/a"

    if percentile >= 90:
        add_insight(
            insights, category, "positive", good_title,
            f"{kpi['label']} is {fmt(value)} in the {benchmark['standing']} "
            f"of {benchmark['peers']} employees (company avg {fmt(company)}).",
            {"value": value, "company_avg": company, "percentile": percentile},
        )
    elif value <= low_threshold:
        add_insight(
            insights, category, "warning", low_title,
            f"{kpi['label']} is {fmt(value)} vs a company average of {fmt(company)}. "
            f"You rank #{benchmark['rank']} of {benchmark['peers']}.",
            {"value": value, "company_avg": company, "percentile": percentile},
        )
    elif value >= good_threshold:
        add_insight(
            insights, category, "positive", good_title,
            f"{kpi['label']} is {fmt(value)}, above the company average of "
            f"{fmt(company)} ({benchmark['standing']}).",
            {"value": value, "company_avg": company, "percentile": percentile},
        )


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


def weekly_scatter(df, employee_id, x_col, y_col, x_key, y_key, x_scale=1.0,
                   y_scale=1.0):
    """Scatter dataset: one point per week for the employee + company average."""
    required = {"Week_Start", "Employee_ID", x_col, y_col}
    if df.empty or not required.issubset(df.columns):
        return []

    temp = df[["Week_Start", "Employee_ID", x_col, y_col]].copy()
    temp[x_col] = numeric(temp[x_col])
    temp[y_col] = numeric(temp[y_col])
    temp = temp.dropna(subset=[x_col, y_col])
    if temp.empty:
        return []

    mine = temp[ids_equal(temp["Employee_ID"], employee_id)]
    if mine.empty:
        return []

    personal = mine.groupby("Week_Start")[[x_col, y_col]].mean()
    company = temp.groupby("Week_Start")[[x_col, y_col]].mean()

    result = []
    for week in sorted(personal.index):
        p = personal.loc[week]
        c = company.loc[week] if week in company.index else p
        result.append({
            "week": str(week),
            x_key: round(float(p[x_col]) * x_scale, 2),
            y_key: round(float(p[y_col]) * y_scale, 2),
            "company_" + x_key: round(float(c[x_col]) * x_scale, 2),
            "company_" + y_key: round(float(c[y_col]) * y_scale, 2),
        })
    return result


@router.get("/")
def employee_dashboard(employee_id: str = Query(..., min_length=1)):
    employee_id = employee_id.strip()

    employees = records("Employees.csv")
    if employees.empty:
        raise HTTPException(500, "Employees.csv is missing or empty")
    if not {"Employee_ID", "Employee_Name", "Department"}.issubset(employees.columns):
        raise HTTPException(500, "Employees.csv has an invalid schema")

    employees["Employee_ID"] = employees["Employee_ID"].astype(str).str.strip()

    matched = employees[employees["Employee_ID"] == employee_id]
    if matched.empty:
        raise HTTPException(404, "Employee not found")
    if len(matched) > 1:
        raise HTTPException(409, "Employee_ID is not unique")

    employee = matched.iloc[0].to_dict()
    department = employee.get("Department")

    dept_by_id = dict(zip(
        employees["Employee_ID"].astype(str),
        employees["Department"].astype(str),
    ))

    # ---- load datasets ----
    hybrid_all = records("HybridWork.csv")
    meetings_all = records("Meetings.csv")
    learning_all = records("Learning.csv")
    performance_all = records("Performance.csv")
    goals_all = records("Goals.csv")
    resources_all = records("Resources.csv")
    departments_all = records("Departments.csv")
    manager_departments_all = records("ManagerDepartments.csv")

    for frame, col in [
        (hybrid_all, "Employee_ID"),
        (learning_all, "Employee_ID"),
        (performance_all, "Employee_ID"),
        (goals_all, "Employee_ID"),
        (meetings_all, "Organizer_ID"),
    ]:
        if not frame.empty and col in frame.columns:
            frame[col] = frame[col].astype(str).str.strip()

    # ---- employee-scoped views ----
    hybrid = hybrid_all[ids_equal(hybrid_all["Employee_ID"], employee_id)].copy() \
        if not hybrid_all.empty and "Employee_ID" in hybrid_all.columns else pd.DataFrame()
    learning = learning_all[ids_equal(learning_all["Employee_ID"], employee_id)].copy() \
        if not learning_all.empty and "Employee_ID" in learning_all.columns else pd.DataFrame()
    performance = performance_all[ids_equal(performance_all["Employee_ID"], employee_id)].copy() \
        if not performance_all.empty and "Employee_ID" in performance_all.columns else pd.DataFrame()
    goals = goals_all[ids_equal(goals_all["Employee_ID"], employee_id)].copy() \
        if not goals_all.empty and "Employee_ID" in goals_all.columns else pd.DataFrame()
    meetings = meetings_all[ids_equal(meetings_all["Organizer_ID"], employee_id)].copy() \
        if not meetings_all.empty and "Organizer_ID" in meetings_all.columns else pd.DataFrame()

    for frame, col in [
        (hybrid, "Week_Start"), (meetings, "Meeting_Date"),
        (learning, "Assigned_Date"), (goals, "Due_Date"),
        (performance, "Review_Date"),
    ]:
        if not frame.empty and col in frame.columns:
            frame.sort_values(col, inplace=True)

    # ------------------------------------------------------------------
    # KPI catalog + per-employee series (these drive the benchmarks)
    # ------------------------------------------------------------------
    series = {
        "hours_worked": employee_agg(hybrid_all, "Employee_ID", "Hours_Worked", "mean"),
        "avg_focus_hours": employee_agg(hybrid_all, "Employee_ID", "Focus_Hours", "mean"),
        "avg_collaboration_hours": employee_agg(hybrid_all, "Employee_ID", "Collaboration_Hours", "mean"),
        "engagement_score": employee_agg(hybrid_all, "Employee_ID", "Engagement_Score", "mean"),
        "wellbeing_score": employee_agg(hybrid_all, "Employee_ID", "Wellbeing_Score", "mean"),
        "office_days": employee_agg(hybrid_all, "Employee_ID", "Office_Days", "sum"),
        "remote_days": employee_agg(hybrid_all, "Employee_ID", "Remote_Days", "sum"),
        "commute_distance_saved": employee_agg(hybrid_all, "Employee_ID", "Commute_Distance_Saved_KM", "sum"),
        "co2_saved": employee_agg(hybrid_all, "Employee_ID", "Estimated_CO2_Saved_KG", "sum"),
        "meeting_hours": employee_agg(meetings_all, "Organizer_ID", "Duration_Minutes", "sum", scale=1 / 60),
        "meeting_attendance_rate": employee_ratio(meetings_all, "Organizer_ID", "Attended_Count", "Invited_Count"),
        "action_completion_rate": employee_ratio(meetings_all, "Organizer_ID", "Completed_Action_Items", "Action_Items"),
        "meeting_efficiency": employee_agg(meetings_all, "Organizer_ID", "Efficiency_Score", "mean"),
        "long_meeting_share": employee_true_rate(meetings_all, "Organizer_ID", "Over_60_Min_Flag"),
        "meeting_cost_hours": employee_agg(meetings_all, "Organizer_ID", "Meeting_Cost_Hours", "sum"),
        "learning_completion_rate": employee_agg(learning_all, "Employee_ID", "Completion_Rate", "mean", scale=100),
        "learning_hours_completed": employee_agg(learning_all, "Employee_ID", "Completed_Hours", "sum"),
        "assessment_score": employee_agg(learning_all, "Employee_ID", "Assessment_Score", "mean"),
        "certifications_earned": employee_true_count(learning_all, "Employee_ID", "Certification_Earned"),
        "learning_points": employee_agg(learning_all, "Employee_ID", "Learning_Points", "sum"),
        "performance_rating": employee_agg(performance_all, "Employee_ID", "Overall_Rating", "mean"),
        "goal_achievement_rate": employee_agg(performance_all, "Employee_ID", "Goal_Achievement_Rate", "mean"),
        "goal_progress": employee_agg(goals_all, "Employee_ID", "Progress_Percentage", "mean"),
        "goals_completed_rate": {},
        "goals_overdue": employee_count_where(
            goals_all, "Employee_ID", "Goal_Status", ["overdue"]),
    }
    # goals_completed_rate: share of an employee's goals that are completed.
    if not goals_all.empty and {"Employee_ID", "Goal_Status"}.issubset(goals_all.columns):
        completed = employee_count_where(goals_all, "Employee_ID", "Goal_Status", ["completed"])
        totals = (
            goals_all.assign(_one=1)
            .groupby("Employee_ID")["_one"].sum()
        )
        series["goals_completed_rate"] = {
            str(k): round(completed.get(str(k), 0) / float(v) * 100, 2)
            for k, v in totals.items() if v > 0
        }

    catalog = [
        ("hours_worked", "Hours worked / week", "h/week", "Productivity", True, True),
        ("avg_focus_hours", "Average focus", "h/record", "Productivity", False, True),
        ("avg_collaboration_hours", "Average collaboration", "h/record", "Productivity", False, False),
        ("engagement_score", "Engagement", "score", "Wellbeing", True, True),
        ("wellbeing_score", "Wellbeing", "score", "Wellbeing", False, True),
        ("office_days", "Office days", "days", "Work location", False, None),
        ("remote_days", "Remote days", "days", "Work location", False, None),
        ("commute_distance_saved", "Commute distance saved", "km", "Sustainability", False, True),
        ("co2_saved", "CO2 saved", "kg", "Sustainability", False, True),
        ("meeting_hours", "Meeting hours", "h", "Meetings", True, False),
        ("meeting_attendance_rate", "Meeting attendance", "%", "Meetings", True, True),
        ("action_completion_rate", "Action completion", "%", "Meetings", False, True),
        ("meeting_efficiency", "Meeting efficiency", "score", "Meetings", True, True),
        ("long_meeting_share", "Long meetings share", "%", "Meetings", False, False),
        ("meeting_cost_hours", "Meeting cost", "h", "Meetings", False, False),
        ("learning_completion_rate", "Learning completion", "%", "Learning", True, True),
        ("learning_hours_completed", "Learning hours", "h", "Learning", False, True),
        ("assessment_score", "Assessment score", "score", "Learning", False, True),
        ("certifications_earned", "Certifications", "certs", "Learning", False, True),
        ("learning_points", "Learning points", "pts", "Learning", False, True),
        ("performance_rating", "Performance rating", "rating", "Performance", True, True),
        ("goal_achievement_rate", "Goal achievement", "%", "Performance", False, True),
        ("goal_progress", "Goal progress", "%", "Goals", True, True),
        ("goals_completed_rate", "Goals completed", "%", "Goals", False, True),
        ("goals_overdue", "Overdue goals", "goals", "Goals", False, False),
    ]

    kpis = {}
    for key, label, unit, group, primary, higher_is_better in catalog:
        direction = True if higher_is_better is None else higher_is_better
        value_series = series.get(key, {})
        kpis[key] = {
            "key": key,
            "label": label,
            "unit": unit,
            "group": group,
            "primary": primary,
            "higher_is_better": direction,
            "value": value_series.get(employee_id),
            "benchmark": build_benchmark(
                value_series, employee_id, dept_by_id, department,
                higher_is_better=direction,
            ),
        }

    # ------------------------------------------------------------------
    # Composite index (0-100) and overall standing
    # ------------------------------------------------------------------
    def composite_for(emp):
        parts = []
        for key, scale in [
            ("performance_rating", 20),
            ("engagement_score", 20),
            ("wellbeing_score", 20),
            ("meeting_efficiency", 20),
            ("goal_progress", 1),
            ("learning_completion_rate", 1),
            ("goal_achievement_rate", 1),
        ]:
            value = series.get(key, {}).get(emp)
            if value is not None and not pd.isna(value):
                parts.append(min(100, max(0, float(value) * scale)))
        return round(sum(parts) / len(parts), 1) if parts else None

    all_employees = employees["Employee_ID"].astype(str).tolist()
    composite_series = {
        emp: score for emp in all_employees
        if (score := composite_for(emp)) is not None
    }
    overall_benchmark = build_benchmark(
        composite_series, employee_id, dept_by_id, department, True)

    name_by_id = dict(zip(
        employees["Employee_ID"].astype(str),
        employees["Employee_Name"].astype(str),
    ))
    ranked = sorted(composite_series.items(), key=lambda kv: kv[1], reverse=True)
    ranking = [
        {
            "rank": index + 1,
            "employee_id": emp,
            "name": name_by_id.get(emp),
            "department": dept_by_id.get(emp),
            "score": score,
            "is_you": emp == employee_id,
        }
        for index, (emp, score) in enumerate(ranked)
    ]

    department_ranking = [
        {**row, "rank": index + 1}
        for index, row in enumerate(
            row for row in ranking if row["department"] == department
        )
    ]
    department_rank = next(
        (row["rank"] for row in department_ranking if row["is_you"]), None
    )

    headline = {
        "score": overall_benchmark["employee_value"] if overall_benchmark else None,
        "company_avg": overall_benchmark["company_avg"] if overall_benchmark else None,
        "department_avg": overall_benchmark["department_avg"] if overall_benchmark else None,
        "percentile": overall_benchmark["percentile"] if overall_benchmark else None,
        "rank": overall_benchmark["rank"] if overall_benchmark else None,
        "standing": overall_benchmark["standing"] if overall_benchmark else None,
        "peers": len(composite_series),
        "ranking": ranking,
        "department_ranking": department_ranking,
        "department_rank": department_rank,
        "department_peers": len(department_ranking),
    }

    # ------------------------------------------------------------------
    # Charts
    # ------------------------------------------------------------------
    charts = {
        "weekly_work_hours": weekly_compare(
            hybrid_all, employee_id, "Hours_Worked", "sum", "hours"),
        "weekly_focus_hours": weekly_compare(
            hybrid_all, employee_id, "Focus_Hours", "mean", "hours"),
        "weekly_co2_saved": weekly_compare(
            hybrid_all, employee_id, "Estimated_CO2_Saved_KG", "sum", "co2_kg"),
        "weekly_commute_distance": weekly_compare(
            hybrid_all, employee_id, "Commute_Distance_Saved_KM", "sum",
            "km_distance"),
        "engagement_trend": weekly_compare(
            hybrid_all, employee_id, "Engagement_Score", "mean", "score"),
        "wellbeing_trend": weekly_compare(
            hybrid_all, employee_id, "Wellbeing_Score", "mean", "score"),
        "work_mode_distribution": distribution_compare(
            hybrid_all, employee_id, "Work_Mode"),
        "office_vs_remote_days": [
            {
                "work_mode": "Office",
                "days": series["office_days"].get(employee_id),
                "company_avg": mean_of(list(series["office_days"].values())),
            },
            {
                "work_mode": "Remote",
                "days": series["remote_days"].get(employee_id),
                "company_avg": mean_of(list(series["remote_days"].values())),
            },
        ],
        "learning_by_skill_category": category_compare(
            learning_all, employee_id, "Skill_Category", "Completion_Rate",
            "mean", "completion_rate", scale=100),
        "learning_status_distribution": distribution_compare(
            learning_all, employee_id, "Course_Status"),
        "performance_dimensions": [],
        "goal_by_category": category_compare(
            goals_all, employee_id, "Goal_Category", "Progress_Percentage",
            "mean", "progress"),
        "goal_status_distribution": distribution_compare(
            goals_all, employee_id, "Goal_Status"),
        "goal_priority_distribution": distribution_compare(
            goals_all, employee_id, "Priority"),
        "goal_progress_by_priority": category_compare(
            goals_all, employee_id, "Priority", "Progress_Percentage",
            "mean", "progress"),
        "meeting_performance": [
            {
                "metric": "Attendance rate",
                "value": kpis["meeting_attendance_rate"]["value"],
                "company_avg": mean_of(list(series["meeting_attendance_rate"].values())),
            },
            {
                "metric": "Action completion",
                "value": kpis["action_completion_rate"]["value"],
                "company_avg": mean_of(list(series["action_completion_rate"].values())),
            },
        ],
        "focus_vs_collaboration": [
            {
                "activity": "Focus",
                "hours": series["avg_focus_hours"].get(employee_id),
                "company_avg": mean_of(list(series["avg_focus_hours"].values())),
            },
            {
                "activity": "Collaboration",
                "hours": kpis["avg_collaboration_hours"]["value"],
                "company_avg": mean_of(list(series["avg_collaboration_hours"].values())),
            },
        ],
    }

    # Performance radar (you vs company average per dimension)
    for column, label in PERFORMANCE_DIMENSIONS:
        personal = None
        if not performance.empty and column in performance.columns:
            personal = to_num(performance, column)
            personal = round(float(personal.mean()), 2) if not personal.empty else None
        company_series = employee_agg(performance_all, "Employee_ID", column, "mean")
        charts["performance_dimensions"].append({
            "dimension": label,
            "score": personal,
            "company_avg": mean_of(list(company_series.values())),
            "department_avg": mean_of([
                v for k, v in company_series.items() if dept_by_id.get(k) == department
            ]),
        })

    # ------------------------------------------------------------------
    # Details tables
    # ------------------------------------------------------------------
    course_columns = [
        c for c in [
            "Course_Name", "Skill_Category", "Assigned_Hours", "Completed_Hours",
            "Course_Status", "Completion_Rate", "Assessment_Score",
            "Certification_Earned", "Learning_Points",
        ] if c in learning.columns
    ]
    learning_courses = json_records(
        learning[course_columns].rename(columns={
            "Course_Name": "course",
            "Skill_Category": "skill_category",
            "Assigned_Hours": "assigned_hours",
            "Completed_Hours": "completed_hours",
            "Course_Status": "status",
            "Completion_Rate": "completion_rate",
            "Assessment_Score": "assessment_score",
            "Certification_Earned": "certification_earned",
            "Learning_Points": "learning_points",
        })
    ) if not learning.empty else []

    goal_columns = [
        c for c in [
            "Goal_Title", "Goal_Category", "Progress_Percentage", "Goal_Status",
            "Priority", "Due_Date", "Target_Value", "Actual_Value",
        ] if c in goals.columns
    ]
    goal_rows = json_records(
        goals[goal_columns].rename(columns={
            "Goal_Title": "goal",
            "Goal_Category": "category",
            "Progress_Percentage": "progress",
            "Goal_Status": "status",
            "Priority": "priority",
            "Due_Date": "due_date",
            "Target_Value": "target",
            "Actual_Value": "actual",
        })
    ) if not goals.empty else []

    long_meetings = []
    if not meetings.empty and "Over_60_Min_Flag" in meetings.columns:
        flag = meetings["Over_60_Min_Flag"].astype(str).str.strip().str.lower()
        long_meetings = json_records(meetings[flag.isin(TRUE_VALUES)].head(20))

    performance_history = json_records(performance) if not performance.empty else []

    details = {
        "learning_courses": learning_courses,
        "goals": goal_rows,
        "long_meetings": long_meetings,
        "performance_history": performance_history,
        "meeting_summary": {
            "organized": int(len(meetings)),
            "hours": kpis["meeting_hours"]["value"],
            "attendance_rate": kpis["meeting_attendance_rate"]["value"],
            "action_completion": kpis["action_completion_rate"]["value"],
            "efficiency": kpis["meeting_efficiency"]["value"],
        },
    }

    # ------------------------------------------------------------------
    # Insights
    # ------------------------------------------------------------------
    insights = []

    focus = series["avg_focus_hours"].get(employee_id)
    collaboration = series["avg_collaboration_hours"].get(employee_id)
    if focus is not None and collaboration is not None:
        if collaboration > focus:
            add_insight(
                insights, "Productivity", "warning", "Collaboration outweighs focus",
                f"Your collaboration time ({collaboration}h) exceeds focus time "
                f"({focus}h). Protect a few deep-work blocks each week.",
                {"focus": focus, "collaboration": collaboration},
            )
        else:
            add_insight(
                insights, "Productivity", "positive", "Healthy focus balance",
                f"Your focus time ({focus}h) exceeds collaboration ({collaboration}h).",
                {"focus": focus, "collaboration": collaboration},
            )

    benchmark_insight(insights, kpis["engagement_score"], "Wellbeing", 4.0, 3.0,
                      "Engagement above average", "Engagement below average")
    benchmark_insight(insights, kpis["wellbeing_score"], "Wellbeing", 4.0, 3.0,
                      "Wellbeing above average", "Wellbeing needs attention")
    benchmark_insight(insights, kpis["performance_rating"], "Performance", 4.0, 3.0,
                      "Strong performance rating", "Performance rating below average")
    benchmark_insight(insights, kpis["goal_progress"], "Goals", 80, 50,
                      "Goals on track", "Goal progress lagging", unit="%")
    benchmark_insight(insights, kpis["goal_achievement_rate"], "Goals", 85, 60,
                      "High goal achievement", "Goal achievement below average", unit="%")
    benchmark_insight(insights, kpis["learning_completion_rate"], "Learning", 90, 50,
                      "Excellent learning completion", "Learning completion lagging", unit="%")
    benchmark_insight(insights, kpis["assessment_score"], "Learning", 85, 60,
                      "Strong assessment results", "Assessment scores lagging")
    benchmark_insight(insights, kpis["meeting_efficiency"], "Meetings", 4.0, 3.0,
                      "Efficient meetings", "Meeting efficiency below average")
    benchmark_insight(insights, kpis["action_completion_rate"], "Meetings", 90, 70,
                      "Follow-through on action items", "Action items piling up", unit="%")
    benchmark_insight(insights, kpis["meeting_attendance_rate"], "Meetings", 95, 75,
                      "Reliable meeting attendance", "Low meeting attendance", unit="%")

    overdue = kpis["goals_overdue"]["value"] or 0
    if overdue:
        add_insight(
            insights, "Goals", "warning", "Overdue goals",
            f"You have {int(overdue)} overdue goal(s). Reprioritise or reset due dates.",
            {"overdue": int(overdue)},
        )

    high_priority_risk = 0
    if not goals.empty and {"Priority", "Progress_Percentage", "Goal_Status"}.issubset(goals.columns):
        progress_values = numeric(goals["Progress_Percentage"])
        priority_values = goals["Priority"].astype(str).str.lower()
        status_values = goals["Goal_Status"].astype(str).str.lower()
        mask = (
            priority_values.isin(["high", "critical"])
            & (progress_values < 50)
            & (status_values != "completed")
        )
        high_priority_risk = int(mask.sum())
        if high_priority_risk:
            add_insight(
                insights, "Goals", "warning", "High-priority goals at risk",
                f"{high_priority_risk} high-priority goal(s) are under 50% progress.",
                {"count": high_priority_risk},
            )

    long_share = kpis["long_meeting_share"]["value"]
    if long_share is not None and long_share > 20:
        add_insight(
            insights, "Meetings", "info", "Many long meetings",
            f"{long_share}% of the meetings you organise run over 60 minutes. "
            "Try shorter default durations.",
            {"share": long_share},
        )

    certifications = kpis["certifications_earned"]["value"] or 0
    if certifications:
        add_insight(
            insights, "Learning", "positive", "Certifications earned",
            f"You earned {int(certifications)} certification(s) in this period.",
            {"certifications": int(certifications)},
        )

    co2 = kpis["co2_saved"]["value"]
    if co2 is not None and co2 > 0:
        add_insight(
            insights, "Sustainability", "positive", "Commute emissions saved",
            f"Your hybrid schedule saved an estimated {co2} kg of CO2 "
            f"({kpis['commute_distance_saved']['value']} km of commuting).",
            {"co2_kg": co2},
        )

    severity_order = {"warning": 0, "info": 1, "positive": 2}
    insights.sort(key=lambda i: severity_order.get(i["severity"], 3))

    # ------------------------------------------------------------------
    # Organization context
    # ------------------------------------------------------------------
    dept_head = None
    if not departments_all.empty and "Department_Name" in departments_all.columns:
        dept_rows = departments_all[
            departments_all["Department_Name"].astype(str) == str(department)
        ]
        if not dept_rows.empty:
            head_id = dept_rows.iloc[0].get("Department_Head_ID")
            head_match = employees[employees["Employee_ID"].astype(str) == str(head_id)]
            if not head_match.empty:
                dept_head = head_match.iloc[0]["Employee_Name"]

    manager_name = None
    manager_id = clean(employee.get("Manager_ID"))
    if manager_id not in (None, ""):
        mgr = employees[employees["Employee_ID"].astype(str) == str(manager_id)]
        if not mgr.empty:
            manager_name = mgr.iloc[0]["Employee_Name"]

    location_resources = {}
    if not resources_all.empty and "Location" in resources_all.columns and employee.get("Location"):
        loc = resources_all[resources_all["Location"].astype(str) == str(employee["Location"])]
        for column in ["Desk_Utilization", "Room_Utilization",
                       "Renewable_Energy_Rate", "Energy_Consumed_kWh",
                       "Waste_Recycled_KG"]:
            if column in loc.columns:
                values = to_num(loc, column)
                if not values.empty:
                    location_resources[column] = round(float(values.mean()), 2)

    context = {
        "department": {
            "name": department,
            "head": dept_head,
            "employee_count": int(
                (employees["Department"].astype(str) == str(department)).sum()
            ),
            "company_employee_count": int(len(employees)),
        },
        "location_resources": location_resources,
    }

    # ------------------------------------------------------------------
    # Response
    # ------------------------------------------------------------------
    initials = "".join(
        part[0] for part in str(employee.get("Employee_Name", "?")).split()[:2]
    ).upper()

    return {
        "meta": {
            "dashboard": "employee",
            "employee_id": employee_id,
            "department": department,
            "generated_for": clean(employee.get("Employee_Name")),
            "data_period": {
                "hybrid_work_records": int(len(hybrid)),
                "meeting_records": int(len(meetings)),
                "learning_records": int(len(learning)),
                "performance_reviews": int(len(performance)),
                "goals": int(len(goals)),
            },
        },
        "profile": {
            key: clean(employee.get(key))
            for key in [
                "Employee_ID", "Employee_Name", "Department", "Job_Role",
                "Location", "Manager_ID", "Join_Date", "Employment_Type",
                "Work_Preference", "Active_Status",
            ]
        } | {
            "initials": initials,
            "manager_name": manager_name,
        },
        "headline": headline,
        "kpis": kpis,
        "charts": charts,
        "details": details,
        "insights": insights,
        "recommendations": employee_recommendations(kpis),
        "context": context,
    }
