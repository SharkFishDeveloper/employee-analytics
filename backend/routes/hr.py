"""HR analytics dashboard.

Company-wide view for HR: performance of every department, of the department
managers, and of every individual — plus leaderboards, charts and insights.
"""

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from routes.employee import (
    records,
    clean,
    mean_of,
    build_benchmark,
)
from routes.manager import (
    DEPT_KPIS,
    build_series,
    composite_score,
    dept_value,
)


router = APIRouter(prefix="/hr", tags=["HR Dashboard"])

TOPN = 10


def dept_kpi_block(series, members):
    block = {}
    for key, label, unit, higher_is_better in DEPT_KPIS:
        value = dept_value(series, key, members)
        company_value = mean_of(list(series.get(key, {}).values()))
        delta = (
            round(value - company_value, 2)
            if value is not None and company_value is not None else None
        )
        block[key] = {
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
    return block


def add_insight(insights, category, severity, title, message, metric=None):
    insights.append({
        "category": category,
        "severity": severity,
        "title": title,
        "message": message,
        "metric": metric,
    })


@router.get("/")
def hr_dashboard(employee_id: str | None = Query(None)):
    employees = records("Employees.csv")
    if employees.empty:
        raise HTTPException(500, "Employees.csv is missing or empty")
    if not {"Employee_ID", "Employee_Name", "Department"}.issubset(employees.columns):
        raise HTTPException(500, "Employees.csv has an invalid schema")
    employees["Employee_ID"] = employees["Employee_ID"].astype(str).str.strip()

    viewer = None
    if employee_id:
        employee_id = employee_id.strip()
        match = employees[employees["Employee_ID"] == employee_id]
        if match.empty:
            raise HTTPException(404, "Employee not found")
        viewer = match.iloc[0].to_dict()

    name_by_id = dict(zip(
        employees["Employee_ID"].astype(str),
        employees["Employee_Name"].astype(str),
    ))
    dept_by_id = dict(zip(
        employees["Employee_ID"].astype(str),
        employees["Department"].astype(str),
    ))
    deptid_by_id = dict(zip(
        employees["Employee_ID"].astype(str),
        employees["Department_ID"].astype(str).str.strip(),
    ))
    role_by_id = dict(zip(
        employees["Employee_ID"].astype(str),
        employees["User_Role"].astype(str),
    ))
    job_by_id = dict(zip(
        employees["Employee_ID"].astype(str),
        employees["Job_Role"].astype(str),
    ))
    loc_by_id = dict(zip(
        employees["Employee_ID"].astype(str),
        employees["Location"].astype(str),
    ))
    all_ids = employees["Employee_ID"].astype(str).tolist()

    departments_df = records("Departments.csv")
    dept_rows = []
    if not departments_df.empty:
        for _, row in departments_df.iterrows():
            dept_rows.append(row.to_dict())
    dept_info = {str(r.get("Department_ID")): r for r in dept_rows}

    # ---- per-employee series + composite ----
    series = build_series()
    composite_series = {
        emp: score for emp in all_ids
        if (score := composite_score(series, emp)) is not None
    }
    company_composite = mean_of(list(composite_series.values()))

    manager_ids = [
        emp for emp in all_ids
        if role_by_id.get(emp, "").strip().lower() == "manager"
    ]
    manager_composite = {
        emp: composite_series[emp] for emp in manager_ids if emp in composite_series
    }
    manager_bench_for = lambda emp: build_benchmark(
        manager_composite, emp, dept_by_id, dept_by_id.get(emp), True)

    # ---- top performers overall ----
    ranked_all = sorted(
        (
            {
                "employee_id": emp,
                "name": name_by_id.get(emp),
                "department": dept_by_id.get(emp),
                "department_id": deptid_by_id.get(emp),
                "job_role": job_by_id.get(emp),
                "location": loc_by_id.get(emp),
                "score": score,
                "is_manager": role_by_id.get(emp, "").strip().lower() == "manager",
            }
            for emp, score in composite_series.items()
        ),
        key=lambda r: r["score"],
        reverse=True,
    )
    top_performers = ranked_all[:TOPN]

    # ---- departments ----
    departments = []
    for dept_id, info in dept_info.items():
        members = [e for e in all_ids if deptid_by_id.get(e) == dept_id]
        if not members:
            continue

        member_scores = [composite_series[m] for m in members if m in composite_series]
        dept_index = mean_of(member_scores)
        head_id = str(info.get("Department_Head_ID") or "").strip()

        emp_rows = []
        for emp in members:
            benchmark = build_benchmark(
                composite_series, emp, dept_by_id, info.get("Department_Name"), True
            ) if emp in composite_series else None
            emp_rows.append({
                "employee_id": emp,
                "name": name_by_id.get(emp),
                "job_role": job_by_id.get(emp),
                "location": loc_by_id.get(emp),
                "user_role": role_by_id.get(emp),
                "is_manager": role_by_id.get(emp, "").strip().lower() == "manager",
                "composite": composite_series.get(emp),
                "standing": benchmark["standing"] if benchmark else None,
                "performance_rating": series.get("performance_rating", {}).get(emp),
                "goal_progress": series.get("goal_progress", {}).get(emp),
                "goal_achievement_rate": series.get("goal_achievement_rate", {}).get(emp),
                "engagement_score": series.get("engagement_score", {}).get(emp),
                "wellbeing_score": series.get("wellbeing_score", {}).get(emp),
                "learning_completion_rate": series.get("learning_completion_rate", {}).get(emp),
                "meeting_efficiency": series.get("meeting_efficiency", {}).get(emp),
                "goals_overdue": series.get("goals_overdue", {}).get(emp),
            })
        emp_rows.sort(key=lambda r: (r["composite"] is None, -(r["composite"] or 0)))

        head_row = next((r for r in emp_rows if r["employee_id"] == head_id), None)
        head_bench = manager_bench_for(head_id) if head_id in manager_composite else None

        departments.append({
            "department_id": dept_id,
            "name": info.get("Department_Name"),
            "location": info.get("Location"),
            "head_id": head_id,
            "head_name": name_by_id.get(head_id),
            "manager": {
                "employee_id": head_id,
                "name": name_by_id.get(head_id),
                "job_role": job_by_id.get(head_id),
                "composite": composite_series.get(head_id),
                "standing": head_bench["standing"] if head_bench else None,
                "rank": head_bench["rank"] if head_bench else None,
                "peers": head_bench["peers"] if head_bench else None,
            },
            "employee_count": len(members),
            "composite_index": dept_index,
            "company_composite": company_composite,
            "kpis": dept_kpi_block(series, members),
            "top_performer": emp_rows[0] if emp_rows else None,
            "employees": emp_rows,
        })
    departments.sort(key=lambda d: -(d["composite_index"] or 0))

    # ---- managers leaderboard ----
    managers = []
    for emp in manager_ids:
        bench = build_benchmark(
            composite_series, emp, dept_by_id, dept_by_id.get(emp), True)
        members = [e for e in all_ids if deptid_by_id.get(e) == deptid_by_id.get(emp)]
        managers.append({
            "employee_id": emp,
            "name": name_by_id.get(emp),
            "department": dept_by_id.get(emp),
            "department_id": deptid_by_id.get(emp),
            "job_role": job_by_id.get(emp),
            "composite": composite_series.get(emp),
            "standing": bench["standing"] if bench else None,
            "rank": bench["rank"] if bench else None,
            "peers": bench["peers"] if bench else None,
            "performance_rating": series.get("performance_rating", {}).get(emp),
            "goal_achievement_rate": series.get("goal_achievement_rate", {}).get(emp),
            "team_size": len(members),
            "team_index": mean_of([
                composite_series[m] for m in members if m in composite_series
            ]),
        })
    managers.sort(key=lambda r: (r["composite"] is None, -(r["composite"] or 0)))

    # ---- charts ----
    charts = {}
    charts["department_index"] = [
        {
            "department": d["name"],
            "index": d["composite_index"],
            "headcount": d["employee_count"],
            "company_avg": company_composite,
        }
        for d in departments
    ]
    charts["department_headcount"] = [
        {"department": d["name"], "count": d["employee_count"]}
        for d in departments
    ]
    charts["top_performers"] = [
        {"name": r["name"], "department": r["department"], "score": r["score"]}
        for r in top_performers
    ]
    charts["performance_distribution"] = [
        {"score": score} for score in composite_series.values()
    ]
    charts["manager_index"] = [
        {
            "name": r["name"],
            "department": r["department"],
            "score": r["composite"] if r["composite"] is not None else 0,
        }
        for r in managers
    ]

    for key, chart_key in [
        ("engagement_score", "department_engagement"),
        ("goal_achievement_rate", "department_goal_achievement"),
        ("learning_completion_rate", "department_learning"),
        ("meeting_efficiency", "department_meeting_efficiency"),
    ]:
        charts[chart_key] = [
            {"department": d["name"], "value": d["kpis"].get(key, {}).get("value")}
            for d in departments
        ]

    charts["employment_status"] = [
        {"status": clean(status), "count": int(count)}
        for status, count in employees["Employment_Status"].astype(str)
        .str.strip().value_counts().items()
    ]
    charts["location_headcount"] = [
        {"location": clean(loc), "count": int(count)}
        for loc, count in employees["Location"].astype(str).str.strip()
        .value_counts().items()
    ]

    # ---- insights ----
    insights = []
    if top_performers:
        best = top_performers[0]
        add_insight(
            insights, "People", "positive",
            f"{best['name']} is the top performer company-wide",
            f"{best['name']} ({best['department']}, {best['job_role']}) leads with a "
            f"performance index of {best['score']}.",
            {"employee_id": best["employee_id"], "score": best["score"]},
        )
    if departments:
        strongest = departments[0]
        weakest = departments[-1]
        add_insight(
            insights, "Departments", "positive",
            f"{strongest['name']} is the strongest department",
            f"{strongest['name']} leads with an index of {strongest['composite_index']} "
            f"(company average {company_composite}).",
            {"department": strongest["name"]},
        )
        add_insight(
            insights, "Departments", "warning" if (weakest["composite_index"] or 0) < (company_composite or 0) else "info",
            f"{weakest['name']} is the weakest department",
            f"{weakest['name']} sits at an index of {weakest['composite_index']} "
            f"vs a company average of {company_composite}.",
            {"department": weakest["name"]},
        )

        overdue_depts = sorted(
            departments,
            key=lambda d: -(d["kpis"].get("goals_overdue", {}).get("value") or 0),
        )
        if overdue_depts and (overdue_depts[0]["kpis"].get("goals_overdue", {}).get("value") or 0) > 0:
            d = overdue_depts[0]
            add_insight(
                insights, "Goals", "warning",
                f"{d['name']} has the most overdue goals",
                f"{d['name']} averages {d['kpis']['goals_overdue']['value']} overdue "
                f"goals per person (company average "
                f"{d['kpis']['goals_overdue']['company_avg']}).",
                {"department": d["name"]},
            )

    if managers:
        best_mgr = managers[0]
        add_insight(
            insights, "Managers", "info",
            f"{best_mgr['name']} is the top-rated manager",
            f"{best_mgr['name']} ({best_mgr['department']}) has the highest manager "
            f"index at {best_mgr['composite']} and a team index of {best_mgr['team_index']}.",
            {"employee_id": best_mgr["employee_id"]},
        )

    severity_order = {"warning": 0, "info": 1, "positive": 2}
    insights.sort(key=lambda i: severity_order.get(i["severity"], 3))

    # ---- headline / context ----
    status_counts = employees["Employment_Status"].astype(str).str.strip().value_counts()
    active = int(status_counts.get("Active", 0))

    return {
        "meta": {
            "dashboard": "hr",
            "viewer": clean(viewer.get("Employee_Name")) if viewer else None,
            "viewer_id": employee_id,
            "company": "Company-wide",
            "data_period": {"employees": len(all_ids), "departments": len(departments)},
        },
        "profile": {
            "Employee_ID": employee_id,
            "Employee_Name": clean(viewer.get("Employee_Name")) if viewer else "HR",
            "Job_Role": clean(viewer.get("Job_Role")) if viewer else "HR",
            "initials": (
                "".join(p[0] for p in str(
                    viewer.get("Employee_Name", "HR")).split()[:2]).upper()
                if viewer else "HR"
            ),
        },
        "headline": {
            "company_composite": company_composite,
            "employee_count": len(all_ids),
            "active_count": active,
            "department_count": len(departments),
            "manager_count": len(manager_ids),
            "top_performer": top_performers[0] if top_performers else None,
            "best_department": departments[0] if departments else None,
        },
        "top_performers": top_performers,
        "departments": departments,
        "managers": managers,
        "charts": charts,
        "insights": insights,
        "context": {
            "locations": sorted(employees["Location"].astype(str).str.strip().unique().tolist()),
            "review_period": "2026-09",
        },
    }
