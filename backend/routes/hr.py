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
from routes.recommendations import hr_recommendations


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

    # --- Performance vs wellbeing scatter (one point per employee) ---
    performance = records("Performance.csv")
    hybrid = records("HybridWork.csv")
    rating_by_id = {}
    wellbeing_by_id = {}
    if not performance.empty and "Employee_ID" in performance.columns:
        performance["Employee_ID"] = performance["Employee_ID"].astype(str).str.strip()
        if "Overall_Rating" in performance.columns:
            rating_by_id = (
                performance.assign(
                    value=pd.to_numeric(performance["Overall_Rating"], errors="coerce")
                ).dropna(subset=["value"]).groupby("Employee_ID")["value"].mean()
            )
    if not hybrid.empty and "Employee_ID" in hybrid.columns:
        hybrid["Employee_ID"] = hybrid["Employee_ID"].astype(str).str.strip()
        if "Wellbeing_Score" in hybrid.columns:
            wellbeing_by_id = (
                hybrid.assign(
                    value=pd.to_numeric(hybrid["Wellbeing_Score"], errors="coerce")
                ).dropna(subset=["value"]).groupby("Employee_ID")["value"].mean()
            )
    charts["performance_vs_wellbeing"] = [
        {
            "name": name_by_id.get(emp),
            "department": dept_by_id.get(emp),
            "rating": round(float(rating_by_id[emp]), 2),
            "wellbeing": round(float(wellbeing_by_id[emp]), 2),
        }
        for emp in all_ids
        if emp in rating_by_id and emp in wellbeing_by_id
    ]

    # --- Meeting attendance by department ---
    meetings = records("Meetings.csv")
    learning = records("Learning.csv")
    if not meetings.empty and {
        "Department", "Attendance_Rate"
    }.issubset(meetings.columns):
        att = (meetings.groupby(meetings["Department"].astype(str).str.strip())["Attendance_Rate"].mean())
        charts["attendance_by_department"] = [
            {"department": clean(dept), "value": round(float(v) * 100, 1)}
            for dept, v in att.items()
        ]

    # --- Engagement by location ---
    if not hybrid.empty and {"Location", "Engagement_Score"}.issubset(hybrid.columns):
        eng = hybrid.groupby(
            hybrid["Location"].astype(str).str.strip())["Engagement_Score"].mean()
        charts["engagement_by_location"] = [
            {"location": clean(loc), "value": round(float(v), 2)}
            for loc, v in eng.items()
        ]

    # --- Low performers by department (share rated < 3.2) ---
    dept_names = [d["name"] for d in departments]
    if len(rating_by_id) > 0:
        headcount = employees.groupby(
            employees["Department"].astype(str).str.strip())["Employee_ID"].count()
        low_counts = {}
        for emp in all_ids:
            r = rating_by_id.get(emp)
            if r is not None and float(r) < 3.2:
                d = dept_by_id.get(emp)
                low_counts[d] = low_counts.get(d, 0) + 1
        charts["low_performance_by_department"] = [
            {
                "department": clean(d),
                "pct": round(low_counts.get(d, 0) / int(headcount.get(d, 1)) * 100, 1),
                "count": int(low_counts.get(d, 0)),
            }
            for d in dept_names
        ]

    # --- Meeting cost & efficiency by department ---
    if not meetings.empty and "Department" in meetings.columns:
        mc_rows = []
        for dept, group in meetings.groupby(
                meetings["Department"].astype(str).str.strip()):
            mc_rows.append({
                "department": clean(dept),
                "cost_hours": round(float(
                    pd.to_numeric(group.get("Meeting_Cost_Hours"),
                                  errors="coerce").sum()), 1),
                "efficiency": round(float(
                    pd.to_numeric(group.get("Efficiency_Score"),
                                  errors="coerce").mean()), 2),
            })
        charts["meeting_cost_by_department"] = sorted(
            mc_rows, key=lambda r: -(r["cost_hours"] or 0))

    # --- Meeting efficiency & action completion by meeting type ---
    if not meetings.empty and "Meeting_Type" in meetings.columns:
        mt_rows = []
        for mtype, group in meetings.groupby(
                meetings["Meeting_Type"].astype(str).str.strip()):
            eff = pd.to_numeric(group.get("Efficiency_Score"), errors="coerce").mean()
            act = pd.to_numeric(group.get("Action_Completion_Rate"),
                                errors="coerce").mean()
            mt_rows.append({
                "type": clean(mtype),
                "efficiency": round(float(eff), 2) if pd.notna(eff) else None,
                "action_completion": round(float(act) * 100, 1)
                if pd.notna(act) else None,
            })
        charts["meeting_type_efficiency"] = sorted(
            mt_rows, key=lambda r: (r["efficiency"] is None, r["efficiency"] or 0))

    # --- Workspace utilization by location ---
    resources = records("Resources.csv")
    if not resources.empty and "Location" in resources.columns:
        ws_rows = []
        for loc, group in resources.groupby(
                resources["Location"].astype(str).str.strip()):
            desk = pd.to_numeric(group.get("Desk_Utilization"), errors="coerce").mean()
            room = pd.to_numeric(group.get("Room_Utilization"), errors="coerce").mean()
            renew = pd.to_numeric(group.get("Renewable_Energy_Rate"),
                                  errors="coerce").mean()
            ws_rows.append({
                "location": clean(loc),
                "desk_utilization": round(float(desk) * 100, 1)
                if pd.notna(desk) else None,
                "room_utilization": round(float(room) * 100, 1)
                if pd.notna(room) else None,
                "renewable_energy": round(float(renew) * 100, 1)
                if pd.notna(renew) else None,
            })
        charts["workspace_utilization"] = ws_rows

    # --- Sustainability: weekly CO2 + commute saved ---
    if not hybrid.empty and "Week_Start" in hybrid.columns:
        s_rows = []
        for week, group in hybrid.groupby(
                hybrid["Week_Start"].astype(str).str.strip()):
            co2 = pd.to_numeric(group.get("Estimated_CO2_Saved_KG"),
                                errors="coerce").sum()
            km = pd.to_numeric(group.get("Commute_Distance_Saved_KM"),
                               errors="coerce").sum()
            s_rows.append({
                "week": week,
                "co2_kg": round(float(co2), 1) if pd.notna(co2) else 0,
                "commute_km": round(float(km), 1) if pd.notna(km) else 0,
            })
        charts["sustainability_weekly"] = sorted(s_rows, key=lambda r: r["week"])

    # --- Tenure distribution ---
    if "Join_Date" in employees.columns:
        join = pd.to_datetime(employees["Join_Date"], errors="coerce")
        tenure = (pd.Timestamp("2026-10-01") - join).dt.days / 365.25
        buckets = [
            ("Under 2 years", (tenure < 2)),
            ("2–5 years", (tenure >= 2) & (tenure < 5)),
            ("5–8 years", (tenure >= 5) & (tenure < 8)),
            ("8+ years", (tenure >= 8)),
        ]
        charts["tenure_distribution"] = [
            {"bucket": label, "count": int(mask.sum())}
            for label, mask in buckets
        ]

    # --- Learning not-started share by department ---
    if not learning.empty and "Department" in learning.columns:
        lg_rows = []
        for dept, group in learning.groupby(
                learning["Department"].astype(str).str.strip()):
            if group.empty:
                continue
            ns = (group["Course_Status"].astype(str).str.strip().str.lower()
                  == "not started").mean()
            lg_rows.append({
                "department": clean(dept),
                "not_started_pct": round(float(ns) * 100, 1),
            })
        charts["learning_not_started_by_department"] = sorted(
            lg_rows, key=lambda r: -(r["not_started_pct"] or 0))

    # --- One-on-one cadence by manager ---
    if not meetings.empty and "Meeting_Type" in meetings.columns \
            and "Organizer_ID" in meetings.columns:
        oo = meetings[
            meetings["Meeting_Type"].astype(str).str.strip().str.lower()
            == "one-on-one"
        ]
        oo_rows = []
        for emp, count in oo.groupby(
                oo["Organizer_ID"].astype(str).str.strip()).size().items():
            if role_by_id.get(emp, "").lower() == "manager":
                oo_rows.append({
                    "name": name_by_id.get(emp, emp),
                    "count": int(count),
                })
        charts["one_on_one_by_manager"] = sorted(
            oo_rows, key=lambda r: -r["count"])

    # ---- org KPIs (data-driven) ----
    org_kpis = []

    def add_org(key, label, value, unit="", note=None):
        org_kpis.append({
            "key": key, "label": label, "value": value,
            "unit": unit, "note": note,
        })

    status_counts_all = employees["Employment_Status"].astype(str).str.strip()
    add_org("headcount", "Headcount", int(len(all_ids)), "",
            f"{int((status_counts_all == 'Active').sum())} active")
    if company_composite is not None:
        add_org("avg_index", "Avg performance index",
                round(float(company_composite), 1))
    at_risk_ids = [
        emp for emp in all_ids
        if rating_by_id.get(emp) is not None and float(rating_by_id[emp]) < 3.2
    ]
    add_org("at_risk", "At-risk employees", len(at_risk_ids), "",
            ", ".join(name_by_id.get(e, e) for e in at_risk_ids[:3])
            if at_risk_ids else None)

    goals_all = records("Goals.csv")
    if not goals_all.empty and "Goal_Status" in goals_all.columns:
        status = goals_all["Goal_Status"].astype(str).str.strip().str.lower()
        priority = goals_all["Priority"].astype(str).str.strip().str.lower()
        hp_overdue = int((status.eq("overdue") & priority.eq("high")).sum())
        add_org("high_priority_overdue", "High-prio overdue goals", hp_overdue)

    if not meetings.empty:
        add_org("meeting_cost_hours", "Meeting cost-hours",
                round(float(pd.to_numeric(meetings.get("Meeting_Cost_Hours"),
                                          errors="coerce").sum()), 1), "h",
                f"across {len(meetings)} meetings")
        att = pd.to_numeric(meetings.get("Attendance_Rate"),
                            errors="coerce").mean()
        if pd.notna(att):
            add_org("attendance", "Meeting attendance",
                    round(float(att) * 100, 1), "%")

    if not learning.empty and "Course_Status" in learning.columns:
        ns = int((learning["Course_Status"].astype(str).str.strip().str.lower()
                  == "not started").sum())
        add_org("learning_not_started", "Learning not started", ns, "",
                f"of {len(learning)} assigned courses")

    if not hybrid.empty:
        co2 = pd.to_numeric(hybrid.get("Estimated_CO2_Saved_KG"),
                            errors="coerce").sum()
        add_org("co2_saved", "CO2 saved", round(float(co2), 0), "kg",
                "from hybrid work")

    if not resources.empty:
        renew = pd.to_numeric(resources.get("Renewable_Energy_Rate"),
                              errors="coerce").mean()
        if pd.notna(renew):
            add_org("renewable", "Renewable energy",
                    round(float(renew) * 100, 1), "%")

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

    # ---- data-driven org insights ----
    if at_risk_ids:
        names = [name_by_id.get(e, e) for e in at_risk_ids[:4]]
        add_insight(
            insights, "People", "warning",
            f"{len(at_risk_ids)} employees are below a 3.2 rating",
            "Consider retention and support plans for: "
            + ", ".join(names) + ("…" if len(at_risk_ids) > 4 else "") + ".",
            {"count": len(at_risk_ids)},
        )

    mt_rows_local = charts.get("meeting_type_efficiency", [])
    if mt_rows_local:
        worst = mt_rows_local[0]
        add_insight(
            insights, "Meetings", "warning" if (worst["efficiency"] or 5) < 3 else "info",
            f"{worst['type']} meetings are the least efficient",
            f"{worst['type']} meetings average {worst['efficiency']}/5 efficiency"
            + (f" with only {worst['action_completion']}% of action items completed"
               if worst.get("action_completion") is not None else "")
            + ". Tighten agendas and outputs.",
            {"meeting_type": worst["type"]},
        )

    ws = charts.get("workspace_utilization", [])
    if ws:
        avg_desk = sum(
            r["desk_utilization"] for r in ws
            if r.get("desk_utilization") is not None
        ) / max(1, len([r for r in ws if r.get("desk_utilization") is not None]))
        if avg_desk < 65:
            add_insight(
                insights, "Workplace", "info",
                f"Desk utilization averages {round(avg_desk)}%",
                f"With desks at ~{round(avg_desk)}% occupancy, there may be room "
                "to consolidate space or shift to more flexible seating.",
                {"desk_utilization": round(avg_desk, 1)},
            )

    lg = charts.get("learning_not_started_by_department", [])
    if lg and lg[0].get("not_started_pct", 0) >= 25:
        add_insight(
            insights, "Learning", "warning",
            f"{lg[0]['department']} lags on learning",
            f"{lg[0]['not_started_pct']}% of {lg[0]['department']} courses are still "
            "not started. Protect development time to avoid skills gaps.",
            {"department": lg[0]["department"]},
        )

    co2 = next((k["value"] for k in org_kpis if k["key"] == "co2_saved"), None)
    if co2:
        add_insight(
            insights, "Sustainability", "positive",
            "Hybrid work cut commute emissions",
            f"Hybrid work saved an estimated {int(co2):,} kg of CO2 this period. "
            "Highlight this in ESG reporting.",
            {"co2_saved": co2},
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
        "org_kpis": org_kpis,
        "charts": charts,
        "insights": insights,
        "recommendations": hr_recommendations(
            departments, managers, org_kpis, charts,
        ),
        "context": {
            "locations": sorted(employees["Location"].astype(str).str.strip().unique().tolist()),
            "review_period": "2026-09",
        },
    }
