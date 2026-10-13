# HR Dashboard — KPI & Insight Reference

This document explains exactly how every KPI, chart value and insight on the
**HR dashboard** is calculated.

- Endpoint: `GET /hr/?employee_id=E007`
- Frontend URL: `http://localhost:3000/hr?employee_id=E007`
- Backend: `backend/routes/hr.py`
- Data: CSV files in `backend/data/`
- Frontend: `frontend/app/hr/page.jsx`

The HR dashboard is **company-wide** and reuses the shared per-employee series
and composite index from `backend/routes/manager.py`
(`build_series`, `composite_score`) and the KPI helpers from
`backend/routes/employee.py` (`records`, `mean_of`, `clean`, `build_benchmark`).

---

## KPI quick reference (start here)

The HR dashboard has **two** KPI collections. Full details in §3 (department)
and §5 (organisation).

### A. Department KPIs (`DEPT_KPIS`) — one block per department

All are **means across the department's members** of each employee's series.
`H↑` = higher is better, `L↓` = lower is better. Each block also carries
`company_avg`, `delta` and a `better` flag.

| KPI | Key | Unit | Dir |
|-----|-----|------|-----|
| **Performance rating** | `performance_rating` | rating | H↑ |
| **Goal achievement** | `goal_achievement_rate` | % | H↑ |
| **Goal progress** | `goal_progress` | % | H↑ |
| **Engagement** | `engagement_score` | score | H↑ |
| **Wellbeing** | `wellbeing_score` | score | H↑ |
| **Learning completion** | `learning_completion_rate` | % | H↑ |
| **Assessment score** | `assessment_score` | score | H↑ |
| **Meeting efficiency** | `meeting_efficiency` | score | H↑ |
| **Action completion** | `action_completion_rate` | % | H↑ |
| **Avg hours worked** | `hours_worked` | h | H↑ |
| **CO2 saved** | `co2_saved` | kg | H↑ |
| **Overdue goals** | `goals_overdue` | goals | L↓ |

### B. Organisation KPIs (`org_kpis`) — headline strip

| KPI | Key | Formula |
|-----|-----|---------|
| **Headcount** | `headcount` | `len(all employee IDs)` |
| **Avg performance index** | `avg_index` | mean composite across all employees |
| **At-risk employees** | `at_risk` | count with mean rating < 3.2 |
| **High-prio overdue goals** | `high_priority_overdue` | count priority `high` **and** status `overdue` |
| **Meeting cost-hours** | `meeting_cost_hours` | sum `Meeting_Cost_Hours` |
| **Meeting attendance** | `attendance` | mean `Attendance_Rate × 100` |
| **Learning not started** | `learning_not_started` | count courses status `not started` |
| **CO2 saved** | `co2_saved` | sum `Estimated_CO2_Saved_KG` |
| **Renewable energy** | `renewable` | mean `Renewable_Energy_Rate × 100` |

> The **composite index (0–100)** behind every department/manager/person score
> is documented in `README_EMPLOYEE.md §4`.

---

## 1. Per-employee series & composite

Both are defined once and reused everywhere:

- `build_series()` → `metric_key -> {employee_id: value}` for the whole company
  (documented in `README_MANAGER.md §2`).
- `composite_score(series, id)` → weighted 0–100 index (documented in
  `README_EMPLOYEE.md §4`).
- `company_composite` = mean composite across all employees.

These drive the department indices, manager indices, top performers,
leaderboards, the performance distribution and the headline.

---

## 2. Top performers

All employees are ranked by composite descending; the top **10** (`TOPN`)
become `top_performers`. Each entry carries `employee_id`, `name`,
`department`, `department_id`, `job_role`, `location`, `score` and
`is_manager`.

---

## 3. Departments

For every department in `Departments.csv`:

- **members** = all employees whose `Department_ID` matches.
- **composite_index** = `mean_of(member composites)`.
- **kpis** = a `dept_kpi_block` computed by `dept_value` (mean of each metric
  across the department's members) for every entry in `DEPT_KPIS`:

| Key | Label | Unit | Direction |
|-----|-------|------|-----------|
| `performance_rating` | Performance rating | rating | H↑ |
| `goal_achievement_rate` | Goal achievement | % | H↑ |
| `goal_progress` | Goal progress | % | H↑ |
| `engagement_score` | Engagement | score | H↑ |
| `wellbeing_score` | Wellbeing | score | H↑ |
| `learning_completion_rate` | Learning completion | % | H↑ |
| `assessment_score` | Assessment score | score | H↑ |
| `meeting_efficiency` | Meeting efficiency | score | H↑ |
| `action_completion_rate` | Action completion | % | H↑ |
| `hours_worked` | Avg hours worked | h | H↑ |
| `co2_saved` | CO2 saved | kg | H↑ |
| `goals_overdue` | Overdue goals | goals | L↓ |

Each KPI block also contains `company_avg`, `delta`
(`value − company_avg`), `higher_is_better` and a `better` flag.

- **manager** = the department head (`Department_Head_ID`), with its composite,
  benchmark standing, rank and number of manager peers.
- **top_performer** = highest-composite member.
- **employees** = every member with composite, standing, rating, goal progress,
  goal achievement, engagement, wellbeing, learning completion, meeting
  efficiency and overdue goals.

Departments are sorted by `composite_index` descending.

---

## 4. Managers leaderboard

For every employee whose `User_Role` is *manager*:

- composite index and benchmark standing (rank + peers among managers),
- `performance_rating`, `goal_achievement_rate`,
- `team_size` = number of employees in the manager's department,
- `team_index` = mean composite of those team members.

Sorted by composite descending.

---

## 5. Organisation KPIs (`org_kpis`)

A headline strip returned as `org_kpis` — a list of
`{ key, label, value, unit, note }`.

| key | Label | Formula |
|-----|-------|---------|
| `headcount` | Headcount | `len(all employee IDs)` (note: number of `Active`) |
| `avg_index` | Avg performance index | `company_composite` (mean of all composites) |
| `at_risk` | At-risk employees | count of employees with mean rating < 3.2 (note lists up to 3 names) |
| `high_priority_overdue` | High-prio overdue goals | count of goals, priority `high` **and** status `overdue` |
| `meeting_cost_hours` | Meeting cost-hours | sum of `Meeting_Cost_Hours` (note: number of meetings) |
| `attendance` | Meeting attendance | mean of `Attendance_Rate × 100` |
| `learning_not_started` | Learning not started | count of courses with status `not started` (note: of N assigned) |
| `co2_saved` | CO2 saved | sum of `Estimated_CO2_Saved_KG`, rounded to whole kg |
| `renewable` | Renewable energy | mean of `Renewable_Energy_Rate × 100` |

---

## 6. Chart datasets

| Chart key | Type | How it is built |
|-----------|------|-----------------|
| `department_index` | bar | per department: `composite_index`, headcount and `company_avg` |
| `department_headcount` | bar | employee count per department |
| `top_performers` | bar | name / department / score for the top 10 |
| `performance_distribution` | histogram | one point per employee composite |
| `manager_index` | bar | each manager's composite (0 when missing) |
| `department_engagement` | bar | per department: mean `engagement_score` |
| `department_goal_achievement` | bar | per department: mean `goal_achievement_rate` |
| `department_learning` | bar | per department: mean `learning_completion_rate` |
| `department_meeting_efficiency` | bar | per department: mean `meeting_efficiency` |
| `employment_status` | donut | count per `Employment_Status` |
| `location_headcount` | bar | count per `Location` |
| `performance_vs_wellbeing` | scatter | one point per **employee**: mean `Overall_Rating` (y) vs mean `Wellbeing_Score` (x) |
| `attendance_by_department` | bar | `Meetings.Department` → mean `Attendance_Rate × 100` |
| `engagement_by_location` | bar | `HybridWork.Location` → mean `Engagement_Score` |
| `low_performance_by_department` | bar | share of each department's members with rating < 3.2 (and the raw count) |
| `meeting_cost_by_department` | bar | per department: sum `Meeting_Cost_Hours` + mean `Efficiency_Score` (sorted by cost) |
| `meeting_type_efficiency` | grouped bar | per `Meeting_Type`: mean `Efficiency_Score` and mean `Action_Completion_Rate × 100` (sorted ascending by efficiency) |
| `workspace_utilization` | grouped bar | per `Resources.Location`: mean desk / room / renewable-energy utilisation × 100 |
| `sustainability_weekly` | dual area | per `Week_Start`: sum `Estimated_CO2_Saved_KG` and sum `Commute_Distance_Saved_KM` |
| `tenure_distribution` | bar | employees bucketed by tenure vs a fixed reference date **2026-10-01**: < 2, 2–5, 5–8, 8+ years |
| `learning_not_started_by_department` | bar | per department: share of `Course_Status = not started` (sorted descending) |
| `one_on_one_by_manager` | bar | count of `Meeting_Type = one-on-one` organised by each manager (sorted descending) |

`performance_vs_wellbeing` contains a single series (no company-comparison
toggle), because each point already represents a distinct employee.

---

## 7. Insights and their thresholds

Insights carry `category`, `severity` (`warning` / `info` / `positive`) and are
sorted warning → info → positive.

### Structural

| Insight | Severity | Trigger |
|---------|----------|---------|
| Top performer company-wide | positive | always (highest composite) |
| Strongest department | positive | always (highest `composite_index`) |
| Weakest department | warning / info | warning if its index < company composite, else info |
| Department with most overdue goals | warning | that department's mean overdue goals > 0 |
| Top-rated manager | info | always (highest manager composite) |

### Data-driven

| Insight | Severity | Trigger |
|---------|----------|---------|
| Employees below a 3.2 rating | warning | count of `at_risk_ids` > 0 (names listed) |
| Least efficient meeting type | warning / info | warning if efficiency < 3, else info (lowest in `meeting_type_efficiency`) |
| Desk utilisation low | info | average desk utilisation < 65% |
| Department lags on learning | warning | top not-started department ≥ 25% |
| Hybrid cut commute emissions | positive | total CO2 saved > 0 |

---

## 8. Notes & assumptions

- **NaN safety:** rating and wellbeing are coerced with
  `pd.to_numeric(..., errors="coerce")` then dropped before grouping, because
  one employee's missing `Overall_Rating` would otherwise produce `NaN`, which
  Starlette's JSON encoder rejects (HTTP 500). Availability is checked with
  `len(series) > 0`, not `if series:` (a pandas Series is not truth-testable).
- **Tenure** uses a fixed reference date of `2026-10-01` so the buckets are
  reproducible.
- `clean()` trims whitespace and normalises obvious encoding artefacts in
  labels before they reach the UI.
- Division by headcount is guarded (`max(1, count)`), so a department with no
  members cannot cause a divide-by-zero.
- All rate columns stored as fractions (`0–1`) are multiplied by 100; scores
  (`Efficiency_Score`, `Engagement_Score`, `Overall_Rating`) remain on `1–5`.
- The composite index requires at least one non-null component; employees
  missing all components are excluded from indices and rankings.

---

## 9. Cross-dashboard consistency

| Concept | Where it is defined | Used by |
|---------|---------------------|---------|
| Composite index | `employee.composite_for` / `manager.composite_score` | Employee, Manager, HR |
| Per-employee series | `manager.build_series` | Manager, HR |
| Benchmark / standing | `employee.build_benchmark` | Employee, Manager, HR |
| Department KPI block | `hr.dept_kpi_block` over `manager.DEPT_KPIS` | HR |
| Team health KPIs | `manager.build_team_kpis` | Manager |

Because these primitives are shared, the same person shows the same composite
and the same department shows the same index on every dashboard.
