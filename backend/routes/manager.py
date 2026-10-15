"""Manager analytics dashboard.

A manager is linked to one or more departments through ``ManagerDepartments.csv``
and to individual employees through ``Employees.Manager_ID``. This module
produces:

* the manager's own performance & insights (reusing the employee dashboard),
* a KPI + insight breakdown for every department they manage,
* a full team table (people in those departments) so they can drill into an
  individual's performance.
"""

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from routes.employee import (
    records,
    clean,
    json_records,
    mean_of,
    employee_agg,
    employee_ratio,
    employee_count_where,
    build_benchmark,
    employee_dashboard,
    ids_equal,
)
from routes.recommendations import manager_recommendations


router = APIRouter(prefix="/manager", tags=["Manager Dashboard"])


# KPI definitions surfaced for each department: (key, label, unit, higher_is_better)
DEPT_KPIS = [
    ("performance_rating", "Performance rating", "rating", True),
    ("goal_achievement_rate", "Goal achievement", "%", True),
    ("goal_progress", "Goal progress", "%", True),
    ("engagement_score", "Engagement", "score", True),
    ("wellbeing_score", "Wellbeing", "score", True),
    ("learning_completion_rate", "Learning completion", "%", True),
    ("assessment_score", "Assessment score", "score", True),
    ("meeting_efficiency", "Meeting efficiency", "score", True),
    ("action_completion_rate", "Action completion", "%", True),
    ("hours_worked", "Avg hours worked", "h", True),
    ("co2_saved", "CO2 saved", "kg", True),
    ("goals_overdue", "Overdue goals", "goals", False),
]

# KPIs shown as compact numbers on a team member card.
TEAM_KPIS = [
    "performance_rating",
    "goal_progress",
    "engagement_score",
    "wellbeing_score",
    "learning_completion_rate",
    "goals_overdue",
]


def composite_score(series, employee_id):
    """Same composite index used on the employee dashboard (0-100)."""
    weights = [
        ("performance_rating", 20),
        ("engagement_score", 20),
        ("wellbeing_score", 20),
        ("meeting_efficiency", 20),
        ("goal_progress", 1),
        ("learning_completion_rate", 1),
        ("goal_achievement_rate", 1),
    ]
    parts = []
    for key, scale in weights:
        value = series.get(key, {}).get(employee_id)
        if value is not None and not pd.isna(value):
            parts.append(min(100, max(0, float(value) * scale)))
    return round(sum(parts) / len(parts), 1) if parts else None


def build_series():
    """Per-employee metric series (id -> value) across the whole company."""
    hybrid = records("HybridWork.csv")
    meetings = records("Meetings.csv")
    learning = records("Learning.csv")
    performance = records("Performance.csv")
    goals = records("Goals.csv")

    for frame, col in [
        (hybrid, "Employee_ID"), (learning, "Employee_ID"),
        (performance, "Employee_ID"), (goals, "Employee_ID"),
        (meetings, "Organizer_ID"),
    ]:
        if not frame.empty and col in frame.columns:
            frame[col] = frame[col].astype(str).str.strip()

    series = {
        "performance_rating": employee_agg(performance, "Employee_ID", "Overall_Rating", "mean"),
        "goal_achievement_rate": employee_agg(performance, "Employee_ID", "Goal_Achievement_Rate", "mean"),
        "goal_progress": employee_agg(goals, "Employee_ID", "Progress_Percentage", "mean"),
        "goals_overdue": employee_count_where(goals, "Employee_ID", "Goal_Status", ["overdue"]),
        "engagement_score": employee_agg(hybrid, "Employee_ID", "Engagement_Score", "mean"),
        "wellbeing_score": employee_agg(hybrid, "Employee_ID", "Wellbeing_Score", "mean"),
        "hours_worked": employee_agg(hybrid, "Employee_ID", "Hours_Worked", "sum"),
        "co2_saved": employee_agg(hybrid, "Employee_ID", "Estimated_CO2_Saved_KG", "sum"),
        "learning_completion_rate": employee_agg(learning, "Employee_ID", "Completion_Rate", "mean", scale=100),
        "assessment_score": employee_agg(learning, "Employee_ID", "Assessment_Score", "mean"),
        "meeting_efficiency": employee_agg(meetings, "Organizer_ID", "Efficiency_Score", "mean"),
        "action_completion_rate": employee_ratio(meetings, "Organizer_ID", "Completed_Action_Items", "Action_Items"),
    }
    return series


def dept_value(series, key, members):
    values = [
        series.get(key, {}).get(member)
        for member in members
    ]
    return mean_of(values)


PERFORMANCE_DIMENSIONS = [
    ("Quality_Score", "Quality"),
    ("Delivery_Score", "Delivery"),
    ("Teamwork_Score", "Teamwork"),
    ("Communication_Score", "Communication"),
    ("Overall_Rating", "Overall"),
]


def build_charts(managed_ids, dept_name_by_id, team_ids, manager_id,
                 employees, composite_series, company_composite):
    """Chart-ready datasets scoped to the manager's departments / team."""
    charts = {}
    team = set(team_ids)
    managed = set(managed_ids)
    emp_dept_id = dict(zip(
        employees["Employee_ID"].astype(str),
        employees["Department_ID"].astype(str).str.strip(),
    ))
    emp_name = dict(zip(
        employees["Employee_ID"].astype(str),
        employees["Employee_Name"].astype(str),
    ))
    all_dept_ids = list(dept_name_by_id.keys())

    def members_of(dept_id):
        return [m for m in team if emp_dept_id.get(m) == dept_id]

    def all_members_of(dept_id):
        return [
            m for m, d in emp_dept_id.items() if d == dept_id
        ]

    # --- Performance index for ALL departments (yours highlighted) ---
    charts["all_department_index"] = [
        {
            "department": dept_name_by_id.get(dept_id, dept_id),
            "department_id": dept_id,
            "index": mean_of([
                composite_series[m] for m in all_members_of(dept_id)
                if m in composite_series
            ]),
            "is_mine": dept_id in managed,
            "company_avg": company_composite,
        }
        for dept_id in all_dept_ids
    ]

    # --- Engagement vs wellbeing (department averages) ---
    hybrid = records("HybridWork.csv")
    if not hybrid.empty and "Employee_ID" in hybrid.columns:
        hybrid["Employee_ID"] = hybrid["Employee_ID"].astype(str).str.strip()
        company_engagement = mean_of(hybrid["Engagement_Score"])
        company_wellbeing = mean_of(hybrid["Wellbeing_Score"])
        charts["engagement_wellbeing"] = [
            {
                "department": dept_name_by_id.get(dept_id, dept_id),
                "engagement": mean_of(
                    hybrid[hybrid["Employee_ID"].isin(members_of(dept_id))][
                        "Engagement_Score"]),
                "wellbeing": mean_of(
                    hybrid[hybrid["Employee_ID"].isin(members_of(dept_id))][
                        "Wellbeing_Score"]),
                "company_engagement": company_engagement,
                "company_wellbeing": company_wellbeing,
            }
            for dept_id in managed_ids
        ]

        # --- Weekly engagement per department (multi-line) ---
        hybrid_in = hybrid
        weeks = sorted({
            str(w) for w in hybrid_in["Week_Start"].dropna()
        })
        weekly = []
        for week in weeks:
            row = {"week": week}
            for dept_id in managed_ids:
                m = members_of(dept_id)
                sub = hybrid_in[
                    hybrid_in["Employee_ID"].isin(m)
                    & (hybrid_in["Week_Start"].astype(str) == week)
                ]
                row[dept_name_by_id.get(dept_id, dept_id)] = mean_of(
                    sub["Engagement_Score"])
            row["Company"] = mean_of(
                hybrid_in[hybrid_in["Week_Start"].astype(str) == week][
                    "Engagement_Score"])
            weekly.append(row)
        charts["weekly_engagement_by_department"] = weekly

        # --- Team work-mode mix (donut) ---
        wm = hybrid_in[
            hybrid_in["Employee_ID"].isin(team)
        ]["Work_Mode"].astype(str).str.strip().replace("", "Unknown")
        charts["team_work_mode_mix"] = [
            {"Work_Mode": mode, "count": int(count)}
            for mode, count in wm.value_counts().items()
        ]

    # --- Performance profile: ALL departments + your departments average ---
    performance = records("Performance.csv")
    if not performance.empty and "Employee_ID" in performance.columns:
        performance["Employee_ID"] = performance["Employee_ID"].astype(str).str.strip()
        your_members = [
            m for dept_id in managed_ids for m in all_members_of(dept_id)
        ]
        rows = []
        for column, label in PERFORMANCE_DIMENSIONS:
            if column not in performance.columns:
                continue
            row = {"dimension": label}
            for dept_id in all_dept_ids:
                row[dept_name_by_id.get(dept_id, dept_id)] = mean_of(
                    performance[performance["Employee_ID"].isin(
                        all_members_of(dept_id))][column])
            row["Your departments"] = mean_of(
                performance[performance["Employee_ID"].isin(your_members)][column])
            row["Company"] = mean_of(performance[column])
            rows.append(row)
        charts["performance_by_dimension"] = rows

    # --- Objectives over time: set (due) vs achieved ---
    goals = records("Goals.csv")
    if not goals.empty and "Employee_ID" in goals.columns:
        goals["Employee_ID"] = goals["Employee_ID"].astype(str).str.strip()
        team_goals = goals[goals["Employee_ID"].isin(team)].copy()
        team_goals["due"] = pd.to_datetime(team_goals["Due_Date"], errors="coerce")
        team_goals["period"] = team_goals["due"].dt.strftime("%Y-%m")
        team_goals = team_goals[team_goals["period"].notna()]
        achieved = (
            team_goals["Goal_Status"].astype(str).str.strip().str.lower() == "completed"
        )
        team_goals["achieved"] = achieved
        rows = []
        for period, group in team_goals.groupby("period"):
            rows.append({
                "period": period,
                "objectives": int(len(group)),
                "achieved": int(group["achieved"].sum()),
            })
        charts["objectives_vs_achieved"] = sorted(rows, key=lambda r: r["period"])

        # --- Goal status mix ---
        charts["goal_status"] = [
            {"status": clean(status), "count": int(count)}
            for status, count in team_goals["Goal_Status"].astype(str)
            .str.strip().value_counts().items()
        ]

        # --- Overdue goals per member, by department ---
        overdue_rows = []
        for dept_id in managed_ids:
            m = members_of(dept_id)
            sub = team_goals[team_goals["Employee_ID"].isin(m)]
            overdue = (
                sub["Goal_Status"].astype(str).str.strip().str.lower() == "overdue"
            ).sum()
            overdue_rows.append({
                "department": dept_name_by_id.get(dept_id, dept_id),
                "overdue_per_member": round(overdue / len(m), 2) if m else None,
            })
        charts["overdue_goals_by_department"] = overdue_rows

    # --- Learning completion by department ---
    learning = records("Learning.csv")
    if not learning.empty and "Employee_ID" in learning.columns:
        learning["Employee_ID"] = learning["Employee_ID"].astype(str).str.strip()
        team_learning = learning[learning["Employee_ID"].isin(team)]
        rows = []
        for dept_id in managed_ids:
            sub = team_learning[team_learning["Employee_ID"].isin(members_of(dept_id))]
            rate = mean_of(sub["Completion_Rate"])
            rows.append({
                "department": dept_name_by_id.get(dept_id, dept_id),
                "completion_rate": round(rate * 100, 1) if rate is not None else None,
            })
        charts["learning_by_department"] = rows

    # --- Meeting efficiency by department ---
    meetings = records("Meetings.csv")
    if not meetings.empty and "Organizer_ID" in meetings.columns:
        meetings["Organizer_ID"] = meetings["Organizer_ID"].astype(str).str.strip()
        team_meetings = meetings[meetings["Organizer_ID"].isin(team)]
        rows = []
        for dept_id in managed_ids:
            sub = team_meetings[team_meetings["Organizer_ID"].isin(members_of(dept_id))]
            rows.append({
                "department": dept_name_by_id.get(dept_id, dept_id),
                "score": mean_of(sub["Efficiency_Score"]),
            })
        charts["meeting_efficiency_by_department"] = rows

    # --- Team performance distribution (histogram source) ---
    charts["team_performance_distribution"] = [
        {"score": composite_series[m]}
        for m in team_ids if m in composite_series
    ]

    # --- Goal health by department (stacked statuses) ---
    if not goals.empty and "Employee_ID" in goals.columns:
        goals_status = goals["Goal_Status"].astype(str).str.strip().str.lower()
        goal_rows = []
        for dept_id in managed_ids:
            m = members_of(dept_id)
            sub = team_goals[team_goals["Employee_ID"].isin(m)]
            if sub.empty:
                continue
            s = sub["Goal_Status"].astype(str).str.strip().str.lower()
            goal_rows.append({
                "department": dept_name_by_id.get(dept_id, dept_id),
                "completed": int(s.eq("completed").sum()),
                "in_progress": int(s.eq("in progress").sum()),
                "overdue": int(s.eq("overdue").sum()),
                "not_started": int(s.eq("not started").sum()),
            })
        charts["goal_health_by_department"] = goal_rows

    # --- Monthly objectives pacing (completion rate per month due) ---
    if not team_goals.empty:
        months = sorted(team_goals["period"].dropna().unique())
        pace_rows = []
        for month in months:
            sub = team_goals[team_goals["period"] == month]
            done = int(sub["achieved"].sum())
            pace_rows.append({
                "period": month,
                "completed": done,
                "total": int(len(sub)),
                "completion_rate": round(done / len(sub) * 100, 1) if len(sub) else None,
            })
        charts["objectives_pacing"] = pace_rows

    # --- Meeting load by member (who carries the meeting burden) ---
    if not meetings.empty and "Organizer_ID" in meetings.columns:
        team_meetings = meetings[
            meetings["Organizer_ID"].astype(str).str.strip().isin(team)
        ].copy()
        if not team_meetings.empty:
            rows = []
            for m, group in team_meetings.groupby(
                    team_meetings["Organizer_ID"].astype(str).str.strip()):
                over60 = group.get("Over_60_Min_Flag")
                over60_share = None
                if over60 is not None and not group.empty:
                    over60_share = (
                        over60.astype(str).str.strip().str.upper() == "TRUE"
                    ).mean()
                rows.append({
                    "name": emp_name.get(m),
                    "department": emp_dept_id.get(m),
                    "meetings": int(len(group)),
                    "cost_hours": round(float(
                        pd.to_numeric(group.get("Meeting_Cost_Hours"),
                                      errors="coerce").sum()), 1),
                    "over60_share": round(float(over60_share) * 100, 1)
                    if over60_share is not None else None,
                })
            rows.sort(key=lambda r: -(r["cost_hours"] or 0))
            charts["meeting_load_by_member"] = rows[:12]

    # --- Office vs remote days per week (team usage pattern) ---
    if not hybrid.empty and "Week_Start" in hybrid.columns:
        h = hybrid[hybrid["Employee_ID"].astype(str).str.strip().isin(team)].copy()
        if not h.empty:
            h["office"] = pd.to_numeric(h.get("Office_Days"), errors="coerce").fillna(0)
            h["remote"] = pd.to_numeric(h.get("Remote_Days"), errors="coerce").fillna(0)
            weekly_usage = []
            for week, group in h.groupby(
                    h["Week_Start"].astype(str).str.strip()):
                people = group["Employee_ID"].nunique()
                weekly_usage.append({
                    "week": week,
                    "office_days": round(
                        float(group["office"].sum()) / people, 1) if people else 0,
                    "remote_days": round(
                        float(group["remote"].sum()) / people, 1) if people else 0,
                })
            charts["office_vs_remote_weekly"] = sorted(
                weekly_usage, key=lambda r: r["week"])

    # --- Weekly engagement of the lowest-performing team members ---
    if not hybrid.empty and "Engagement_Score" in hybrid.columns:
        low_ids = [
            m for m in team_ids
            if m in composite_series
        ]
        low_ids = sorted(
            low_ids, key=lambda m: composite_series[m]
        )[:3]
        if low_ids:
            low_rows = []
            for week in sorted({
                str(w) for w in hybrid["Week_Start"].dropna() if w == w
            }):
                row = {"week": week}
                for m in low_ids:
                    sub = hybrid[
                        hybrid["Employee_ID"].astype(str).str.strip().eq(m)
                        & (hybrid["Week_Start"].astype(str) == week)
                    ]
                    row[emp_name.get(m, m)] = mean_of(sub["Engagement_Score"])
                row["Company"] = mean_of(
                    hybrid[hybrid["Week_Start"].astype(str) == week][
                        "Engagement_Score"])
                low_rows.append(row)
            charts["engagement_trend_low"] = low_rows

    # --- Wellbeing by department ---
    if not hybrid.empty and "Wellbeing_Score" in hybrid.columns:
        charts["wellbeing_by_department"] = [
            {
                "department": dept_name_by_id.get(dept_id, dept_id),
                "wellbeing": mean_of(
                    hybrid[hybrid["Employee_ID"].isin(members_of(dept_id))][
                        "Wellbeing_Score"]),
            }
            for dept_id in managed_ids
        ]

    # --- Performance index by team member ---
    perf_person = [
        {
            "name": emp_name.get(m, m),
            "score": composite_series[m],
        }
        for m in team_ids if m in composite_series
    ]
    perf_person.sort(key=lambda r: r["score"], reverse=True)
    charts["team_performance_by_person"] = perf_person

    # --- Skills assessment score by department ---
    if not learning.empty and "Assessment_Score" in learning.columns:
        tl = learning[learning["Employee_ID"].astype(str).str.strip().isin(team)]
        charts["assessment_score_by_department"] = [
            {
                "department": dept_name_by_id.get(dept_id, dept_id),
                "score": mean_of(
                    tl[tl["Employee_ID"].astype(str).str.strip().isin(
                        members_of(dept_id))]["Assessment_Score"]),
            }
            for dept_id in managed_ids
        ]

    # --- Team goals by category ---
    if not goals.empty and "Goal_Category" in goals.columns:
        tg = goals[goals["Employee_ID"].astype(str).str.strip().isin(team)]
        if not tg.empty:
            cats = (tg["Goal_Category"].astype(str).str.strip()
                    .replace("", "Unspecified").value_counts())
            charts["goals_by_category"] = [
                {"category": clean(cat), "count": int(count)}
                for cat, count in cats.items()
            ]

    return charts


def build_team_kpis(team_ids, name_by_id, composite_series, employees):
    """Data-driven health KPIs scoped to the manager's team."""
    team = set(team_ids)
    kpis = []

    def add(key, label, value, unit="", note=None):
        kpis.append({
            "key": key,
            "label": label,
            "value": value,
            "unit": unit,
            "note": note,
        })

    # Goals health
    goals = records("Goals.csv")
    team_goals = goals[
        goals["Employee_ID"].astype(str).str.strip().isin(team)
    ] if not goals.empty else pd.DataFrame()
    if not team_goals.empty and "Goal_Status" in team_goals.columns:
        status = team_goals["Goal_Status"].astype(str).str.strip().str.lower()
        total = len(team_goals)
        on_track = int(status.isin(["completed", "in progress"]).sum())
        overdue = int(status.eq("overdue").sum())
        priority = team_goals["Priority"].astype(str).str.strip().str.lower()
        high_overdue = int((status.eq("overdue") & priority.eq("high")).sum())
        add("goals_on_track", "Goals on track",
            round(on_track / total * 100, 1) if total else 0, "%",
            f"{on_track} of {total} team goals")
        add("goals_overdue", "Overdue goals", overdue, "",
            f"{high_overdue} of these are High-priority")
        add("high_priority_overdue", "High-prio overdue", high_overdue)

    # At-risk members (performance rating < 3.2)
    performance = records("Performance.csv")
    if not performance.empty and "Employee_ID" in performance.columns:
        perf = performance.copy()
        perf["Employee_ID"] = perf["Employee_ID"].astype(str).str.strip()
        perf["rating"] = pd.to_numeric(perf.get("Overall_Rating"), errors="coerce")
        low = perf[perf["Employee_ID"].isin(team) & (perf["rating"] < 3.2)]
        at_risk = low["Employee_ID"].nunique()
        names = [
            name_by_id.get(e) for e in
            low.groupby("Employee_ID")["rating"].mean().nsmallest(4).index
        ]
        add("at_risk", "At-risk members", at_risk, "",
            ", ".join(n for n in names if n) if names else None)

    # Meetings load
    meetings = records("Meetings.csv")
    team_meetings = meetings[
        meetings["Organizer_ID"].astype(str).str.strip().isin(team)
    ] if not meetings.empty else pd.DataFrame()
    if not team_meetings.empty:
        cost = team_meetings["Meeting_Cost_Hours"].astype(float).sum()
        att = pd.to_numeric(team_meetings.get("Attendance_Rate"), errors="coerce").mean()
        add("meeting_cost_hours", "Meeting cost-hours",
            round(float(cost), 1), "h",
            f"across {len(team_meetings)} meetings")
        if att is not None and not np.isnan(att):
            add("meeting_attendance", "Meeting attendance",
                round(float(att) * 100, 1), "%")

    # Learning completion
    learning = records("Learning.csv")
    team_learning = learning[
        learning["Employee_ID"].astype(str).str.strip().isin(team)
    ] if not learning.empty else pd.DataFrame()
    if not team_learning.empty and "Course_Status" in team_learning.columns:
        done = (team_learning["Course_Status"].astype(str).str.strip().str.lower()
                == "completed").sum()
        add("courses_completed", "Courses completed", int(done), "",
            f"of {len(team_learning)} assigned courses")

    # Hybrid adoption
    hybrid = records("HybridWork.csv")
    if not hybrid.empty and "Employee_ID" in hybrid.columns:
        h = hybrid[hybrid["Employee_ID"].astype(str).str.strip().isin(team)]
        if not h.empty and "Work_Mode" in h.columns:
            flex = h["Work_Mode"].astype(str).str.strip().str.lower().isin(
                ["hybrid", "remote"]).mean()
            add("hybrid_share", "Hybrid / remote weeks",
                round(float(flex) * 100, 1), "%")

    return kpis


def add_insight(insights, category, severity, title, message, metric=None):
    insights.append({
        "category": category,
        "severity": severity,
        "title": title,
        "message": message,
        "metric": metric,
    })


@router.get("/")
def manager_dashboard(manager_id: str = Query(..., min_length=1)):
    manager_id = manager_id.strip()

    employees = records("Employees.csv")
    if employees.empty:
        raise HTTPException(500, "Employees.csv is missing or empty")
    if not {"Employee_ID", "Employee_Name", "Department"}.issubset(employees.columns):
        raise HTTPException(500, "Employees.csv has an invalid schema")

    employees["Employee_ID"] = employees["Employee_ID"].astype(str).str.strip()

    matched = employees[employees["Employee_ID"] == manager_id]
    if matched.empty:
        raise HTTPException(404, "Manager not found")
    manager = matched.iloc[0].to_dict()

    if str(manager.get("User_Role", "")).strip().lower() != "manager":
        raise HTTPException(
            403, "This employee does not have the manager role")

    name_by_id = dict(zip(
        employees["Employee_ID"].astype(str),
        employees["Employee_Name"].astype(str),
    ))
    dept_by_id = dict(zip(
        employees["Employee_ID"].astype(str),
        employees["Department"].astype(str),
    ))

    # ---- departments managed ----
    manager_departments = records("ManagerDepartments.csv")
    departments = records("Departments.csv")

    assignments = pd.DataFrame()
    if not manager_departments.empty and "Manager_ID" in manager_departments.columns:
        assignments = manager_departments[
            ids_equal(manager_departments["Manager_ID"], manager_id)
        ].copy()

    assignment_type = {}
    managed_ids = []
    for _, row in assignments.iterrows():
        dept_id = str(row.get("Department_ID")).strip()
        if dept_id and dept_id != "nan":
            managed_ids.append(dept_id)
            assignment_type[dept_id] = str(row.get("Assignment_Type") or "Primary")

    dept_info = {}
    if not departments.empty and "Department_ID" in departments.columns:
        for _, row in departments.iterrows():
            dept_info[str(row["Department_ID"])] = row.to_dict()

    # ---- per-employee series + composite ----
    series = build_series()
    all_ids = employees["Employee_ID"].astype(str).tolist()
    composite_series = {
        emp: score
        for emp in all_ids
        if (score := composite_score(series, emp)) is not None
    }

    # ---- team = everyone in the managed departments (plus direct reports) ----
    direct_reports = set(
        employees[
            ids_equal(employees["Manager_ID"], manager_id)
        ]["Employee_ID"].astype(str)
    ) if "Manager_ID" in employees.columns else set()

    dept_members = {}
    team_ids = []
    for dept_id in managed_ids:
        members = employees[
            employees["Department_ID"].astype(str).str.strip() == dept_id
        ]["Employee_ID"].astype(str).tolist()
        dept_members[dept_id] = members
        for member in members:
            if member not in team_ids:
                team_ids.append(member)

    for report in direct_reports:
        if report not in team_ids:
            team_ids.append(report)

    team_ids = [emp for emp in team_ids if emp != manager_id]

    # ---- department cards ----
    company_composite = mean_of(list(composite_series.values()))
    department_cards = []

    for dept_id in managed_ids:
        info = dept_info.get(dept_id, {})
        members = dept_members.get(dept_id, [])
        member_scores = [
            composite_series[m] for m in members if m in composite_series
        ]
        dept_index = mean_of(member_scores)

        kpis = {}
        for key, label, unit, higher_is_better in DEPT_KPIS:
            value = dept_value(series, key, members)
            company_value = mean_of(list(series.get(key, {}).values()))
            delta = (
                round(value - company_value, 2)
                if value is not None and company_value is not None else None
            )
            kpis[key] = {
                "label": label,
                "unit": unit,
                "value": value,
                "company_avg": company_value,
                "delta": delta,
                "higher_is_better": higher_is_better,
                "better": (
                    None if delta is None
                    else (delta >= 0 if higher_is_better else delta <= 0)
                ),
            }

        ranked_members = sorted(
            (
                {
                    "employee_id": m,
                    "name": name_by_id.get(m),
                    "score": composite_series.get(m),
                }
                for m in members if m in composite_series
            ),
            key=lambda r: r["score"],
            reverse=True,
        )

        department_cards.append({
            "department_id": dept_id,
            "name": info.get("Department_Name"),
            "head": name_by_id.get(str(info.get("Department_Head_ID"))),
            "location": info.get("Location"),
            "assignment_type": assignment_type.get(dept_id, "Primary"),
            "employee_count": len(members),
            "composite_index": dept_index,
            "company_composite": company_composite,
            "kpis": kpis,
            "top_performers": ranked_members[:3],
            "watchlist": ranked_members[-3:][::-1] if len(ranked_members) > 3 else [],
        })

    # Order: primary departments first, strongest index first.
    department_cards.sort(
        key=lambda d: (d["assignment_type"] != "Primary", -(d["composite_index"] or 0))
    )

    # ---- team table ----
    team = []
    for emp in team_ids:
        dept = dept_by_id.get(emp)
        benchmark = build_benchmark(
            composite_series, emp, dept_by_id, dept, higher_is_better=True
        ) if emp in composite_series else None
        row = {
            "employee_id": emp,
            "name": name_by_id.get(emp),
            "department": dept,
            "department_id": str(
                employees[employees["Employee_ID"] == emp]["Department_ID"].iloc[0]
            ) if not employees[employees["Employee_ID"] == emp].empty else None,
            "job_role": str(
                employees[employees["Employee_ID"] == emp]["Job_Role"].iloc[0]
            ) if not employees[employees["Employee_ID"] == emp].empty else None,
            "is_direct_report": emp in direct_reports,
            "composite": composite_series.get(emp),
            "standing": benchmark["standing"] if benchmark else None,
            "percentile": benchmark["percentile"] if benchmark else None,
        }
        for key in TEAM_KPIS:
            row[key] = series.get(key, {}).get(emp)
        team.append(row)

    team.sort(key=lambda r: (r["composite"] is None, -(r["composite"] or 0)))

    # ---- manager's own performance (reuse the employee dashboard) ----
    own = employee_dashboard(employee_id=manager_id)
    own_headline = {
        key: value
        for key, value in own["headline"].items()
        if key not in ("ranking", "department_ranking")
    }

    # ---- team-level KPIs (data-driven) ----
    team_kpis = build_team_kpis(
        team_ids, name_by_id, composite_series, employees,
    )

    manager_ids = employees[
        employees["User_Role"].astype(str).str.strip().str.lower() == "manager"
    ]["Employee_ID"].astype(str).tolist()
    manager_composite = {
        emp: composite_series[emp] for emp in manager_ids if emp in composite_series
    }
    manager_benchmark = build_benchmark(
        manager_composite, manager_id, dept_by_id,
        manager.get("Department"), higher_is_better=True,
    )

    # ---- insights ----
    insights = []
    if department_cards:
        strongest = max(
            department_cards, key=lambda d: d["composite_index"] or 0)
        weakest = min(
            department_cards, key=lambda d: d["composite_index"] or 0)

        add_insight(
            insights, "Departments", "positive",
            f"{strongest['name']} is your strongest team",
            f"{strongest['name']} has the highest performance index "
            f"({strongest['composite_index']}) across the departments you manage.",
            {"department": strongest["name"], "index": strongest["composite_index"]},
        )

        if weakest is not strongest and weakest["composite_index"] is not None \
                and company_composite is not None \
                and weakest["composite_index"] < company_composite:
            add_insight(
                insights, "Departments", "warning",
                f"{weakest['name']} trails the company average",
                f"{weakest['name']} sits at an index of "
                f"{weakest['composite_index']} vs a company average of "
                f"{company_composite}. Review workload and support needs.",
                {"department": weakest["name"], "index": weakest["composite_index"]},
            )

        for dept in department_cards:
            weak_kpis = [
                f"{kpi['label']} ({kpi['value']} vs {kpi['company_avg']})"
                for kpi in dept["kpis"].values()
                if kpi["value"] is not None
                and kpi["company_avg"] is not None
                and kpi["higher_is_better"]
                and kpi["company_avg"] > 0
                and kpi["value"] < kpi["company_avg"] * 0.85
            ]
            if weak_kpis:
                add_insight(
                    insights, "Performance", "warning",
                    f"{dept['name']}: {len(weak_kpis)} KPIs below average",
                    "Below-company KPIs: " + ", ".join(weak_kpis[:4]) + ".",
                    {"department": dept["name"]},
                )

    if team:
        top = team[0]
        add_insight(
            insights, "People", "positive",
            f"{top['name']} leads your team",
            f"{top['name']} ({top['department']}) has the highest performance "
            f"index in your teams ({top['composite']})."
            if top["composite"] is not None else "Top performer identified.",
            {"employee_id": top["employee_id"], "score": top["composite"]},
        )

        overloaded = [r for r in team if r["goals_overdue"] and r["goals_overdue"] >= 2]
        if overloaded:
            add_insight(
                insights, "People", "warning",
                f"{len(overloaded)} team member(s) have overdue goals",
                "Consider a check-in on priorities for: "
                + ", ".join(r["name"] for r in overloaded[:4]) + ".",
                {"count": len(overloaded)},
            )

    if manager_benchmark:
        add_insight(
            insights, "You", "info",
            "Your manager standing",
            f"Your own performance index is {manager_benchmark['employee_value']} "
            f"({manager_benchmark['standing']} among {manager_benchmark['peers']} "
            f"managers).",
            {"score": manager_benchmark["employee_value"]},
        )

    # ---- data-driven team insights ----
    team_set = set(team_ids)
    performance_csv = records("Performance.csv")
    if not performance_csv.empty and "Employee_ID" in performance_csv.columns:
        p = performance_csv.copy()
        p["Employee_ID"] = p["Employee_ID"].astype(str).str.strip()
        p["rating"] = pd.to_numeric(p.get("Overall_Rating"), errors="coerce")
        low = p[p["Employee_ID"].isin(team_set) & (p["rating"] < 3.2)]
        low_ranked = low.groupby("Employee_ID")["rating"].mean().sort_values()
        if len(low_ranked):
            names = [name_by_id.get(e) for e in low_ranked.index[:4]]
            add_insight(
                insights, "People", "warning",
                f"{len(low_ranked)} team member(s) need support",
                "Rated below 3.2 on their latest review: "
                + ", ".join(n for n in names if n)
                + ". Consider coaching or a workload review.",
                {"count": int(len(low_ranked))},
            )

    goals_csv = records("Goals.csv")
    if not goals_csv.empty and "Goal_Status" in goals_csv.columns:
        tg = goals_csv[goals_csv["Employee_ID"].astype(str).str.strip()
                       .isin(team_set)]
        status = tg["Goal_Status"].astype(str).str.strip().str.lower()
        priority = tg["Priority"].astype(str).str.strip().str.lower()
        high_od = tg[status.eq("overdue") & priority.eq("high")]
        if len(high_od):
            add_insight(
                insights, "Goals", "warning",
                f"{len(high_od)} high-priority goal(s) overdue",
                "These are the most urgent items to unblock: "
                + ", ".join(
                    str(t)[:40] for t in high_od["Goal_Title"].head(3)
                ) + ".",
                {"count": int(len(high_od))},
            )
        not_started = int(status.eq("not started").sum())
        if not_started >= 5:
            add_insight(
                insights, "Goals", "info",
                f"{not_started} goals not started",
                f"{not_started} of {len(tg)} team goals haven't been started yet. "
                "Confirm owners and kick-off dates.",
                {"count": not_started},
            )

    meetings_csv = records("Meetings.csv")
    if not meetings_csv.empty and "Organizer_ID" in meetings_csv.columns:
        tm = meetings_csv[meetings_csv["Organizer_ID"].astype(str).str.strip()
                          .isin(team_set)]
        if not tm.empty:
            over60 = tm.get("Over_60_Min_Flag")
            if over60 is not None:
                share = (over60.astype(str).str.strip().str.upper() == "TRUE").mean()
                if share >= 0.2:
                    add_insight(
                        insights, "Meetings", "warning",
                        f"{round(share * 100)}% of meetings run over 60 minutes",
                        f"{int((over60.astype(str).str.strip().str.upper() == 'TRUE').sum())} "
                        f"of {len(tm)} team meetings exceed an hour. Shorter, "
                        "agenda-led meetings free up focus time.",
                        {"over60_share": round(float(share) * 100, 1)},
                    )
            cost = pd.to_numeric(tm.get("Meeting_Cost_Hours"),
                                 errors="coerce").sum()
            add_insight(
                insights, "Meetings", "info",
                "Team meeting load",
                f"Your teams spent {round(float(cost), 1)} meeting-hours across "
                f"{len(tm)} meetings. Watch for overlap with focus work.",
                {"cost_hours": round(float(cost), 1)},
            )

    learning_csv = records("Learning.csv")
    if not learning_csv.empty and "Course_Status" in learning_csv.columns:
        tl = learning_csv[learning_csv["Employee_ID"].astype(str).str.strip()
                          .isin(team_set)]
        if not tl.empty:
            done = (tl["Course_Status"].astype(str).str.strip().str.lower()
                    == "completed").mean()
            if done <= 0.5:
                add_insight(
                    insights, "Learning", "warning",
                    f"{round(done * 100)}% of courses completed",
                    f"{int(done * len(tl))} of {len(tl)} assigned courses have been "
                    "completed. Protect time for development.",
                    {"completed_pct": round(float(done) * 100, 1)},
                )

    hybrid_csv = records("HybridWork.csv")
    if (not hybrid_csv.empty and "Employee_ID" in hybrid_csv.columns
            and "Wellbeing_Score" in hybrid_csv.columns):
        th = hybrid_csv[hybrid_csv["Employee_ID"].astype(str).str.strip()
                        .isin(team_set)].copy()
        if not th.empty:
            th["week"] = th["Week_Start"].astype(str)
            weeks = sorted(th["week"].unique())
            if len(weeks) >= 2:
                half = max(1, len(weeks) // 2)
                early = set(weeks[:half])
                late = set(weeks[half:])
                th["wellbeing"] = pd.to_numeric(th["Wellbeing_Score"],
                                                errors="coerce")
                drops = []
                for emp, group in th.groupby("Employee_ID"):
                    e = group[group["week"].isin(early)]["wellbeing"].mean()
                    l = group[group["week"].isin(late)]["wellbeing"].mean()
                    if pd.notna(e) and pd.notna(l) and (e - l) >= 0.6:
                        drops.append((name_by_id.get(emp), round(float(e - l), 1)))
                if drops:
                    drops.sort(key=lambda r: -r[1])
                    add_insight(
                        insights, "Wellbeing", "warning",
                        f"{len(drops)} team member(s) trending down on wellbeing",
                        "Wellbeing dropped over recent weeks for: "
                        + ", ".join(f"{n} (-{d})" for n, d in drops[:4])
                        + ". A quick check-in could help.",
                        {"count": len(drops)},
                    )

    severity_order = {"warning": 0, "info": 1, "positive": 2}
    insights.sort(key=lambda i: severity_order.get(i["severity"], 3))

    # ---- response ----
    initials = "".join(
        part[0] for part in str(manager.get("Employee_Name", "?")).split()[:2]
    ).upper()

    dept_names = [
        str(dept_info.get(d, {}).get("Department_Name") or d)
        for d in managed_ids
    ]

    dept_name_by_id = {
        dept_id: str(info.get("Department_Name") or dept_id)
        for dept_id, info in dept_info.items()
    }
    charts = build_charts(
        managed_ids, dept_name_by_id, team_ids, manager_id, employees,
        composite_series, company_composite,
    )

    return {
        "meta": {
            "dashboard": "manager",
            "manager_id": manager_id,
            "generated_for": clean(manager.get("Employee_Name")),
            "departments": dept_names,
            "data_period": {
                "departments": len(managed_ids),
                "team_size": len(team_ids),
                "direct_reports": len(direct_reports),
            },
        },
        "profile": {
            key: clean(manager.get(key))
            for key in [
                "Employee_ID", "Employee_Name", "Department", "Job_Role",
                "Location", "Manager_ID", "Join_Date", "Employment_Type",
                "Work_Preference", "Active_Status",
            ]
        } | {
            "initials": initials,
            "managed_departments": [
                {
                    "department_id": d,
                    "name": dept_info.get(d, {}).get("Department_Name"),
                    "assignment_type": assignment_type.get(d, "Primary"),
                }
                for d in managed_ids
            ],
        },
        "headline": {
            "score": own_headline.get("score"),
            "company_avg": own_headline.get("company_avg"),
            "department_avg": own_headline.get("department_avg"),
            "standing": own_headline.get("standing"),
            "rank": manager_benchmark["rank"] if manager_benchmark else None,
            "peers": manager_benchmark["peers"] if manager_benchmark else None,
        },
        "own": {
            "kpis": own["kpis"],
            "insights": own["insights"],
        },
        "departments": department_cards,
        "team": team,
        "team_kpis": team_kpis,
        "insights": insights,
        "charts": charts,
        "recommendations": manager_recommendations(
            own["kpis"], department_cards, team, team_kpis,
        ),
        "context": {
            "company_composite": company_composite,
            "total_employees": int(len(employees)),
            "managed_department_count": len(managed_ids),
        },
    }
