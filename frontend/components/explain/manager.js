// "How it's calculated" notes for the manager dashboard (team scope).

export { KPIS as EMPLOYEE_KPIS } from "./employee";

export const KPIS = {
  goals_on_track: [
    "Team goals with status Completed or In progress ÷ all team goals.",
    "Team = everyone in the departments you manage.",
    "Higher is better.",
  ],
  goals_overdue: [
    "Counts team goals with status Overdue.",
    "The note counts how many of them are High priority.",
    "Lower is better.",
  ],
  high_priority_overdue: [
    "Goals that are both Overdue and High priority.",
    "The sharpest risk signal on this card.",
    "Lower is better.",
  ],
  at_risk: [
    "Team members whose average Overall_Rating is below 3.2.",
    "The names below are the four lowest-rated people.",
    "Lower is better.",
  ],
  meeting_cost_hours: [
    "Meeting_Cost_Hours (duration × attendees) across team meetings.",
    "The note shows how many meetings that covers.",
    "Lower is better.",
  ],
  meeting_attendance: [
    "Average Attendance_Rate of your team's meetings.",
    "Taken from the meeting records itself.",
    "Higher is better.",
  ],
  courses_completed: [
    "Team courses with status Completed.",
    "The note shows total courses assigned to the team.",
    "Higher is better.",
  ],
  hybrid_share: [
    "Team weekly records with work mode Hybrid or Remote ÷ all records.",
    "Team = everyone in the departments you manage.",
    "Higher means more hybrid adoption.",
  ],
};

export const CHARTS = {
  dept_index: [
    "Bar = composite index (0–100) of each department.",
    "Index = average of each member's own composite score.",
    "Dashed line = company average; your departments are blue.",
  ],
  engagement: [
    "Two bars per department: average Engagement and Wellbeing (1–5).",
    "Averages taken over your team's weekly records.",
    "Dashed lines = the company averages.",
  ],
  perf_dept: [
    "One line per department: average review score (out of 5).",
    "'Your departments' is drawn bold; dashed line = company.",
    "Spot a skill gap that is specific to one team.",
  ],
  objectives: [
    "Per month: how many team goals were due vs completed.",
    "Grouped by the goal's Due_Date; achieved = status Completed.",
    "A widening gap means the team is slipping.",
  ],
  weekly_eng: [
    "One line per department: weekly average Engagement_Score.",
    "Grey dashed line = company average for that week.",
    "One team falling while others hold is the flag.",
  ],
  overdue_goals: [
    "Overdue team goals ÷ number of people in the department.",
    "Only the departments you manage are shown.",
    "Higher = more slippage per person.",
  ],
  goal_status: [
    "Every team goal counted by status.",
    "Team = everyone in the departments you manage.",
    "Shows the overall health of your goal book.",
  ],
  work_mode: [
    "Weekly records counted by work mode (Office / Hybrid / Remote).",
    "Scope: your whole team.",
    "Shows how hybrid your team really is.",
  ],
  learning: [
    "Average Completion_Rate of courses in each department (%).",
    "Every course assigned to your departments is included.",
    "Higher is better.",
  ],
  meetings: [
    "Average Efficiency_Score of meetings organised per department.",
    "Only meetings organised by your team are counted.",
    "Higher is better.",
  ],
  team_dist: [
    "One bar per team member: their composite index (0–100).",
    "The same index used on the employee dashboard.",
    "Look at the spread, not just the average.",
  ],
  goal_health: [
    "Team goals stacked by department and status.",
    "Completed, in progress, overdue and not started.",
    "A large red segment shows where to focus first.",
  ],
  pacing: [
    "One line per month: goals completed ÷ goals due that month.",
    "Based on the month each goal was due; the dashed line is the 100% target.",
    "A falling line means that month's targets did not all land.",
  ],
  wellbeing_dept: [
    "Average Wellbeing_Score (1–5) for each of your departments.",
    "Taken from every hybrid-work record for that department.",
    "Higher means your people are feeling better.",
  ],
  office_remote: [
    "Per week: total office / remote days ÷ number of people.",
    "Team-wide average days per person.",
    "Shows the rhythm of office attendance.",
  ],
  perf_person: [
    "Composite index (0–100) of every person you manage, highest first.",
    "The same index shown on their own dashboards.",
    "Scan the bottom of the list to spot who needs support.",
  ],
  assessment_dept: [
    "Average Assessment_Score (0–100) from courses taken in each department.",
    "Only courses assigned to your departments are included.",
    "Higher means stronger demonstrated skills.",
  ],
  goals_category: [
    "Every team goal counted by its Goal_Category.",
    "Team = everyone in the departments you manage.",
    "Shows where your team's goals are aimed.",
  ],
};
