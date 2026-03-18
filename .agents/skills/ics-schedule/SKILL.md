---
name: ics-schedule
description: "Fetch and display sports schedules from an ICS calendar feed with filtering. Use when the user asks about game schedules, upcoming games, sports events, match times, what games are this week, home games, when does a sport play, schedule for a team, or any athletics/sports schedule lookup. Supports filtering by date range, home/away, sport, level (varsity/jv/ms), and gender."
license: MIT
---

# ICS Schedule

Query sports schedules from an ICS calendar feed with flexible filtering.

When presenting results, follow the unified Discord schedule display spec in
`docs/schedule-display.md`.

## Quick Start

Run the fetch script to answer schedule queries:

```bash
python3 ${SKILL_DIR}/scripts/fetch_events.py [options]
```

The script auto-loads config from `references/config.json` (ICS URL, timezone, team name).

## Filter Options

| Flag | Values | Default |
|------|--------|---------|
| `--range` | `today`, `tomorrow`, `this-week`, `next-week`, `this-weekend`, `next-N` (e.g. `next-7`), `YYYY-MM-DD` | `next-7` |
| `--home-away` | `home`, `away`, `all` | `all` |
| `--sport` | Sport name (fuzzy match: `baseball`, `lacrosse`, etc.) | all |
| `--level` | `varsity`, `jv`, `ms`, `freshman`, `all` | `all` |
| `--gender` | `boys`, `girls`, `coed`, `all` | `all` |
| `--limit` | Max events to return | `50` |
| `--format` | `text`, `json` | `text` |

## Mapping User Queries to Flags

- "this week's schedule" → `--range this-week`
- "home games next week" → `--range next-week --home-away home`
- "lacrosse games coming up" → `--sport lacrosse --range next-14`
- "varsity only this week" → `--range this-week --level varsity`
- "girls softball" → `--sport softball --gender girls`
- "games this weekend" → `--range this-weekend`
- "what's on today" → `--range today`
- "next 30 days" → `--range next-30`

When the user's timeframe is vague ("coming up", "soon"), use `--range next-14`.

## Override Config

Pass `--ics-url`, `--timezone`, or `--team-name` to override `references/config.json` values.

## Config

Edit `references/config.json` to change the default ICS feed URL, timezone, or team name.

## Output Formats

### `--format text`

Produces a compact, day-grouped text view suitable for quick inspection.

### `--format json`

Prefer this when you want to normalize and render the results in the shared
Discord schedule format.

Example:

```bash
python3 ${SKILL_DIR}/scripts/fetch_events.py --range today --format json
```

The JSON output is shaped for unified schedule rendering and includes:

- `title`
- `timezone`
- `items[]`
- `metadata`

Each item includes fields like:

- `source`
- `category`
- `title`
- `status`
- `start`
- `end` (when available)
- `location`
- `opponent`
- `homeAway`
- `tags`
- `allDay`
- `dateLabel`
- `timeLabel`

## Rendering Guidance

Default to the unified schedule spec's **compact** style.

### Prefer structured output

- Prefer `--format json` when possible so you can render with the shared schedule rules
- If the `render_schedule` tool is available, pass the normalized JSON response to it instead of hand-formatting the full schedule yourself
- Use `--format text` for quick inspection or if the user wants a simpler/rawer script output

### Normalization guidance

Map ICS fields to the shared schedule model like this:

- parsed summary/title → `title`
- `DTSTART` / `DTEND` → `start` / `end`
- `LOCATION` → `location`
- parsed opponent → `opponent`
- parsed home/away → `homeAway`
- team name → `source`
- category → `sports`
- default status → `normal`

### Preferred title style

Use natural sports phrasing:

- `Girls JV Lacrosse vs Little Miami`
- `Boys Varsity Baseball at Middletown Scrimmage`
- `Girls MS Softball at Dixie`

### Default display behavior

- Group by day first
- Use one primary line per item, e.g. `- 5:30 PM · Girls MS Softball at Dixie · Miamisburg High School`
- Use a secondary line only when it adds value
- Avoid raw tables or repeated `Time:` / `Date:` labels unless the user explicitly asks for raw/full output
- If there are many events, keep the list compact and summarize overflow when needed

## Output Notes

- Times display in the configured timezone (UTC conversion is automatic)
- `vs` = home game, `at` = away game
- All-day or midnight events show `TBD` for time

## Additional Resources

- **`../../../docs/schedule-display.md`** — Unified schedule display spec for Discord
