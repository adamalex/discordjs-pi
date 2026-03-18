---
name: ics-schedule
description: "Fetch and display sports schedules from ICS calendar feeds with filtering. Use when the user asks about game schedules, upcoming games, sports events, match times, what games are this week, home games, when does a sport play, schedule for a team, or any athletics/sports schedule lookup. Supports filtering by date range, home/away, sport, level (varsity/jv/ms), and gender."
license: MIT
---

# ICS Schedule

Query sports schedules from an ICS calendar feed with flexible filtering.

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

## Output Notes

- Events are grouped by day, showing time, sport/level, opponent, and location
- Times display in the configured timezone (UTC conversion is automatic)
- "vs" = home game, "at" = away game
- All-day or midnight events show "TBD" for time
