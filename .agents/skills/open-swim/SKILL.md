---
name: open-swim
description: >-
  This skill should be used when the user asks about "open swim", "swim schedule",
  "pool schedule", "when can I swim", "YMCA swim times", "open swim hours",
  "pool hours", or mentions West Carrollton or Coffman YMCA swimming schedules.
  Fetches live Open Swim schedules from the Dayton YMCA website.
license: MIT
---

# Open Swim Schedule — Dayton YMCA

Fetch and display Open Swim schedules from the Dayton YMCA's West Carrollton
and Coffman branch websites. Data is pulled live from the schedule pages.

## How It Works

The schedule data is **server-rendered as static JSON** in the HTML of each
branch's schedule page (inside `ygdScheduler._initialState`). It is NOT loaded
dynamically via JavaScript — the full dataset is present in the initial HTML
response and can be read by any HTTP client or web fetcher. Open Swim events
are identified by `category` set to `"Open Swim"`.

## Schedule URLs

| Branch | URL |
|--------|-----|
| West Carrollton | https://www.daytonymca.org/west-carrollton-schedule |
| Coffman | https://www.daytonymca.org/coffman-schedule |

## Fetching Schedules

Use whichever method is available in your environment. **You must actually
attempt to fetch the data** — do not assume it will fail.

### Method 1: WebFetch (works everywhere, including Claude web interface)

The schedule JSON is embedded as static data in the page HTML, so WebFetch
can read it directly. This is confirmed to work — do not skip this method.

Fetch each branch URL with this prompt (substitute the target date in
MM/DD/YYYY format, or omit the date clause to get all events):

> Find ALL schedule entries where the category is "Open Swim" in the embedded
> ygdScheduler._initialState JSON data. Only include events with date
> "MM/DD/YYYY". For each entry, return these fields: name, category,
> beginningAt, endingAt, date, weekdays, areaName, branchName, duration,
> canceled, isCancelled, description. Return as a JSON array. Include every
> matching entry — do not truncate or summarize.

Use these URLs:
- West Carrollton: `https://www.daytonymca.org/west-carrollton-schedule`
- Coffman: `https://www.daytonymca.org/coffman-schedule`

Fetch both branches in parallel when the user asks for all branches.

**Important notes for WebFetch method:**
- Always include the target date in the prompt to keep results focused — the
  full week's data may be too large for complete extraction.
- If the user asks about "today", calculate today's date and use it in the
  prompt.
- Results may occasionally be incomplete for very large datasets. If results
  look sparse, note this and provide the direct schedule links as backup.

### Method 2: Python Script (Claude Code CLI only)

Run the bundled fetch script to retrieve live data. `${SKILL_DIR}` resolves
to the directory containing this SKILL.md file.

```bash
# Today's events across all branches (default)
python3 ${SKILL_DIR}/scripts/fetch_open_swim.py

# Tomorrow's events
python3 ${SKILL_DIR}/scripts/fetch_open_swim.py --date tomorrow

# Full schedule, all dates (old behavior)
python3 ${SKILL_DIR}/scripts/fetch_open_swim.py --date all

# Specific date
python3 ${SKILL_DIR}/scripts/fetch_open_swim.py --date 03/15/2026

# Single branch
python3 ${SKILL_DIR}/scripts/fetch_open_swim.py --branch west-carrollton
python3 ${SKILL_DIR}/scripts/fetch_open_swim.py --branch coffman

# JSON output for programmatic use
python3 ${SKILL_DIR}/scripts/fetch_open_swim.py --format json
```

#### Script Options

| Flag | Values | Default | Description |
|------|--------|---------|-------------|
| `--branch` | `west-carrollton`, `coffman`, `all` | `all` | Which branch to fetch |
| `--date` | `today`, `tomorrow`, `all`, `MM/DD/YYYY` | `today` | Date filter |
| `--format` | `table`, `json` | `table` | Output format |

The script uses only Python standard library modules (no pip dependencies).

#### JSON Output Structure

When using `--format json`, the output is keyed by branch slug:

```json
{
  "west-carrollton": {
    "branch": "West Carrollton YMCA",
    "events": [ ... ],
    "distinct_types": ["Adult Swim", "Open Swim", ...],
    "total": 43
  },
  "coffman": { ... }
}
```

Each event object contains: `name`, `category`, `beginningAt`, `endingAt`,
`date`, `days`, `weekdays`, `areaName`, `branchName`, `duration`,
`description`, `canceled`, `isCancelled`.

## Understanding the Data

### Key Filtering Rule

Filter on `category === "Open Swim"` (the **Type** filter). Do NOT filter by
the event `name` field — the Class dropdown contains individual event names
but is not the correct filter for identifying Open Swim events.

### Event Types Within Open Swim

Events under the Open Swim category include varied `name` values:

- **Open Swim** — General open swim sessions
- **Adult Swim** — Pool reserved for ages 18+
- **Open Swim - 3 Lanes** / **Open Swim - Deep End Only** — Partial-pool sessions
- **Water Walking** / **Water Volleyball** — Specific activities
- **Pool Closed** — Closure periods (still categorized as Open Swim type)

### Pool Areas

- **West Carrollton**: Therapy Pool, Lap Pool
- **Coffman**: Instructional / Warm Water Therapy Pool, Competition Pool

### Data Quirks

- Some event names have trailing whitespace in raw data
- `canceled` and `isCancelled` are separate boolean fields; check both
- `days` is an array of full day names; `weekdays` is comma-separated abbreviations
- Dates are in MM/DD/YYYY format; times include AM/PM

## Presenting Results

- When using the Python script, present its table output directly — do not
  reorganize or reformat it
- When using WebFetch, format the JSON results into a readable table sorted
  chronologically by date and start time
- Highlight any cancelled events prominently
- If the user asks about a specific branch, only fetch that branch
- Always include direct schedule links as a fallback:
  - West Carrollton: https://www.daytonymca.org/west-carrollton-schedule
  - Coffman: https://www.daytonymca.org/coffman-schedule

## Additional Resources

### Reference Files

- **`references/data-structure.md`** — Complete field-by-field documentation of
  the `ygdScheduler._initialState` JSON schema and all known event types

### Scripts

- **`scripts/fetch_open_swim.py`** — Standalone Python script to fetch, parse,
  and filter Open Swim events from both branch schedule pages
