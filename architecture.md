# Employee Analytics Portal — Architecture

A simple two-part application: a web dashboard frontend and a Python backend that reads employee data from CSV files and computes KPIs, benchmarks, charts, insights, and recommendations for three roles.

---

## Tech Stack

| Part | Technology |
|---|---|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, AG Charts |
| Backend | FastAPI, Uvicorn (web server), pandas (data calculation) |
| Data | 9 CSV files (no database — pandas reads the files directly) |
| Communication | REST API — 3 GET endpoints returning JSON |
| Hosting | Runs locally (frontend on port 3000, backend on port 8000) |

---

## High-Level Diagram

```
┌──────────────────────────────────────────────────────────┐
│  FRONTEND (Next.js / React)                              │
│                                                          │
│   Login page ──► Employee Dashboard                      │
│              ├──► Manager Dashboard                      │
│              └──► HR Dashboard                           │
│                                                          │
│   KPI cards · AG Charts · Insights · Recommendations    │
└──────────────────────┬───────────────────────────────────┘
                       │  HTTP GET (JSON)
┌──────────────────────▼───────────────────────────────────┐
│  BACKEND (FastAPI + pandas)                              │
│                                                          │
│   /employee/     /manager/     /hr/                      │
│        │             │            │                      │
│        └────── shared calculation code ──────┘           │
│                   │                                      │
│   Pipeline: KPIs → Benchmarks → Composite Index →        │
│             Charts data → Insights → Recommendations     │
└──────────────────────┬───────────────────────────────────┘
                       │  pd.read_csv (on every request)
┌──────────────────────▼───────────────────────────────────┐
│  DATA (9 CSV files)                                      │
│                                                          │
│  Employees · Meetings · HybridWork · Learning · Goals    │
│  Resources · Performance · Departments · ManagerDepartments│
└──────────────────────────────────────────────────────────┘
```

---

## Backend Structure

```
backend/
├── main.py                  # Creates the FastAPI app, mounts the 3 routes, CORS
├── data/                    # 9 CSV files = the entire database
└── routes/
    ├── employee.py          # /employee endpoint + shared helper functions
    ├── manager.py           # /manager endpoint (uses helpers from employee.py)
    ├── hr.py                # /hr endpoint (uses helpers from both above)
    └── recommendations.py   # Rules-based recommendation engine (no endpoint)
```

The three dashboards share the same calculation code, so an employee's
score is identical no matter which dashboard shows it.

---

## Frontend Structure

```
frontend/
├── app/
│   ├── page.js              # Login: enter Employee ID + pick a role
│   ├── employee/page.jsx    # Employee dashboard
│   ├── manager/page.jsx     # Manager dashboard
│   └── hr/page.jsx          # HR dashboard
└── components/
    ├── SectionNav.jsx       # Section navigation
    ├── FlipCard.jsx         # "How is this calculated?" cards
    └── explain/             # Written explanations for each KPI and chart
```

Each dashboard page fetches its data from the backend once on load,
then renders KPI cards, charts, tables, insights, and recommendations.

---

## Flows

### 1. Login Flow

```
User enters Employee ID + selects a role
        │
        ▼
Browser navigates to /{role}?employee_id=E0XX
        │
        ▼
Dashboard page reads the ID from the URL
        │
        ▼
Page calls the matching backend endpoint
```

There is no real login system. The only server-side check: the
manager endpoint returns a 403 error if the person is not a manager.

### 2. Employee Dashboard Flow

```
GET /employee/?employee_id=E010
        │
        ▼
Load all 9 CSV files, check the ID exists (404 if not found)
        │
        ▼
Calculate 25 KPIs for the employee
        │
        ▼
Compare against company average, department average,
rank, and percentile
        │
        ▼
Compute composite index (0–100) from 7 weighted components:
performance, engagement, wellbeing, meeting efficiency,
goal progress, learning, goal achievement
        │
        ▼
Prepare ~19 chart datasets (each includes company average
so the UI can show a comparison line)
        │
        ▼
Generate insights (threshold-based, sorted by severity)
        │
        ▼
Generate recommendations
        │
        ▼
Return one JSON payload → frontend renders charts, cards, tables
```

### 3. Manager Dashboard Flow

```
GET /manager/?manager_id=E001
        │
        ▼
Check the person is actually a manager (403 if not)
        │
        ▼
Find managed departments (primary and secondary)
        │
        ▼
Build team list = department members + direct reports
        │
        ▼
Calculate 12 KPIs per department, compared to company average
        │
        ▼
Build team table (composite index + standing per member)
        │
        ▼
Call the employee dashboard code for the manager's own view
        │
        ▼
Generate insights (overdue goals, low ratings, long meetings,
wellbeing drops, etc.)
        │
        ▼
Generate manager recommendations → return JSON

Drill-down: clicking a team member fetches GET /employee/ for
that person in a side panel.
```

### 4. HR Dashboard Flow

```
GET /hr/?employee_id=E007
        │
        ▼
Company-wide view:
  - Headcount and organization KPIs
  - One KPI block per department
  - Manager leaderboard
  - Top 10 performers
        │
        ▼
~23 chart datasets (performance vs wellbeing, sustainability
over time, tenure distribution, workspace use, etc.)
        │
        ▼
Insights (company level, e.g. low desk utilization,
weak learning departments)
        │
        ▼
Generate HR recommendations → return JSON

Drill-down: HR can open any employee panel (calls /employee/)
or jump to a manager's dashboard (calls /manager/).
```

### 5. Recommendation Engine Flow

```
Input: KPI values already computed
        │
        ▼
Score each KPI's improvement opportunity
(percentage still available, or gap to company average)
        │
        ▼
Assign priority: high (score ≥ 65), medium (≥ 40), low
        │
        ▼
Match to a playbook: reason, action steps, expected impact
        │
        ▼
Add situation-based recommendations
(team overdue goals, at-risk members, sustainability, meetings)
        │
        ▼
Sort by priority → remove duplicates → cap the list
(6 for employee, 8 for manager, 8 for HR)
        │
        ▼
Write a short summary sentence
```

This engine is rules-based — it runs entirely inside the backend
with no external AI service.

### 6. Data Flow

```
CSV files (committed in the repo, read-only)
        │
        ▼
pandas reads the needed files on every request
        │
        ▼
Files are joined in memory using Employee_ID,
Department_ID, and Manager_ID
        │
        ▼
Results returned as JSON — nothing is written back,
nothing is cached, no background jobs run
```

Current data size: 50 employees, ~1,200 rows across all files.

---

## Request Lifecycle (one page load)

```
1. User opens a dashboard URL
2. Next.js serves the page shell
3. React reads ?employee_id from the URL
4. Fetch call to FastAPI (e.g. GET /manager/?manager_id=E001)
5. Backend loads CSVs, computes everything, returns one JSON
6. React holds the payload in state
7. AG Charts and KPI cards render from the payload
8. User can drill down (extra fetch to /employee/ or /manager/)
```

---

## Design Decisions Worth Noting

- **Shared calculation code** across all three dashboards keeps
  scores consistent everywhere.
- **Everything is computed at request time.** There is no stored
  result, cache, or precomputation. This works fine at the current
  data size but would need rethinking if data grew large.
- **One JSON payload per dashboard** keeps the frontend simple —
  each page makes a single fetch and renders from it.
- **No database, queues, background jobs, or external services.**
  The whole system is two local processes plus flat files.
