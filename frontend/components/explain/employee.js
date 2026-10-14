// Plain-English "how it's calculated" notes for the employee dashboard.
// Kept deliberately short (3-4 lines) so anyone can read it at a glance.

export const KPIS = {
  hours_worked: [
    "Total Hours_Worked added up over every week you recorded.",
    "Company avg: the same total for a typical employee.",
    "Rank: 1 + how many people worked more hours than you.",
  ],
  avg_focus_hours: [
    "Average weekly Focus_Hours — protected deep-work time.",
    "Company avg: everyone's weekly average, then averaged.",
    "Higher is better: more time spent in focused work.",
  ],
  avg_collaboration_hours: [
    "Average weekly Collaboration_Hours (time spent with others).",
    "Company avg: the same weekly average per person.",
    "Neutral metric — shown for balance against focus time.",
  ],
  engagement_score: [
    "Average of your weekly Engagement_Score (1–5 pulse).",
    "Company avg: average of every employee's weekly average.",
    "Higher is better; standing compares you with all peers.",
  ],
  wellbeing_score: [
    "Average of your weekly Wellbeing_Score (1–5 pulse).",
    "Company avg: average of every employee's weekly average.",
    "Higher is better; a sustained drop flags burnout risk.",
  ],
  office_days: [
    "Office_Days added up over all your weeks.",
    "Company avg: the same total for a typical employee.",
    "Neutral metric — just your actual office attendance.",
  ],
  remote_days: [
    "Remote_Days added up over all your weeks.",
    "Company avg: the same total for a typical employee.",
    "Neutral metric — your actual remote attendance.",
  ],
  commute_distance_saved: [
    "Commute_Distance_Saved_KM summed across your hybrid weeks.",
    "Company avg: the same saved distance per employee.",
    "Higher is better — more commuting avoided.",
  ],
  co2_saved: [
    "Estimated_CO2_Saved_KG summed across your hybrid weeks.",
    "Company avg: the same total for a typical employee.",
    "Higher is better — more emissions avoided.",
  ],
  meeting_hours: [
    "Minutes in the meetings you organised ÷ 60, added up.",
    "Company avg: the same total for a typical organiser.",
    "Neutral metric — track it rather than chase it.",
  ],
  meeting_attendance_rate: [
    "Your Attended_Count ÷ Invited_Count across all your meetings.",
    "Company avg: the same ratio for every organiser, averaged.",
    "Higher is better — people turn up to your meetings.",
  ],
  action_completion_rate: [
    "Your Completed_Action_Items ÷ total Action_Items.",
    "Company avg: the same ratio for every organiser, averaged.",
    "Higher is better — actions actually get closed.",
  ],
  meeting_efficiency: [
    "Average Efficiency_Score (1–5) of meetings you organised.",
    "Company avg: average of every organiser's own average.",
    "Higher is better — meetings worth the time spent.",
  ],
  long_meeting_share: [
    "Share of your meetings flagged as over 60 minutes.",
    "Company avg: the same share for every organiser.",
    "Lower is better — fewer long meetings.",
  ],
  meeting_cost_hours: [
    "Meeting_Cost_Hours (duration × attendees) for your meetings.",
    "Company avg: the same total for a typical organiser.",
    "Lower is better — fewer person-hours sitting in meetings.",
  ],
  learning_completion_rate: [
    "Average Completion_Rate of your assigned courses.",
    "Company avg: average of every employee's completion %.",
    "Higher is better — you finish what you are given.",
  ],
  learning_hours_completed: [
    "Completed_Hours summed across all your courses.",
    "Company avg: the same total for a typical employee.",
    "Neutral metric — volume of learning, not quality.",
  ],
  assessment_score: [
    "Average Assessment_Score of the courses you took.",
    "Company avg: average of every learner's own average.",
    "Higher is better.",
  ],
  certifications_earned: [
    "Courses where Certification_Earned is Yes.",
    "Company avg: certifications per employee, averaged.",
    "Higher is better.",
  ],
  learning_points: [
    "Learning_Points summed for your completed courses.",
    "Company avg: the same total for a typical employee.",
    "Neutral metric — rewards learning activity.",
  ],
  performance_rating: [
    "Average Overall_Rating from your performance reviews (out of 5).",
    "Company avg: average of every employee's own average.",
    "Higher is better; rank compares you with all peers.",
  ],
  goal_achievement_rate: [
    "Average Goal_Achievement_Rate from your performance reviews.",
    "Company avg: the same average across all employees.",
    "Higher is better.",
  ],
  goal_progress: [
    "Average Progress_Percentage across all your goals.",
    "Company avg: average of every employee's goal progress.",
    "Higher is better — goals closer to done.",
  ],
  goals_completed_rate: [
    "Share of your goals with status Completed.",
    "Company avg: the same share for a typical employee.",
    "Higher is better.",
  ],
  goals_overdue: [
    "Count of your goals with status Overdue.",
    "Company avg: overdue goals per person, averaged.",
    "Lower is better.",
  ],
};

export const CHARTS = {
  weekly_work_hours: [
    "One bar per week: your total Hours_Worked that week.",
    "Dashed line: the company average for the same week.",
    "Look for weeks where you spike far above everyone else.",
  ],
  weekly_focus_hours: [
    "Area = your average Focus_Hours that week.",
    "Dashed line = company average for the same week.",
    "Flat or falling weeks usually mean meeting-heavy periods.",
  ],
  weekly_co2_saved: [
    "Estimated CO₂ you avoided each week by working hybrid (kg).",
    "Dashed line: what the average employee saved that week.",
    "Straight from Estimated_CO2_Saved_KG in your weekly records.",
  ],
  weekly_commute_distance: [
    "Kilometres of commuting you avoided each week.",
    "Dashed line: the company average per person that week.",
    "Grows with the number of remote days you take.",
  ],
  hours_vs_engagement: [
    "One dot per week: hours worked (x) vs your engagement (y).",
    "Grey dots: the company average for the same week.",
    "A downward cloud means more hours aren't buying engagement.",
  ],
  engagement_trend: [
    "Your weekly Engagement_Score (1–5) over time.",
    "Dashed line: the company average for each week.",
    "Watch for drops after heavy meeting or office weeks.",
  ],
  wellbeing_trend: [
    "Your weekly Wellbeing_Score (1–5) over time.",
    "Dashed line: the company average for each week.",
    "A sustained gap below the average needs a check-in.",
  ],
  focus_vs_collaboration: [
    "Two bars: your average weekly focus and collaboration hours.",
    "Grey bar behind each = the company average for that activity.",
    "A healthy week usually has focus greater than collaboration.",
  ],
  office_vs_remote_days: [
    "Totals of your office days and remote days for the period.",
    "Grey bar = the same total for a typical employee.",
    "Shows your real hybrid split, not the policy.",
  ],
  work_mode_distribution: [
    "How many of your weekly records are Office / Hybrid / Remote.",
    "Tooltip shows the company-average count per person.",
    "Shows where your working time actually goes.",
  ],
  performance_dimensions: [
    "Your review score (out of 5) on each performance dimension.",
    "Grey bar behind = the company average for that dimension.",
    "Find the dimension where you trail the average.",
  ],
  learning_by_skill_category: [
    "Average course Completion_Rate in each skill area (%).",
    "Grey bar = the company average completion for that skill.",
    "Your lowest bar is the skill to close first.",
  ],
  learning_status_distribution: [
    "Your courses counted by status (completed, in progress…).",
    "Tooltip shows the company-average count per person.",
    "A large 'not started' slice means assigned but untouched.",
  ],
  goal_by_category: [
    "Average Progress_Percentage of your goals per category.",
    "Grey bar = the company average progress for that category.",
    "Shows which part of your goal mix is lagging.",
  ],
  goal_progress_by_priority: [
    "Average progress of your goals by High / Medium / Low priority.",
    "Grey bar = the company average at the same priority.",
    "A high-priority bar below the grey one is the real risk.",
  ],
  goal_status_distribution: [
    "Your goals counted by status (completed, in progress…).",
    "Grey bar = the company-average count per person.",
    "Any overdue bar is work that has already slipped.",
  ],
  goal_priority_distribution: [
    "Your goals counted by priority level.",
    "Tooltip shows the company-average count per person.",
    "Shows how your goal load is weighted.",
  ],
  meeting_efficiency_by_type: [
    "Average Efficiency_Score (1–5) of your meetings by type.",
    "Grey bar = the company average for that meeting type.",
    "The lowest types are the ones to shorten or drop.",
  ],
  meeting_types: [
    "Meetings you organised, counted by meeting type.",
    "Grey bar = the company-average count per person.",
    "Shows which meetings fill your calendar most.",
  ],
};
