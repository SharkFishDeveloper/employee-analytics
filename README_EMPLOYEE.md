# Employee Dashboard — KPI & Insight Reference

This document explains exactly how every KPI, chart value and insight on the
**Employee dashboard** is calculated.

- Endpoint: `GET /employee/?employee_id=E010`
- Backend: `backend/routes/employee.py`
- Data: CSV files in `backend/data/`
- Frontend: `frontend/app/employee/page.jsx`

---

## KPI quick reference (start here)

All 25 employee KPIs. `H↑` = higher is better, `L↓` = lower is better.
Full benchmark details in §3, full table in §5.

| KPI | Key | Formula | Dir |
|-----|-----|---------|-----|
| **Hours worked** | `hours_worked` | sum `Hours_Worked` | H↑ |
| **Average focus** | `avg_focus_hours` | mean `Focus_Hours` | H↑ |
| **Average collaboration** | `avg_collaboration_hours` | mean `Collaboration_Hours` | L↓ |
| **Engagement** | `engagement_score` | mean `Engagement_Score` | H↑ |
| **Wellbeing** | `wellbeing_score` | mean `Wellbeing_Score` | H↑ |
| **Office days** | `office_days` | sum `Office_Days` | — |
| **Remote days** | `remote_days` | sum `Remote_Days` | — |
| **Commute distance saved** | `commute_distance_saved` | sum `Commute_Distance_Saved_KM` | H↑ |
| **CO2 saved** | `co2_saved` | sum `Estimated_CO2_Saved_KG` | H↑ |
| **Meeting hours** | `meeting_hours` | `sum(Duration_Minutes) / 60` | L↓ |
| **Meeting attendance** | `meeting_attendance_rate` | `sum(Attended) / sum(Invited) × 100` | H↑ |
| **Action completion** | `action_completion_rate` | `sum(Completed_Action_Items) / sum(Action_Items) × 100` | H↑ |
| **Meeting efficiency** | `meeting_efficiency` | mean `Efficiency_Score` | H↑ |
| **Long meetings share** | `long_meeting_share` | share `Over_60_Min_Flag` = true × 100 | L↓ |
| **Meeting cost** | `meeting_cost_hours` | sum `Meeting_Cost_Hours` | L↓ |
| **Learning completion** | `learning_completion_rate` | mean `Completion_Rate` × 100 | H↑ |
| **Learning hours** | `learning_hours_completed` | sum `Completed_Hours` | H↑ |
| **Assessment score** | `assessment_score` | mean `Assessment_Score` | H↑ |
| **Certifications** | `certifications_earned` | count `Certification_Earned` = true | H↑ |
| **Learning points** | `learning_points` | sum `Learning_Points` | H↑ |
| **Performance rating** | `performance_rating` | mean `Overall_Rating` | H↑ |
| **Goal achievement** | `goal_achievement_rate` | mean `Goal_Achievement_Rate` | H↑ |
| **Goal progress** | `goal_progress` | mean `Progress_Percentage` | H↑ |
| **Goals completed** | `goals_completed_rate` | `completed / total goals × 100` | H↑ |
| **Overdue goals** | `goals_overdue` | count `Goal_Status` = "overdue" | L↓ |

> The headline **composite index (0–100)** blends seven of these — see §4.

---

## 1. Data sources

| File | Grain | Key columns used |
|------|-------|------------------|
| `Employees.csv` | 1 row per employee | `Employee_ID`, `Department`, `Manager_ID`, `Location`, `Join_Date` |
| `HybridWork.csv` | 1 row per employee-week | `Week_Start`, `Hours_Worked`, `Focus_Hours`, `Collaboration_Hours`, `Office_Days`, `Remote_Days`, `Engagement_Score`, `Wellbeing_Score`, `Work_Mode`, `Commute_Distance_Saved_KM`, `Estimated_CO2_Saved_KG` |
| `Meetings.csv` | 1 row per meeting | `Organizer_ID`, `Duration_Minutes`, `Invited_Count`, `Attended_Count`, `Action_Items`, `Completed_Action_Items`, `Efficiency_Score`, `Over_60_Min_Flag`, `Meeting_Cost_Hours`, `Meeting_Type` |
| `Learning.csv` | 1 row per course | `Completion_Rate`, `Completed_Hours`, `Assessment_Score`, `Certification_Earned`, `Learning_Points`, `Skill_Category`, `Course_Status` |
| `Performance.csv` | 1 review per employee | `Overall_Rating`, `Goal_Achievement_Rate`, `Quality_Score`, `Delivery_Score`, `Teamwork_Score`, `Communication_Score` |
| `Goals.csv` | 1 row per goal | `Goal_Category`, `Priority`, `Progress_Percentage`, `Goal_Status`, `Due_Date` |
| `Resources.csv` | 1 row per location-day | `Desk_Utilization`, `Room_Utilization`, `Renewable_Energy_Rate` … |
| `Departments.csv` | 1 row per department | `Department_Name`, `Department_Head_ID` |

**ID normalisation:** every ID column is cast to `string` and stripped of
whitespace before matching, so `"E010"` and `"E010 "` are the same person.

---

## 2. Calculation primitives

These generic helpers (in `backend/routes/employee.py`) build the per-employee
series that every benchmark compares against.

| Helper | Returns | Formula |
|--------|---------|---------|
| `employee_agg(df, id_col, value_col, how, scale)` | `{employee_id: value}` | `groupby(id_col)[value_col].agg(how) * scale`, NaN rows dropped |
| `employee_ratio(df, id_col, num_col, den_col, scale)` | `{employee_id: value}` | `sum(num_col) / sum(den_col) * scale` (default scale 100) |
| `employee_true_rate(df, id_col, flag_col, scale)` | `{employee_id: value}` | share of rows whose flag is truthy (`true/yes/1/y/t`) `* scale` |
| `employee_true_count(df, id_col, flag_col)` | `{employee_id: count}` | number of truthy flag rows |
| `employee_count_where(df, id_col, match_col, values)` | `{employee_id: count}` | rows whose `match_col` is in `values` |
| `mean_of(values)` | rounded mean or `None` | mean of all non-null values, rounded to 2 dp |

Each of these produces a value **for every employee**, not just the one being
viewed. That is what makes company/department benchmarking possible.

---

## 3. Benchmarking (`build_benchmark`)

Every KPI is compared against the rest of the company:

- **company_avg** — mean of the metric across all employees who have a value.
- **department_avg** — mean across the viewer's department only.
- **delta** = `my value − company_avg`
- **delta_pct** = `(my value − company_avg) / company_avg × 100`
- **rank** = `1 + (number of employees strictly better than me)`
  ("better" = higher when `higher_is_better`, otherwise lower)
- **percentile** = `share of employees at or below me × 100`
- **percentile_rank** = `(peers − rank + 1) / peers × 100`
- **standing** label from percentile:

| Percentile (higher-is-better) | Label |
|-------------------------------|-------|
| ≥ 90 | Top 10% |
| ≥ 75 | Top 25% |
| ≥ 50 | Above average |
| ≥ 25 | Below average |
| < 25 | Bottom 25% |

For "lower is better" KPIs the percentile is inverted before labelling.

---

## 4. Composite index (0–100)

The headline "score" is a weighted blend. Each component is normalised to a
0–100 scale by multiplying by a weight, then clamped to `[0, 100]`. The
composite is the **average of the components that exist** for that employee:

| Component | Source | Weight |
|-----------|--------|--------|
| Performance rating | `Performance.Overall_Rating` (mean) | × 20 |
| Engagement | `HybridWork.Engagement_Score` (mean) | × 20 |
| Wellbeing | `HybridWork.Wellbeing_Score` (mean) | × 20 |
| Meeting efficiency | `Meetings.Efficiency_Score` (mean) | × 20 |
| Goal progress | `Goals.Progress_Percentage` (mean) | × 1 |
| Learning completion | `Learning.Completion_Rate` (mean) | × 1 |
| Goal achievement | `Performance.Goal_Achievement_Rate` (mean) | × 1 |

```
composite = round( mean( clamp(component_i × weight_i, 0, 100) ), 1 )
```

The same formula is reused by the **Manager** and **HR** dashboards, so an
employee's index is identical on all three views. The index drives:

- the headline ring / standing,
- the company ranking list and the department ranking list,
- the "Where you stand" panel.

---

## 5. KPI catalog

`primary = true` means the KPI is shown as a prominent card. `H↑` = higher is
better, `L↓` = lower is better.

| KPI key | Label | Unit | Group | Direction | Calculation |
|---------|-------|------|-------|-----------|-------------|
| `hours_worked` | Hours worked | h | Productivity | H↑ | sum of `Hours_Worked` |
| `avg_focus_hours` | Average focus | h/record | Productivity | H↑ | mean of `Focus_Hours` |
| `avg_collaboration_hours` | Average collaboration | h/record | Productivity | L↓ | mean of `Collaboration_Hours` |
| `engagement_score` | Engagement | score | Wellbeing | H↑ | mean of `Engagement_Score` |
| `wellbeing_score` | Wellbeing | score | Wellbeing | H↑ | mean of `Wellbeing_Score` |
| `office_days` | Office days | days | Work location | — | sum of `Office_Days` |
| `remote_days` | Remote days | days | Work location | — | sum of `Remote_Days` |
| `commute_distance_saved` | Commute distance saved | km | Sustainability | H↑ | sum of `Commute_Distance_Saved_KM` |
| `co2_saved` | CO2 saved | kg | Sustainability | H↑ | sum of `Estimated_CO2_Saved_KG` |
| `meeting_hours` | Meeting hours | h | Meetings | L↓ | `sum(Duration_Minutes) / 60` |
| `meeting_attendance_rate` | Meeting attendance | % | Meetings | H↑ | `sum(Attended_Count) / sum(Invited_Count) × 100` |
| `action_completion_rate` | Action completion | % | Meetings | H↑ | `sum(Completed_Action_Items) / sum(Action_Items) × 100` |
| `meeting_efficiency` | Meeting efficiency | score | Meetings | H↑ | mean of `Efficiency_Score` |
| `long_meeting_share` | Long meetings share | % | Meetings | L↓ | share of `Over_60_Min_Flag` = true × 100 |
| `meeting_cost_hours` | Meeting cost | h | Meetings | L↓ | sum of `Meeting_Cost_Hours` |
| `learning_completion_rate` | Learning completion | % | Learning | H↑ | mean of `Completion_Rate` × 100 |
| `learning_hours_completed` | Learning hours | h | Learning | H↑ | sum of `Completed_Hours` |
| `assessment_score` | Assessment score | score | Learning | H↑ | mean of `Assessment_Score` |
| `certifications_earned` | Certifications | certs | Learning | H↑ | count of `Certification_Earned` = true |
| `learning_points` | Learning points | pts | Learning | H↑ | sum of `Learning_Points` |
| `performance_rating` | Performance rating | rating | Performance | H↑ | mean of `Overall_Rating` |
| `goal_achievement_rate` | Goal achievement | % | Performance | H↑ | mean of `Goal_Achievement_Rate` |
| `goal_progress` | Goal progress | % | Goals | H↑ | mean of `Progress_Percentage` |
| `goals_completed_rate` | Goals completed | % | Goals | H↑ | `completed goals / total goals × 100` |
| `goals_overdue` | Overdue goals | goals | Goals | L↓ | count of `Goal_Status` = "overdue" |

---

## 6. Chart datasets

All comparative charts return a **company average** alongside the employee's
value so the frontend can draw the comparison toggle.

| Chart key | Type | How it is built |
|-----------|------|-----------------|
| `weekly_work_hours` | area/line | per `Week_Start`: sum of `Hours_Worked` (you) vs weekly mean across all employees |
| `weekly_focus_hours` | area/line | per week: mean of `Focus_Hours` |
| `weekly_co2_saved` | area | per week: sum of `Estimated_CO2_Saved_KG` |
| `weekly_commute_distance` | area | per week: sum of `Commute_Distance_Saved_KM` |
| `hours_vs_engagement` | scatter | one point per week: (weekly hours worked, weekly engagement) for you + company weekly means |
| `engagement_trend` | line | per week: mean of `Engagement_Score` |
| `wellbeing_trend` | line | per week: mean of `Wellbeing_Score` |
| `work_mode_distribution` | donut | your count per `Work_Mode` vs company average count |
| `office_vs_remote_days` | bar | your total office days / remote days vs company averages |
| `learning_by_skill_category` | bar | per `Skill_Category`: your mean completion rate vs company *(each employee first aggregated, then averaged)* |
| `learning_status_distribution` | donut | count per `Course_Status` |
| `performance_dimensions` | radar/line | per dimension: your mean score, department average and company average |
| `goal_by_category` | bar | per `Goal_Category`: your mean progress vs company |
| `goal_progress_by_priority` | bar | per `Priority`: your mean progress vs company |
| `goal_status_distribution` | donut | count per `Goal_Status` |
| `goal_priority_distribution` | donut | count per `Priority` |
| `meeting_types` | donut | count per `Meeting_Type` (you as organiser) |
| `meeting_efficiency_by_type` | bar | per `Meeting_Type`: your mean efficiency vs company |
| `focus_vs_collaboration` | bar | your focus vs collaboration average hours, with company averages |

**Distribution company averages** are computed fairly: for each employee count
their rows within the category, then average those per-employee counts. This
avoids heavy users dominating the average.

---

## 7. Insights and their thresholds

Insights are generated in `employee_dashboard` and sorted so `warning` first,
then `info`, then `positive`.

| Insight | Category | Severity | Trigger / threshold |
|---------|----------|----------|---------------------|
| Collaboration outweighs focus | Productivity | warning | collaboration hours > focus hours |
| Healthy focus balance | Productivity | positive | focus hours ≥ collaboration hours |
| Engagement above/below average | Wellbeing | positive / warning | percentile ≥ 90 (positive); value ≤ 3.0 (warning); value ≥ 4.0 (positive) |
| Wellbeing above average / needs attention | Wellbeing | positive / warning | ≥ 4.0 positive, ≤ 3.0 warning |
| Strong performance / below average | Performance | positive / warning | ≥ 4.0 positive, ≤ 3.0 warning |
| Goals on track / lagging | Goals | positive / warning | value ≥ 80% positive, ≤ 50% warning |
| High / low goal achievement | Goals | positive / warning | ≥ 85% positive, ≤ 60% warning |
| Learning completion excellent / lagging | Learning | positive / warning | ≥ 90% positive, ≤ 50% warning |
| Strong / weak assessment results | Learning | positive / warning | ≥ 85 positive, ≤ 60 warning |
| Efficient / inefficient meetings | Meetings | positive / warning | efficiency ≥ 4.0 / ≤ 3.0 |
| Action follow-through / piling up | Meetings | positive / warning | ≥ 90% / ≤ 70% |
| Reliable / low attendance | Meetings | positive / warning | ≥ 95% / ≤ 75% |
| Overdue goals | Goals | warning | `goals_overdue` > 0 |
| High-priority goals at risk | Goals | warning | High/Critical priority and progress < 50% and status ≠ completed |
| Many long meetings | Meetings | info | long-meeting share > 20% |
| Certifications earned | Learning | positive | certifications > 0 |
| Commute emissions saved | Sustainability | positive | CO2 saved > 0 |

Benchmark-based insights also fire when the percentile is ≥ 90 (positive) or the
value is at/below the "low" threshold (warning).

---

## 8. Notes & assumptions

- Every rate that is stored as a fraction (`0–1`) is multiplied by 100 for
  display, so `Completion_Rate = 1.0` shows as `100%`.
- Scores (`Engagement_Score`, `Efficiency_Score`, `Overall_Rating`, …) are on a
  `1–5` scale.
- `Target_Value` / `Actual_Value` in goals use mixed units, so progress is
  taken from the explicit `Progress_Percentage` column instead of recomputing a
  ratio.
- `mean_of` ignores nulls; a KPI with no data for the employee shows `—`.
- The composite index requires at least one non-null component; otherwise the
  employee is omitted from rankings.
