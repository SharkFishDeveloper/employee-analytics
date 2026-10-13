# Manager Dashboard — KPI & Insight Reference

This document explains exactly how every KPI, chart value and insight on the
**Manager dashboard** is calculated.

- Endpoint: `GET /manager/?manager_id=E001`
- Frontend URL: `http://localhost:3000/manager?employee_id=E001`
- Backend: `backend/routes/manager.py`
- Data: CSV files in `backend/data/`
- Frontend: `frontend/app/manager/page.jsx`

> Note: the **API** takes `manager_id`, while the **frontend route** reads the
> query parameter `employee_id`. Both refer to the manager's own ID.

---

## KPI quick reference (start here)

The Manager dashboard has **three** KPI collections. Full details in §3 (department),
§4 (team member cards) and §5 (team health).

### A. Department KPIs (`DEPT_KPIS`) — one block per managed department

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

### B. Team member card KPIs (`TEAM_KPIS`) — one value per team member

| KPI | Key |
|-----|-----|
| **Performance rating** | `performance_rating` |
| **Goal progress** | `goal_progress` |
| **Engagement** | `engagement_score` |
| **Wellbeing** | `wellbeing_score` |
| **Learning completion** | `learning_completion_rate` |
| **Overdue goals** | `goals_overdue` |

Each card also shows the member's **composite index** and benchmark **standing**.

### C. Team health KPIs (`team_kpis`) — headline strip

| KPI | Key | Formula |
|-----|-----|---------|
| **Goals on track** | `goals_on_track` | `% = count(status ∈ {completed, in progress}) / total × 100` |
| **Overdue goals** | `goals_overdue` | count `Goal_Status` = `overdue` |
| **High-prio overdue** | `high_priority_overdue` | count priority `high` **and** status `overdue` |
| **At-risk members** | `at_risk` | count members with rating < 3.2 |
| **Meeting cost-hours** | `meeting_cost_hours` | sum `Meeting_Cost_Hours` |
| **Meeting attendance** | `meeting_attendance` | mean `Attendance_Rate × 100` |
| **Learning not started** | `learning_not_started` | count courses status `not started` |
| **Hybrid / remote weeks** | `hybrid_share` | `% Work_Mode ∈ {hybrid, remote} × 100` |

---

## 1. Who belongs to a manager

A manager's scope has two parts:

1. **Managed departments** — from `ManagerDepartments.csv`, all rows for the
   manager with an open assignment (`End_Date` empty/NaN). A manager may be
   *Primary* and/or *Secondary* for multiple departments.
2. **Team** — every employee whose `Department_ID` is one of the managed
   departments, **plus** every employee whose `Manager_ID` is the manager
   (direct reports). The manager themselves is excluded from the team.

The manager's KPIs compare the team against the **whole company**
(`company_composite` = mean composite of all employees).

---

## 2. Per-employee series (`build_series`)

`build_series()` returns one dictionary `metric_key -> {employee_id: value}`
for the whole company. It is the shared source of truth for Manager and HR.

| Key | Source | Aggregation |
|-----|--------|-------------|
| `performance_rating` | `Performance.Overall_Rating` | mean |
| `goal_achievement_rate` | `Performance.Goal_Achievement_Rate` | mean |
| `goal_progress` | `Goals.Progress_Percentage` | mean |
| `goals_overdue` | `Goals.Goal_Status` | count of `overdue` |
| `engagement_score` | `HybridWork.Engagement_Score` | mean |
| `wellbeing_score` | `HybridWork.Wellbeing_Score` | mean |
| `hours_worked` | `HybridWork.Hours_Worked` | sum |
| `co2_saved` | `HybridWork.Estimated_CO2_Saved_KG` | sum |
| `learning_completion_rate` | `Learning.Completion_Rate` | mean × 100 |
| `assessment_score` | `Learning.Assessment_Score` | mean |
| `meeting_efficiency` | `Meetings.Efficiency_Score` | mean (organiser) |
| `action_completion_rate` | `Meetings.Completed_Action_Items / Action_Items` | ratio × 100 |

> Meeting metrics are attributed to the **organiser** (`Organizer_ID`), not the
> attendees.

### Composite index (0–100)

Identical to the Employee dashboard (see `README_EMPLOYEE.md §4`).
Implemented in `manager.composite_score` / `employee.composite_for`.

```
composite = mean of clamp(value_i × weight_i, 0, 100)
components: performance_rating×20, engagement×20, wellbeing×20,
            meeting_efficiency×20, goal_progress×1,
            learning_completion_rate×1, goal_achievement_rate×1
```

`dept_value(series, key, members)` = rounded mean of `key` across the given
member IDs — used for every department-level KPI.

---

## 3. Department KPI blocks (`DEPT_KPIS`)

For each managed department, the following KPIs are computed by averaging the
per-employee series over the department's members. `H↑` = higher is better,
`L↓` = lower is better. Each block also carries `company_avg`, `delta`
(`value − company_avg`) and a `better` flag.

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

The **department composite index** = mean of member composites.

---

## 4. Team member cards (`TEAM_KPIS`)

Each row of the team table shows (from the per-employee series):

`performance_rating`, `goal_progress`, `engagement_score`,
`wellbeing_score`, `learning_completion_rate`, `goals_overdue`

plus the composite index and a benchmark **standing** computed among all
employees (`build_benchmark`; see `README_EMPLOYEE.md §3`).

---

## 5. Team health KPIs (`build_team_kpis`)

A compact headline strip returned as `team_kpis` — a list of
`{ key, label, value, unit, note }`.

| key | Formula |
|-----|---------|
| `goals_on_track` | `% = count(status ∈ {completed, in progress}) / total team goals × 100` (note: "X of Y team goals") |
| `goals_overdue` | total count of team goals with status `overdue` (note: how many are High priority) |
| `high_priority_overdue` | count of team goals, priority `high` **and** status `overdue` |
| `at_risk` | count of distinct team members with performance rating < 3.2 (note lists up to 4 names) |
| `meeting_cost_hours` | sum of `Meeting_Cost_Hours` for meetings organised by the team (note: number of meetings) |
| `meeting_attendance` | mean of per-meeting `Attendance_Rate × 100` (not a pooled ratio) |
| `learning_not_started` | **count** of team courses with status `not started` (note: "of N assigned courses") |
| `hybrid_share` | `% = share of team records with Work_Mode ∈ {hybrid, remote} × 100` |

---

## 6. Chart datasets (`build_charts`)

All charts are scoped to the managed departments / team unless noted "ALL".

| Chart key | Type | How it is built |
|-----------|------|-----------------|
| `all_department_index` | bar | **ALL** departments: mean composite of each department's members, with `is_mine` flag and `company_avg` |
| `engagement_wellbeing` | grouped bar | per managed department: mean engagement & wellbeing vs company averages |
| `weekly_engagement_by_department` | multi-line | per `Week_Start`: mean engagement per managed department + `Company` line |
| `team_work_mode_mix` | donut | count of team records per `Work_Mode` |
| `performance_by_dimension` | grouped bar | per dimension (Quality/Delivery/Teamwork/Communication/Overall): each department mean, "Your departments" and "Company" |
| `objectives_vs_achieved` | bar | team goals grouped by due month: total and achieved |
| `goal_status` | donut | count of team goals per `Goal_Status` |
| `overdue_goals_by_department` | bar | count of `overdue` goals per department |
| `learning_by_department` | bar | per managed department: mean `Completion_Rate × 100` |
| `meeting_efficiency_by_department` | bar | per managed department: mean `Efficiency_Score` |
| `team_performance_distribution` | histogram | every team member's composite (one point each) |
| `goal_health_by_department` | stacked bar | per department: counts of completed / in progress / overdue / not started |
| `objectives_pacing` | bar | per due month: completed, total, completion rate |
| `meeting_load_by_member` | horizontal bar | per organiser: meeting count, cost hours, over-60-minute share (top 12 by cost) |
| `office_vs_remote_weekly` | dual area | per week: average office days and remote days **per person** |
| `learning_not_started_by_department` | bar | per department: share of courses with status `not started` |
| `engagement_trend_low` | multi-line | per week: engagement for the 3 lowest-composite team members + `Company` |

`performance_by_dimension` uses each department's full membership (not just the
manager's team) so departments are comparable.

---

## 7. Insights and their thresholds

Insights are emitted with `category`, `severity` (`warning` / `info` /
`positive` / `info`) and a note.

### Leadership / structural

| Insight | Severity | Trigger |
|---------|----------|---------|
| Strongest department | positive | highest department composite among managed |
| Weakest department | warning | lowest department composite among managed |
| Weak KPIs | info | departments whose KPI value < 85% of company average |
| Top performer | positive | highest-composite member of the team |
| Members with overdue goals | warning | members with `goals_overdue ≥ 2` |
| Your standing | info | manager's composite percentile among managers |

### Data-driven (new)

| Insight | Severity | Trigger |
|---------|----------|---------|
| At-risk members | warning | members with performance rating < 3.2 (names listed) |
| High-priority overdue goals | warning | count > 0 of High/Critical overdue goals |
| Goals not started | info | count ≥ 5 team goals with status `not started` |
| Long meetings share | warning | over-60-minute share ≥ 20% |
| Team meeting load | info | total meeting cost hours / heavy organisers |
| Learning not started | warning | share of not-started courses ≥ 25% |
| Wellbeing declining | warning | members whose mean wellbeing dropped ≥ 0.6 between the early and late half of their weekly records (top 4 shown) |

---

## 8. Notes & assumptions

- The **department index** on charts always covers **all** company departments
  with the manager's own departments highlighted, so the manager sees relative
  position at a glance.
- Team KPIs use the union of managed-department members and direct reports;
  double counting is impossible because it is a set.
- `goals_on_track`, `at_risk` and similar share-based KPIs are rounded to whole
  percentages; counts are integers.
- Employer-level benchmarks (company/department averages, standings) use the
  shared `build_benchmark` helper documented in `README_EMPLOYEE.md §3`.
