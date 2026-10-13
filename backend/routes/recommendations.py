"""Self-contained recommendation engine ("AI recommendations").

No external API is used. Recommendations are *derived* from the analytics data
already computed by the employee / manager / HR dashboards:

* every KPI is scored by how much headroom there is for improvement, using its
  percentile standing (when available) or its gap to the company average,
* non-KPI signals (overdue goals, at-risk members, learning gaps, meeting load,
  workspace and sustainability) are turned into targeted actions,
* each finding is matched with a curated playbook of concrete next steps.

The result is a prioritised, data-specific action plan that is regenerated on
every request, so it always reflects the latest numbers.
"""

# ---------------------------------------------------------------------------
# Tuning
# ---------------------------------------------------------------------------
PRIORITY_HIGH = 65
PRIORITY_MEDIUM = 40
MIN_OPPORTUNITY = 30
PRIORITY_ORDER = {"high": 0, "medium": 1, "low": 2}


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def _num(value):
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def format_value(value, unit):
    """Human-readable number with an optional unit."""
    value = _num(value)
    if value is None:
        return "n/a"
    text = f"{value:g}"
    if unit == "%":
        return f"{text}%"
    return f"{text} {unit}" if unit else text


def opportunity_from_gap(value, company_avg, higher_is_better=True):
    """0-100 improvement headroom from value vs company average."""
    value = _num(value)
    company_avg = _num(company_avg)
    if value is None or company_avg is None or company_avg == 0:
        return None
    deficit = (company_avg - value) if higher_is_better else (value - company_avg)
    deficit = deficit / abs(company_avg)
    return max(0.0, min(100.0, deficit * 150.0))


def opportunity_from_benchmark(metric, higher_is_better=True):
    """0-100 improvement headroom, preferring percentile when present."""
    if not metric:
        return None
    percentile = _num(metric.get("percentile"))
    if percentile is not None:
        # ``percentile`` is a goodness percentile (see employee._standing_label),
        # so headroom is 100 - percentile no matter the metric direction.
        return max(0.0, min(100.0, 100.0 - percentile))
    return opportunity_from_gap(
        metric.get("value") or metric.get("employee_value"),
        metric.get("company_avg"),
        higher_is_better,
    )


def priority_for(opportunity):
    if opportunity is None:
        return "low"
    if opportunity >= PRIORITY_HIGH:
        return "high"
    if opportunity >= PRIORITY_MEDIUM:
        return "medium"
    return "low"


def confidence_for(opportunity, has_benchmark=True):
    base = 0.55 + (opportunity or 0) / 100 * 0.33
    if has_benchmark:
        base += 0.07
    return round(min(0.95, base), 2)


# ---------------------------------------------------------------------------
# KPI playbooks: key -> prescribed actions
# ---------------------------------------------------------------------------
PLAYBOOKS = {
    "performance_rating": {
        "category": "Performance",
        "title": "Raise your performance rating",
        "why": "Recognition, growth and rewards flow from how your contribution is rated.",
        "actions": [
            "Ask your manager which two behaviours would most lift your next review.",
            "Set one measurable quality or delivery goal and share weekly progress.",
            "Request quick peer feedback after each major deliverable.",
            "Turn the last review's feedback into a written, tracked action plan.",
        ],
        "impact": "Tight feedback loops typically add 0.3–0.6 to a rating within a cycle.",
    },
    "goal_achievement_rate": {
        "category": "Goals",
        "title": "Improve goal achievement",
        "why": "Delivering on committed goals is the clearest signal of reliability.",
        "actions": [
            "Re-check each goal's target against your actual capacity.",
            "Break large goals into fortnightly milestones with owners.",
            "Escalate blockers early instead of at the deadline.",
            "Log completions to keep momentum visible.",
        ],
        "impact": "Milestone-driven goals are completed ~20–30% more often.",
    },
    "goal_progress": {
        "category": "Goals",
        "title": "Move your goals forward",
        "why": "Steady progress prevents deadline crunches and last-minute scope cuts.",
        "actions": [
            "Time-box 30 minutes each week purely for goal progress.",
            "Prioritise goals below 50% that are due soonest.",
            "Keep only 3–4 goals active at once.",
            "Ask for unblockers in your next 1:1 rather than waiting.",
        ],
        "impact": "Weekly progress rituals raise average goal progress by 10–15 points.",
    },
    "goals_completed_rate": {
        "category": "Goals",
        "title": "Complete more of your goals",
        "why": "A high completion rate shows consistent follow-through.",
        "actions": [
            "Close or renegotiate goals that are no longer relevant.",
            "Agree a 'definition of done' up front for every goal.",
            "Review goals weekly and mark finished ones immediately.",
            "Avoid starting new goals before clearing stalled ones.",
        ],
        "impact": "Finishing stalled goals can lift completion by 15%+.",
    },
    "goals_overdue": {
        "category": "Goals",
        "title": "Clear overdue goals",
        "why": "Overdue goals drain focus and signal missed commitments.",
        "actions": [
            "Triage every overdue goal: complete, re-scope, or drop.",
            "Renegotiate realistic due dates with stakeholders.",
            "Finish the single most important overdue goal this week.",
            "Add a weekly 10-minute overdue-goals review.",
        ],
        "impact": "Clearing overdue goals restores on-time delivery and reduces risk.",
    },
    "engagement_score": {
        "category": "Wellbeing",
        "title": "Lift your engagement",
        "why": "Engagement is one of the strongest predictors of performance and retention.",
        "actions": [
            "Book a 30-minute 1:1 to align priorities and growth with your manager.",
            "Take on one stretch task that genuinely interests you.",
            "Cut or shorten recurring meetings that drain your energy.",
            "Give and request feedback close to the work, not at review time.",
        ],
        "impact": "Focused effort typically lifts engagement 0.3–0.8 points per quarter.",
    },
    "wellbeing_score": {
        "category": "Wellbeing",
        "title": "Protect your wellbeing",
        "why": "Sustained wellbeing underpins focus, creativity and long-term output.",
        "actions": [
            "Block a non-negotiable lunch and a hard stop to your day.",
            "Cap back-to-back meetings and add 10-minute buffers.",
            "Take one recovery day from notifications each week.",
            "Raise workload concerns early rather than absorbing them silently.",
        ],
        "impact": "Better boundaries typically improve wellbeing 0.3–0.7 points.",
    },
    "hours_worked": {
        "category": "Productivity",
        "title": "Increase productive working time",
        "why": "Useful output — not overtime — is what drives results.",
        "actions": [
            "Plan your week around 2–3 highest-value outcomes.",
            "Batch shallow tasks (email, admin) into two fixed windows.",
            "Remove one recurring time sink each week.",
            "Start each day by naming your single most important task.",
        ],
        "impact": "Focus-led planning lifts effective output by 10–20%.",
    },
    "avg_focus_hours": {
        "category": "Productivity",
        "title": "Protect your deep-work hours",
        "why": "Deep, uninterrupted work is where the hardest problems get solved.",
        "actions": [
            "Reserve a daily 90-minute no-meeting focus block.",
            "Silence notifications and close chat during focus blocks.",
            "Group collaboration into defined slots.",
            "Defend focus time in your calendar like any other meeting.",
        ],
        "impact": "Adding ~1 focus hour a day compounds into a full extra day each week.",
    },
    "avg_collaboration_hours": {
        "category": "Productivity",
        "title": "Reduce collaboration overhead",
        "why": "Excess meetings and messages fragment attention and slow delivery.",
        "actions": [
            "Decline recurring meetings without a clear decision or owner.",
            "Replace status updates with async written summaries.",
            "Default to 25/50-minute meetings with a written agenda.",
            "Batch questions into one check-in instead of pinging all day.",
        ],
        "impact": "Trimming collaboration time frees 2–4 hours a week for real work.",
    },
    "meeting_hours": {
        "category": "Meetings",
        "title": "Trim your meeting hours",
        "why": "Every meeting hour is an hour not spent on delivery.",
        "actions": [
            "Audit your calendar and drop the lowest-value recurring meeting.",
            "Shorten the default duration to 25/50 minutes.",
            "Send a pre-read so meetings start from shared context.",
            "Convert information-sharing sessions to async notes.",
        ],
        "impact": "A 20% meeting cut recovers a meaningful block of focus time.",
    },
    "meeting_cost_hours": {
        "category": "Meetings",
        "title": "Cut meeting cost",
        "why": "Meeting cost is the combined time of all attendees — small trims add up fast.",
        "actions": [
            "Invite only decision-makers and doers, not observers.",
            "Cap attendance for status meetings and share notes instead.",
            "End every meeting with owners and deadlines written down.",
            "Cancel meetings whose decisions were already made.",
        ],
        "impact": "Leaner invites can halve the cost of routine meetings.",
    },
    "long_meeting_share": {
        "category": "Meetings",
        "title": "Shorten long meetings",
        "why": "Meetings over an hour rarely stay productive throughout.",
        "actions": [
            "Set a default 50-minute duration and hold the line.",
            "Time-box each agenda topic.",
            "Park tangents to a follow-up or async thread.",
            "Require an agenda before accepting a long meeting.",
        ],
        "impact": "Shorter meetings improve both attendance and decision quality.",
    },
    "meeting_efficiency": {
        "category": "Meetings",
        "title": "Run more effective meetings",
        "why": "Efficient meetings protect focus and produce clear decisions.",
        "actions": [
            "Open with the decision or outcome you need.",
            "Keep a visible agenda and a timekeeper.",
            "Capture actions with owners and due dates before ending.",
            "Cancel any meeting without a clear purpose.",
        ],
        "impact": "Structured meetings raise efficiency scores by 0.5+ points.",
    },
    "meeting_attendance_rate": {
        "category": "Meetings",
        "title": "Improve meeting attendance",
        "why": "Low attendance signals poorly timed or low-value meetings.",
        "actions": [
            "Check invite lists and time zones before scheduling.",
            "Send agendas in advance so people can prepare and show up.",
            "Record or summarise sessions for those who cannot attend.",
            "Avoid clashes with focus time and other recurring meetings.",
        ],
        "impact": "Better scheduling lifts attendance toward the high 90s.",
    },
    "action_completion_rate": {
        "category": "Meetings",
        "title": "Close out action items",
        "why": "Unfinished action items turn meetings into talk and erode trust.",
        "actions": [
            "Assign every action item an owner and due date live in the meeting.",
            "Review open actions at the start of each recurring meeting.",
            "Keep a single shared action tracker.",
            "Escalate items blocked for more than a week.",
        ],
        "impact": "Follow-through can push action completion above 90%.",
    },
    "learning_completion_rate": {
        "category": "Learning",
        "title": "Finish your learning paths",
        "why": "Completed learning converts directly into on-the-job capability.",
        "actions": [
            "Block two 45-minute learning slots in your calendar each week.",
            "Finish courses already in progress before starting new ones.",
            "Apply one lesson from each module to live work immediately.",
            "Set a target completion date for each assigned course.",
        ],
        "impact": "Scheduled learning raises completion by 20–30%.",
    },
    "learning_hours_completed": {
        "category": "Learning",
        "title": "Invest more time in learning",
        "why": "Time-on-task is the strongest driver of skill growth.",
        "actions": [
            "Protect a fixed weekly learning block.",
            "Turn gaps in the day into short micro-learning.",
            "Pair learning with a real work problem.",
            "Track completed hours and set a modest weekly target.",
        ],
        "impact": "A small weekly habit compounds into dozens of hours a year.",
    },
    "assessment_score": {
        "category": "Learning",
        "title": "Strengthen assessment results",
        "why": "Assessment scores show whether learning is actually landing.",
        "actions": [
            "Revisit weak modules and retake practice quizzes.",
            "Summarise each module in your own words.",
            "Discuss tricky topics with a peer or mentor.",
            "Retake assessments after targeted revision.",
        ],
        "impact": "Deliberate revision typically adds 5–15 points.",
    },
    "certifications_earned": {
        "category": "Learning",
        "title": "Earn valued certifications",
        "why": "Certifications validate skills and open career paths.",
        "actions": [
            "Pick the certification most relevant to your role this quarter.",
            "Schedule exam prep as recurring calendar blocks.",
            "Join a study group or find a peer to stay accountable.",
            "Book the exam date early to create a deadline.",
        ],
        "impact": "One focused certification per quarter compounds over a year.",
    },
    "learning_points": {
        "category": "Learning",
        "title": "Grow your learning points",
        "why": "Consistent learning activity builds both skills and recognition.",
        "actions": [
            "Complete the highest-point courses first.",
            "Set a monthly learning-points target.",
            "Share what you learn to reinforce it.",
            "Fill idle time with short modules.",
        ],
        "impact": "Steady point gains signal continuous development.",
    },
    "co2_saved": {
        "category": "Sustainability",
        "title": "Increase your sustainability impact",
        "why": "Hybrid choices cut commute emissions and support ESG goals.",
        "actions": [
            "Shift one more commute day per week to remote where possible.",
            "Combine in-office days to avoid duplicate trips.",
            "Choose low-carbon travel for unavoidable commutes.",
            "Track and share your emissions savings.",
        ],
        "impact": "One extra remote day a week meaningfully cuts annual emissions.",
    },
    "commute_distance_saved": {
        "category": "Sustainability",
        "title": "Maximise hybrid commute savings",
        "why": "Fewer commutes save time, money and emissions.",
        "actions": [
            "Plan office days around the highest-value in-person work.",
            "Group nearby meetings onto the same office day.",
            "Use the most efficient route or transport on office days.",
            "Review your schedule monthly for avoidable trips.",
        ],
        "impact": "Smarter office-day planning adds commute savings each week.",
    },
}


# ---------------------------------------------------------------------------
# Recommendation builders
# ---------------------------------------------------------------------------
def build_kpi_recommendation(key, label, metric, higher_is_better=True,
                             scope="employee", subject=None, unit=None):
    """Turn a KPI + benchmark into a recommendation (or None if not worthwhile)."""
    book = PLAYBOOKS.get(key)
    if not book:
        return None

    metric = metric or {}
    opportunity = opportunity_from_benchmark(metric, higher_is_better)
    if opportunity is None or opportunity < MIN_OPPORTUNITY:
        return None

    value = metric.get("value")
    if value is None:
        value = metric.get("employee_value")
    company = metric.get("company_avg")
    dept = metric.get("department_avg")
    percentile = metric.get("percentile")
    standing = metric.get("standing")
    unit = unit if unit is not None else (metric.get("unit") or "")

    prefix = f"{subject}: " if subject else ""
    summary = (
        f"{prefix}{label} is {format_value(value, unit)} vs a company average of "
        f"{format_value(company, unit)}"
    )
    if standing:
        summary += f" ({standing})"
    summary += "."
    if dept is not None:
        summary += f" Department average is {format_value(dept, unit)}."

    if company is not None:
        if higher_is_better:
            target = f"Target: reach at least {format_value(company, unit)}"
        else:
            target = f"Target: bring {label.lower()} to {format_value(company, unit)} or lower"
    else:
        target = None

    return {
        "id": f"{scope}:{key}" + (f":{subject}" if subject else ""),
        "scope": scope,
        "priority": priority_for(opportunity),
        "category": book["category"],
        "kpi": label,
        "title": book["title"],
        "summary": summary,
        "why": book["why"],
        "actions": list(book["actions"]),
        "expected_impact": book["impact"],
        "target": target,
        "confidence": confidence_for(opportunity, percentile is not None),
        "opportunity": round(opportunity, 1),
        "metric": {
            "value": value,
            "company_avg": company,
            "department_avg": dept,
            "percentile": percentile,
            "standing": standing,
            "unit": unit,
        },
    }


def signal_recommendation(signal_id, scope, subject, category, kpi, title, summary,
                          why, actions, impact, priority="medium", confidence=0.75,
                          opportunity=55):
    """A recommendation driven by a non-KPI signal."""
    return {
        "id": f"signal:{signal_id}" + (f":{subject}" if subject else ""),
        "scope": scope,
        "priority": priority,
        "category": category,
        "kpi": kpi,
        "title": title,
        "summary": summary,
        "why": why,
        "actions": list(actions),
        "expected_impact": impact,
        "target": None,
        "confidence": confidence,
        "opportunity": opportunity,
        "metric": {},
    }


def finalize(recommendations, limit=6):
    """Dedupe, sort by priority then headroom, and cap the list."""
    seen = set()
    unique = []
    for rec in recommendations:
        if rec is None or rec["id"] in seen:
            continue
        seen.add(rec["id"])
        unique.append(rec)
    unique.sort(
        key=lambda r: (PRIORITY_ORDER.get(r["priority"], 3), -r.get("opportunity", 0))
    )
    return unique[:limit]


def narrative(items):
    if not items:
        return "Everything looks healthy — no corrective actions needed right now."
    highs = sum(1 for i in items if i["priority"] == "high")
    focus = ", ".join(dict.fromkeys(i["kpi"] for i in items[:3]))
    if highs:
        lead = (
            f"{highs} high-priority area"
            f"{'s' if highs > 1 else ''} need attention. "
        )
    else:
        lead = ""
    return (
        f"{lead}Based on the latest KPIs, start with {focus}. "
        "Each action below is generated from the current data — work top-down."
    )


# ---------------------------------------------------------------------------
# Role entry points
# ---------------------------------------------------------------------------
def _kpi_metric(kpi):
    """Merge an employee-style KPI (value + nested benchmark) into one dict."""
    benchmark = kpi.get("benchmark") or {}
    return {"value": kpi.get("value"), "unit": kpi.get("unit"), **benchmark}


def employee_recommendations(kpis, limit=6):
    recommendations = []
    for kpi in (kpis or {}).values():
        recommendations.append(build_kpi_recommendation(
            kpi.get("key"),
            kpi.get("label"),
            _kpi_metric(kpi),
            kpi.get("higher_is_better", True),
            scope="employee",
            unit=kpi.get("unit"),
        ))
    items = finalize(recommendations, limit)
    return {"summary": narrative(items), "items": items}


def manager_recommendations(own_kpis, departments, team, team_kpis, limit=8):
    recommendations = []

    # ---- the manager's own performance (employee-style KPI dicts) ----
    for kpi in (own_kpis or {}).values():
        recommendations.append(build_kpi_recommendation(
            kpi.get("key"),
            kpi.get("label"),
            _kpi_metric(kpi),
            kpi.get("higher_is_better", True),
            scope="you",
            subject="You",
            unit=kpi.get("unit"),
        ))

    # ---- weakest KPIs inside each managed department ----
    for dept in departments or []:
        scored = []
        for key, kpi in (dept.get("kpis") or {}).items():
            opportunity = opportunity_from_benchmark(
                kpi, kpi.get("higher_is_better", True)
            )
            if opportunity is not None and opportunity >= MIN_OPPORTUNITY:
                scored.append((opportunity, key, kpi))
        scored.sort(key=lambda r: -r[0])
        for _, key, kpi in scored[:2]:
            recommendations.append(build_kpi_recommendation(
                key,
                kpi.get("label"),
                {**kpi, "unit": kpi.get("unit")},
                kpi.get("higher_is_better", True),
                scope="department",
                subject=dept.get("name"),
                unit=kpi.get("unit"),
            ))

    # ---- people signals ----
    overdue = [
        r for r in (team or [])
        if (r.get("goals_overdue") or 0) >= 2
    ]
    if overdue:
        names = ", ".join(r["name"] for r in overdue[:3])
        recommendations.append(signal_recommendation(
            "team_overdue_goals", "team", None, "Goals", "Overdue goals",
            f"{len(overdue)} team member(s) have overdue goals",
            f"Overdue goals are concentrated on: {names}.",
            "Unblocked goals keep delivery on track and reduce end-quarter risk.",
            [
                "Run a 15-minute priority reset with each affected member.",
                "Re-scope or re-date goals that are no longer realistic.",
                "Remove one blocker per person this week.",
            ],
            "Clearing overdue goals lifts team goal-achievement toward the company average.",
            priority="high", confidence=0.82, opportunity=78,
        ))

    at_risk = [
        r for r in (team or [])
        if r.get("standing") in ("Bottom 25%", "Below average")
    ]
    if at_risk:
        names = ", ".join(r["name"] for r in at_risk[:3])
        recommendations.append(signal_recommendation(
            "team_at_risk", "team", None, "People", "At-risk members",
            f"{len(at_risk)} team member(s) are tracking below average",
            f"Lower performers include: {names}.",
            "Early coaching stops small gaps turning into performance issues.",
            [
                "Schedule a supportive 1:1 to understand blockers.",
                "Agree two concrete, measurable improvement goals.",
                "Pair each person with a peer or mentor.",
                "Check progress again in two weeks.",
            ],
            "Targeted support typically moves ratings up within one cycle.",
            priority="high", confidence=0.8, opportunity=72,
        ))

    return {"summary": narrative(finalize(recommendations, 99)), "items": finalize(recommendations, limit)}


def hr_recommendations(departments, managers, org_kpis, charts, limit=8):
    recommendations = []
    org = {k.get("key"): k for k in (org_kpis or [])}

    def org_value(key):
        entry = org.get(key)
        return entry.get("value") if entry else None

    at_risk = org_value("at_risk")
    if at_risk:
        recommendations.append(signal_recommendation(
            "org_at_risk", "organisation", None, "People", "At-risk employees",
            f"{int(at_risk)} employees are rated below 3.2",
            "These employees are at higher risk of disengagement and attrition.",
            "Early support protects retention and avoids costly backfills.",
            [
                "Launch targeted check-ins for the at-risk list.",
                "Pair each at-risk employee with a mentor or coach.",
                "Review workload and role fit before the next cycle.",
            ],
            "Retaining at-risk employees avoids backfill cost and knowledge loss.",
            priority="high", confidence=0.84, opportunity=82,
        ))

    high_overdue = org_value("high_priority_overdue")
    if high_overdue:
        recommendations.append(signal_recommendation(
            "org_overdue_goals", "organisation", None, "Goals", "High-priority goals",
            f"{int(high_overdue)} high-priority goals are overdue company-wide",
            "Overdue high-priority goals are the biggest execution risk this period.",
            "On-time delivery of priority work is the clearest driver of results.",
            [
                "Publish a company-wide list of overdue high-priority goals.",
                "Assign an escalation owner per goal.",
                "Run a weekly delivery review until the backlog clears.",
            ],
            "Clearing priority backlog restores delivery confidence.",
            priority="high", confidence=0.8, opportunity=76,
        ))

    learning_gap = org_value("learning_not_started")
    if learning_gap:
        recommendations.append(signal_recommendation(
            "org_learning", "organisation", None, "Learning", "Learning completion",
            f"{int(learning_gap)} assigned courses have not been started",
            "Unstarted courses hint at a lack of protected development time.",
            "Continuous learning closes skill gaps and improves internal mobility.",
            [
                "Block recurring learning time in team calendars.",
                "Set a company target for course completion this quarter.",
                "Recognise teams that finish their learning paths.",
            ],
            "Protected learning time can lift completion by 20–30%.",
            priority="medium", confidence=0.74, opportunity=58,
        ))

    meeting_cost = org_value("meeting_cost_hours")
    if meeting_cost:
        recommendations.append(signal_recommendation(
            "org_meetings", "organisation", None, "Meetings", "Meeting load",
            f"Company meetings consumed {format_value(meeting_cost, 'h')} this period",
            "Large meeting loads are one of the biggest hidden productivity costs.",
            "Roughly a fifth of meeting time is widely considered avoidable.",
            [
                "Introduce meeting-free focus blocks company-wide.",
                "Adopt 25/50-minute defaults and agenda-first invitations.",
                "Review the most expensive recurring meetings each month.",
            ],
            "A 15–20% meeting reduction recovers significant focus time.",
            priority="medium", confidence=0.72, opportunity=52,
        ))

    co2 = org_value("co2_saved")
    if co2:
        recommendations.append(signal_recommendation(
            "org_sustainability", "organisation", None, "Sustainability", "CO₂ saved",
            f"Hybrid work saved an estimated {format_value(co2, 'kg')} of CO₂",
            "This is a strength worth reinforcing and reporting.",
            "It supports ESG targets, cost savings and employer brand.",
            [
                "Highlight the emissions saved in ESG reporting.",
                "Encourage one more remote day per week where roles allow.",
                "Track and publish sustainability savings regularly.",
            ],
            "Maintaining hybrid adoption compounds annual emissions savings.",
            priority="low", confidence=0.86, opportunity=20,
        ))

    # ---- weakest departments and their weakest KPI ----
    for dept in (departments or [])[-2:]:
        scored = []
        for key, kpi in (dept.get("kpis") or {}).items():
            opportunity = opportunity_from_benchmark(
                kpi, kpi.get("higher_is_better", True)
            )
            if opportunity is not None and opportunity >= MIN_OPPORTUNITY:
                scored.append((opportunity, key, kpi))
        scored.sort(key=lambda r: -r[0])
        if scored:
            _, key, kpi = scored[0]
            recommendations.append(build_kpi_recommendation(
                key,
                kpi.get("label"),
                {**kpi, "unit": kpi.get("unit")},
                kpi.get("higher_is_better", True),
                scope="department",
                subject=dept.get("name"),
                unit=kpi.get("unit"),
            ))

    return {"summary": narrative(finalize(recommendations, 99)), "items": finalize(recommendations, limit)}
