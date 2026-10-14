// "How it's calculated" notes for the HR (company-wide) dashboard.

export const KPIS = {
  headcount: [
    "Counts every employee in the roster.",
    "The note shows how many are Active.",
    "A roster number, not a trend.",
  ],
  avg_index: [
    "Average composite index (0–100) across all employees.",
    "Each index blends performance, engagement, wellbeing, meetings, goals and learning.",
    "The benchmark for every department.",
  ],
  at_risk: [
    "People whose average Overall_Rating is below 3.2.",
    "The note lists the first three names.",
    "Lower is better.",
  ],
  high_priority_overdue: [
    "Goals that are both Overdue and High priority.",
    "Counted company-wide, all employees.",
    "Lower is better.",
  ],
  meeting_cost_hours: [
    "Meeting_Cost_Hours (duration × attendees) summed company-wide.",
    "The note shows how many meetings that covers.",
    "Lower is better.",
  ],
  attendance: [
    "Average Attendance_Rate across every meeting.",
    "Averaged from the meeting records.",
    "Higher is better.",
  ],
  learning_not_started: [
    "Courses company-wide with status Not started.",
    "The note shows total courses assigned.",
    "Lower is better.",
  ],
  co2_saved: [
    "Estimated_CO2_Saved_KG summed across all hybrid-work records.",
    "The company's estimated commuting emissions avoided.",
    "Higher is better.",
  ],
  renewable: [
    "Average Renewable_Energy_Rate across all offices.",
    "Averaged from every location's resource record.",
    "Higher is better.",
  ],
};

export const CHARTS = {
  dept_index: [
    "Bar = composite index of each department.",
    "Index = average of its members' own composite scores.",
    "Dashed line = company average; departments sorted best first.",
  ],
  top: [
    "The 10 highest composite indexes in the company.",
    "Index blends performance, engagement, wellbeing, meetings, goals and learning.",
    "Click a person to open their dashboard.",
  ],
  mgr: [
    "Composite index of each department head (managers only).",
    "Same index formula, ranked among managers.",
    "The team index in the table is their people's average.",
  ],
  goal: [
    "Average Goal_Achievement_Rate of each department.",
    "Averaged per person first, then across the department.",
    "Higher is better.",
  ],
  eng: [
    "Average Engagement_Score (1–5) per department.",
    "Every employee's weekly records are averaged into one number.",
    "Higher is better.",
  ],
  learn: [
    "Average course Completion_Rate per department (%).",
    "Averaged per person, then across the department.",
    "Higher is better.",
  ],
  meet: [
    "Average Efficiency_Score of meetings organised per department.",
    "Meetings are attributed to the organiser's department.",
    "Higher is better.",
  ],
  dist: [
    "One bar per index band: how many employees fall in it.",
    "Each employee's composite index (0–100) is binned.",
    "Shows whether performance is balanced or polarised.",
  ],
  perf_wellbeing: [
    "One dot per employee: overall rating (x) vs wellbeing (y).",
    "Both are personal averages (reviews and weekly records).",
    "A bottom-left cloud means low rating and low wellbeing.",
  ],
  attendance: [
    "Average Attendance_Rate of each department's meetings.",
    "Department comes from the meeting record.",
    "Higher is better.",
  ],
  engagement_loc: [
    "Average Engagement_Score (1–5) for each office location.",
    "Taken from every hybrid-work record for that location.",
    "Compare offices on the same scale.",
  ],
  headcount: [
    "Counts employees per department.",
    "A straight count from the roster.",
    "Context for every other department chart.",
  ],
  status: [
    "Counts employees by employment status.",
    "A straight count from the roster.",
    "Shows the split of active and non-active staff.",
  ],
  location: [
    "Counts employees per office location.",
    "A straight count from the roster.",
    "Shows where the company is distributed.",
  ],
  low_perf: [
    "Share of a department's people rated below 3.2.",
    "Count of low raters ÷ department headcount.",
    "Lower is better.",
  ],
  meeting_cost: [
    "Meeting_Cost_Hours summed per department.",
    "Sorted by the highest total cost.",
    "Lower is better.",
  ],
  meeting_type: [
    "Average Efficiency_Score (1–5) for each meeting type.",
    "All meetings of that type are averaged together.",
    "The lowest types are candidates to cut.",
  ],
  workspace: [
    "Two bars per office: average desk and room utilization.",
    "Taken from that location's resource record.",
    "Near 100% means the space is fully used.",
  ],
  sustainability: [
    "Estimated CO₂ avoided each week across the company (kg).",
    "Sum of Estimated_CO2_Saved_KG for that week.",
    "Rises as more people work hybrid.",
  ],
  tenure: [
    "Employees grouped by years since their Join_Date.",
    "Buckets: under 2, 2–5, 5–8 and 8+ years.",
    "Shows how much of the company is new.",
  ],
  learning_gap: [
    "Share of each department's courses still Not started.",
    "Not-started courses ÷ all courses assigned there.",
    "Higher means more training untouched.",
  ],
  one_on_one: [
    "One-on-one meetings organised by each manager.",
    "Only meetings typed 'one-on-one' are counted.",
    "A rough proxy for coaching cadence.",
  ],
};
