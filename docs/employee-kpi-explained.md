# Employee Dashboard — KPI Reference

This document explains **every KPI** shown on the employee dashboard (`/employee`), what it
means, where the number comes from, and exactly how it is calculated.

Source of truth: `backend/routes/employee.py` (endpoint `GET /employee/?employee_id=<id>`).
All formulas below match the code; examples use a real employee, **E001 – Idris Moreau
(Engineering)**.

> There is no SQL database. Metrics are read with pandas straight from the CSV files in
> `backend/data`. Treat each file as a "table". Referencing is done by joining on an id column.

---

## 1. Source tables

| Table (file) | One row per… | Join key | Columns used by the dashboard |
|---|---|---|---|
| `Employees.csv` | employee | `Employee_ID` | `Employee_ID`, `Employee_Name`, `Department`, `Job_Role`, `Location`, `Manager_ID`, … |
| `HybridWork.csv` | employee × week | `Employee_ID` | `Hours_Worked`, `Focus_Hours`, `Collaboration_Hours`, `Engagement_Score`, `Wellbeing_Score`, `Office_Days`, `Remote_Days`, `Commute_Distance_Saved_KM`, `Estimated_CO2_Saved_KG`, `Work_Mode`, `Week_Start` |
| `Meetings.csv` | meeting | `Organizer_ID` | `Duration_Minutes`, `Invited_Count`, `Attended_Count`, `Action_Items`, `Completed_Action_Items`, `Efficiency_Score`, `Over_60_Min_Flag`, `Meeting_Cost_Hours` |
| `Learning.csv` | course enrolment | `Employee_ID` | `Completion_Rate`, `Completed_Hours`, `Assigned_Hours`, `Assessment_Score`, `Certification_Earned`, `Learning_Points`, `Course_Status`, `Skill_Category` |
| `Performance.csv` | performance review | `Employee_ID` | `Overall_Rating`, `Goal_Achievement_Rate`, `Quality_Score`, `Delivery_Score`, `Teamwork_Score`, `Communication_Score` |
| `Goals.csv` | goal | `Employee_ID` | `Progress_Percentage`, `Goal_Status`, `Priority`, `Goal_Category`, `Due_Date` |

**Row filters used for a person's KPIs**

- Only one filter is ever applied: *scope the table to this employee* — by `Employee_ID`, or by
  `Organizer_ID` for meetings.
- **No** date window, **no** `Active_Status` / `Employment_Status` filter, **no** “completed-only”
  filter. Every row for the employee counts.
- Zero and negative values are included as-is. (Example: one of E001's weekly rows has
  `Remote_Days = -1`, so his remote-days total is `0 + 1 + 1 − 1 = 1`.)
- Meetings are attributed to the **organizer only**; attendees get no credit.

**Boolean flags** (`Over_60_Min_Flag`, `Certification_Earned`)
Values are lower-cased, trimmed, and tested against
`{"true","yes","1","y","t"}`. So `"True"` and `"Yes"` count as true; `"False"` / `"No"` do not.

---

## 2. Calculation primitives

Each KPI is built with one of these helpers:

| Helper | What it computes | Formula |
|---|---|---|
| **mean** | average across the employee's rows | `Σ values ÷ row count`, rounded to 2 dp |
| **sum** | total across the employee's rows | `Σ values`, rounded to 2 dp |
| **ratio** | a pooled percentage (never averages percentages) | `Σ numerator ÷ Σ denominator × 100`, rounded to 2 dp |
| **true-rate** | share of rows whose flag is true | `# true rows ÷ total rows × 100` |
| **true-count** | number of rows whose flag is true | `# true rows` |
| **count-where** | rows whose status matches a value | `# rows where status = value` (case-insensitive) |

---

## 3. The benchmark block (shown on every KPI)

Every KPI also carries a `benchmark` object that powers the “You / Company avg / Dept avg /
Rank / Standing” columns and the card deltas.

| Field | Meaning | Formula |
|---|---|---|
| `employee_value` | your KPI value | — |
| `company_avg` | average across **all 50 employees** | each employee is aggregated first, then averaged (so employees with more weekly rows don't skew it) |
| `department_avg` | average of employees in your department | same, restricted to matching `Department` |
| `delta` | your gap vs company | `employee_value − company_avg` |
| `delta_pct` | relative gap | `delta ÷ company_avg × 100` |
| `rank` | your position (1 = best) | `1 + #employees strictly better` |
| `percentile` | goodness percentile | higher-is-better: `#employees ≤ you ÷ peers × 100`; lower-is-better: `#employees ≥ you ÷ peers × 100` |
| `peers` | number of employees in the comparison | usually 50 |
| `standing` | label from the percentile | see thresholds below |

**Standing thresholds** (based on the goodness percentile, so a higher value is always better):

| Percentile | Label |
|---|---|
| ≥ 90 | Top 10% |
| ≥ 75 | Top 25% |
| ≥ 50 | Above average |
| ≥ 25 | Below average |
| < 25 | Bottom 25% |

**Direction:** KPIs marked *higher is better* rank large values as good; KPIs marked *lower is
better* (e.g. meeting hours, collaboration, long meetings) flip the comparison before ranking.
The catalog's `higher_is_better` flag drives this.

---

## 4. KPI catalogue

Eight KPIs are flagged *primary* and rendered as the big KPI cards at the top
(`hours_worked`, `engagement_score`, `meeting_hours`, `meeting_attendance_rate`,
`meeting_efficiency`, `learning_completion_rate`, `performance_rating`, `goal_progress`); the
rest appear in the **Full benchmark table**. `co2_saved` is hidden from the UI entirely
(`HIDDEN_KPIS`).

### Productivity

| KPI (unit, direction) | Meaning | Data source (rows) | Calculation + example |
|---|---|---|---|
| **Hours worked / week** — `hours_worked` (h/week, higher better, **primary**) | Typical hours logged per week. | `HybridWork.Hours_Worked` — E001's 4 weekly rows | **mean**. `(41.3 + 37.6 + 37.4 + 27.4) ÷ 4 = 35.92 h/week` |
| **Average focus** — `avg_focus_hours` (h/record, higher better) | Typical deep-work hours per logged week. | `HybridWork.Focus_Hours` | **mean**. `(21.2 + 15.3 + 16.6 + 15.3) ÷ 4 = 17.1 h` |
| **Average collaboration** — `avg_collaboration_hours` (h/record, **lower better**) | Typical meeting/coordination hours per logged week. | `HybridWork.Collaboration_Hours` | **mean**. `(16.4 + 13.7 + 11.5 + 12.1) ÷ 4 = 13.42 h` |

### Wellbeing

| KPI (unit, direction) | Meaning | Data source (rows) | Calculation + example |
|---|---|---|---|
| **Engagement** — `engagement_score` (score 1–5, higher better, **primary**) | Average weekly engagement pulse. | `HybridWork.Engagement_Score` | **mean**. `(3.3 + 3.2 + 3.3 + 3.0) ÷ 4 = 3.2` |
| **Wellbeing** — `wellbeing_score` (score 1–5, higher better) | Average weekly wellbeing pulse. | `HybridWork.Wellbeing_Score` | **mean**. `(4.6 + 4.5 + 4.4 + 4.3) ÷ 4 = 4.45` |

### Work location

| KPI (unit, direction) | Meaning | Data source (rows) | Calculation + example |
|---|---|---|---|
| **Office days** — `office_days` (days, higher better) | Total office days over the whole period. | `HybridWork.Office_Days` | **sum** (across the period, *not* an average). `5 + 4 + 4 + 5 = 18 days` |
| **Remote days** — `remote_days` (days, higher better) | Total remote days over the whole period. | `HybridWork.Remote_Days` | **sum**. `0 + 1 + 1 − 1 = 1 day` |

### Sustainability

| KPI (unit, direction) | Meaning | Data source (rows) | Calculation + example |
|---|---|---|---|
| **Commute distance saved** — `commute_distance_saved` (km, higher better) | Kilometres of commuting avoided by working from home. | `HybridWork.Commute_Distance_Saved_KM` | **sum**. `0 + 71.8 + 71.8 − 71.8 = 71.8 km` |
| **CO₂ saved** — `co2_saved` (kg, higher better) | Estimated CO₂ avoided by the hybrid schedule. | `HybridWork.Estimated_CO2_Saved_KG` | **sum**. `0 + 12.6 + 11.8 − 12.7 = 11.7 kg` |

> `co2_saved` is computed by the API but **hidden on the dashboard** (`HIDDEN_KPIS`), together
> with any CO₂-related insight text.

### Meetings

| KPI (unit, direction) | Meaning | Data source (rows) | Calculation + example |
|---|---|---|---|
| **Meeting hours** — `meeting_hours` (h, **lower better**, **primary**) | Total hours spent in meetings you organised. | `Meetings.Duration_Minutes` | **sum**, then convert minutes to hours. `(30+15+45+30+120) ÷ 60 = 4.0 h` |
| **Meeting attendance** — `meeting_attendance_rate` (%, higher better, **primary**) | Share of invited people who actually attended your meetings. | `Meetings.Attended_Count`, `Meetings.Invited_Count` | **ratio** = `Σ attended ÷ Σ invited × 100`. `(4+4+2+2+14) ÷ (8+5+3+2+14) × 100 = 81.25%` |
| **Action completion** — `action_completion_rate` (%, higher better) | Share of action items that were completed. | `Meetings.Completed_Action_Items`, `Meetings.Action_Items` | **ratio** = `Σ completed ÷ Σ actions × 100`. `(0+1+2+2+3) ÷ (0+3+4+5+4) × 100 = 50%` |
| **Meeting efficiency** — `meeting_efficiency` (score 1–5, higher better, **primary**) | Average efficiency score across meetings. | `Meetings.Efficiency_Score` | **mean**. `(3.0+3.6+2.9+3.6+2.4) ÷ 5 = 3.1` |
| **Long meetings share** — `long_meeting_share` (%, **lower better**) | Share of your meetings running over 60 minutes. | `Meetings.Over_60_Min_Flag` | **true-rate** = `# flagged ÷ total × 100`. `1 ÷ 5 × 100 = 20%` |
| **Meeting cost** — `meeting_cost_hours` (h, **lower better**) | Total attendee-hours consumed by your meetings. | `Meetings.Meeting_Cost_Hours` | **sum**. `2 + 1 + 1.5 + 1 + 28 = 33.5 h` |

### Learning

| KPI (unit, direction) | Meaning | Data source (rows) | Calculation + example |
|---|---|---|---|
| **Learning completion** — `learning_completion_rate` (%, higher better, **primary**) | Average completion of assigned courses. | `Learning.Completion_Rate` (0–1) | **mean**, ×100. `(0.62 + 1.0 + 1.0 + 0.0) ÷ 4 × 100 = 65.5%` |
| **Learning hours** — `learning_hours_completed` (h, higher better) | Total course hours completed. | `Learning.Completed_Hours` | **sum**. `5 + 8 + 6 + 0 = 19 h` |
| **Assessment score** — `assessment_score` (score 0–100, higher better) | Average assessment mark across enrolled courses. | `Learning.Assessment_Score` | **mean** (0 scores for not-started courses are included). `(62 + 90 + 76 + 0) ÷ 4 = 57.0` |
| **Certifications** — `certifications_earned` (certs, higher better) | Number of courses that earned a certification. | `Learning.Certification_Earned` | **true-count** over `{"yes", …}`. E001 has none → `0` |
| **Learning points** — `learning_points` (pts, higher better) | Total learning points earned. | `Learning.Learning_Points` | **sum**. `40 + 80 + 60 + 0 = 180 pts` |

### Performance

| KPI (unit, direction) | Meaning | Data source (rows) | Calculation + example |
|---|---|---|---|
| **Performance rating** — `performance_rating` (rating 1–5, higher better, **primary**) | Average overall rating from performance reviews. | `Performance.Overall_Rating` | **mean** (one review per employee in this dataset). E001 → `4.2` |
| **Goal achievement** — `goal_achievement_rate` (%, higher better) | Average goal-achievement rate recorded in the review. | `Performance.Goal_Achievement_Rate` | **mean**. E001 → `80.2%` |

> Note: the review for **E047** is a *Draft* with a blank `Overall_Rating`; blank rows are
> dropped, so `performance_rating` benchmarks compare against **49** peers instead of 50.

### Goals

| KPI (unit, direction) | Meaning | Data source (rows) | Calculation + example |
|---|---|---|---|
| **Goal progress** — `goal_progress` (%, higher better, **primary**) | Average progress across all goals. | `Goals.Progress_Percentage` | **mean** over every goal (including not-started ones). `(58.0 + 54.3 + 70.0) ÷ 3 = 60.77%` |
| **Goals completed** — `goals_completed_rate` (%, higher better) | Share of goals marked completed. | `Goals.Goal_Status` | `#completed ÷ #goals × 100`. E001 has 0 of 3 completed → `0%` |
| **Overdue goals** — `goals_overdue` (goals, **lower better**) | Number of goals past due. | `Goals.Goal_Status` | **count-where** status = `"overdue"` (case-insensitive). E001 → `0` |

Valid `Goal_Status` values in the data: `Completed`, `In Progress`, `Not Started`, `Overdue`.
Valid `Priority`: `High`, `Medium`, `Low`. Valid `Course_Status`: `Completed`, `In Progress`,
`Not Started`.

---

## 5. Headline score (composite index)

The big score at the top of the dashboard is **not** a single column — it is a composite 0–100
index built from seven KPIs. Each is scaled to 0–100, clamped, then averaged:

| Component KPI | Multiplier | Why |
|---|---|---|
| `performance_rating` | × 20 | 1–5 rating → 0–100 |
| `engagement_score` | × 20 | 1–5 → 0–100 |
| `wellbeing_score` | × 20 | 1–5 → 0–100 |
| `meeting_efficiency` | × 20 | 1–5 → 0–100 |
| `goal_progress` | × 1 | already 0–100 |
| `learning_completion_rate` | × 1 | already 0–100 |
| `goal_achievement_rate` | × 1 | already 0–100 |

Formula: for each component, `part = min(100, max(0, value × multiplier))`; then
`score = round(Σ parts ÷ number of available parts, 1)`.

- Components with no data are skipped (the divisor shrinks).
- The composite is then benchmarked like any KPI (company avg, department avg, rank, standing).
- **Example – E001:** parts `[84.0, 64.0, 89.0, 62.0, 60.77, 65.5, 80.2]` →
  `505.47 ÷ 7 = 72.2`. Company average is `72.1`; E001 ranks **24 of 50**.

The headline also drives the full rankings list and the in-department rank
(`department_rank` / `department_peers`).

---

## 6. Quick-reference table

| # | KPI key | Label | Unit | Group | Primary | Higher better | Calculation |
|---|---|---|---|---|---|---|---|
| 1 | `hours_worked` | Hours worked / week | h/week | Productivity | ✅ | ✅ | mean(HybridWork.Hours_Worked) |
| 2 | `avg_focus_hours` | Average focus | h/record | Productivity | | ✅ | mean(HybridWork.Focus_Hours) |
| 3 | `avg_collaboration_hours` | Average collaboration | h/record | Productivity | | ❌ | mean(HybridWork.Collaboration_Hours) |
| 4 | `engagement_score` | Engagement | score | Wellbeing | ✅ | ✅ | mean(HybridWork.Engagement_Score) |
| 5 | `wellbeing_score` | Wellbeing | score | Wellbeing | | ✅ | mean(HybridWork.Wellbeing_Score) |
| 6 | `office_days` | Office days | days | Work location | | ✅ | sum(HybridWork.Office_Days) |
| 7 | `remote_days` | Remote days | days | Work location | | ✅ | sum(HybridWork.Remote_Days) |
| 8 | `commute_distance_saved` | Commute distance saved | km | Sustainability | | ✅ | sum(HybridWork.Commute_Distance_Saved_KM) |
| 9 | `co2_saved` | CO2 saved *(hidden)* | kg | Sustainability | | ✅ | sum(HybridWork.Estimated_CO2_Saved_KG) |
| 10 | `meeting_hours` | Meeting hours | h | Meetings | ✅ | ❌ | sum(Meetings.Duration_Minutes) ÷ 60 |
| 11 | `meeting_attendance_rate` | Meeting attendance | % | Meetings | ✅ | ✅ | ΣAttended ÷ ΣInvited × 100 |
| 12 | `action_completion_rate` | Action completion | % | Meetings | | ✅ | ΣCompleted_Action_Items ÷ ΣAction_Items × 100 |
| 13 | `meeting_efficiency` | Meeting efficiency | score | Meetings | ✅ | ✅ | mean(Meetings.Efficiency_Score) |
| 14 | `long_meeting_share` | Long meetings share | % | Meetings | | ❌ | share of Meetings.Over_60_Min_Flag = true × 100 |
| 15 | `meeting_cost_hours` | Meeting cost | h | Meetings | | ❌ | sum(Meetings.Meeting_Cost_Hours) |
| 16 | `learning_completion_rate` | Learning completion | % | Learning | ✅ | ✅ | mean(Learning.Completion_Rate) × 100 |
| 17 | `learning_hours_completed` | Learning hours | h | Learning | | ✅ | sum(Learning.Completed_Hours) |
| 18 | `assessment_score` | Assessment score | score | Learning | | ✅ | mean(Learning.Assessment_Score) |
| 19 | `certifications_earned` | Certifications | certs | Learning | | ✅ | count(Learning.Certification_Earned = yes) |
| 20 | `learning_points` | Learning points | pts | Learning | | ✅ | sum(Learning.Learning_Points) |
| 21 | `performance_rating` | Performance rating | rating | Performance | ✅ | ✅ | mean(Performance.Overall_Rating) |
| 22 | `goal_achievement_rate` | Goal achievement | % | Performance | | ✅ | mean(Performance.Goal_Achievement_Rate) |
| 23 | `goal_progress` | Goal progress | % | Goals | ✅ | ✅ | mean(Goals.Progress_Percentage) |
| 24 | `goals_completed_rate` | Goals completed | % | Goals | | ✅ | count(Goals.Goal_Status = completed) ÷ total × 100 |
| 25 | `goals_overdue` | Overdue goals | goals | Goals | | ❌ | count(Goals.Goal_Status = overdue) |

All KPIs are also used to generate the on-page **insights** and **recommendations**; those are
derived text, not separate KPI values.
