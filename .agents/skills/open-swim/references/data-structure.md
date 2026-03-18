# Dayton YMCA Schedule Data Structure

## Data Source

Schedule data is embedded in each branch's schedule page as a JavaScript object
within a `<script>` tag, assigned to `ygdScheduler._initialState`.

### Schedule URLs

| Branch | URL |
|--------|-----|
| West Carrollton | https://www.daytonymca.org/west-carrollton-schedule |
| Coffman | https://www.daytonymca.org/coffman-schedule |

## ygdScheduler._initialState Schema

The top-level object contains:

```json
{
  "branches": [...],
  "templateNames": {...},
  "initialAreas": [...],
  "initialClasses": [...]
}
```

### initialClasses Entry Fields

Each schedule entry in `initialClasses` has these fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | null/string | Entry ID |
| `classId` | null/string | Class ID |
| `templateId` | null/string | Template reference ID |
| `name` | string | Event display name (e.g., "Adult Swim", "Open Swim - 3 Lanes") |
| `type` | null/string | Usually null |
| `description` | string | Human-readable description |
| `category` | string | **The "Type" filter field** — e.g., "Open Swim", "Lap Swim", "Cardio" |
| `beginningAt` | string | Start time (e.g., "07:00:00 AM") |
| `endingAt` | string | End time (e.g., "09:00:00 AM") |
| `date` | string | Date (MM/DD/YYYY format) |
| `timeOfDay` | string | "Morning", "Afternoon", "Evening" |
| `series` | null/string | Series identifier |
| `canceled` | boolean | Cancellation flag |
| `isCancelled` | boolean | Alternate cancellation flag |
| `resources` | null | Resources field |
| `level` | string | Level indicator (usually empty) |
| `seriesId` | null/string | Series ID |
| `startDate` | string | Start date (MM/DD/YYYY) |
| `days` | array | Array of day names (e.g., ["Monday", "Wednesday", "Friday"]) |
| `endDate` | string | End date (MM/DD/YYYY) |
| `weekdays` | string | Abbreviated days (e.g., "Mo,We,Fr") |
| `areaId` | null/string | Area/facility ID |
| `areaName` | string | Pool/area name (e.g., "Therapy Pool", "Lap Pool") |
| `branchId` | string | Branch UUID |
| `branchName` | string | Branch display name (e.g., "West Carrollton YMCA") |
| `duration` | string | Human-readable duration (e.g., "2 hours") |
| `instructorName` | string | Instructor name (often empty for Open Swim) |

## Type vs. Class Distinction

**IMPORTANT**: The schedule page has two different filter mechanisms:

1. **Class dropdown** — Filters by `name` field. Contains specific class names like "Adult Swim", "Open Swim - Deep End Only", etc. **Do NOT use this for Open Swim filtering.**

2. **Type dropdown** — Filters by `category` field. Contains broad categories like "Open Swim", "Lap Swim", "Cardio", etc. **Use this for Open Swim filtering** (`category === "Open Swim"`).

## Known Open Swim Event Names (by category)

Events with `category: "Open Swim"` have these distinct `name` values.
These were observed as of March 2026; run `fetch_open_swim.py --format json`
to see current values.

### West Carrollton YMCA
- Adult Swim
- Open Swim
- Open Swim - 3 Lanes
- Open Swim - Deep End Only
- Pool Closed
- Water Volleyball
- Water Walking - 2 Lanes

### Coffman YMCA
- Open Swim
- Open Swim 2 Lanes & Lap Swim 4 Lanes
- Pool Closed

Note: Some names may have trailing whitespace in the raw data.

## Pool Areas by Branch

### West Carrollton YMCA
- Therapy Pool
- Lap Pool

### Coffman YMCA
- Instructional / Warm Water Therapy Pool
- Competition Pool
