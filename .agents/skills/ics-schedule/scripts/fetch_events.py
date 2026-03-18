#!/usr/bin/env python3
"""Fetch and filter events from an ICS calendar feed.

Usage:
    python3 fetch_events.py [options]

Options:
    --ics-url URL       ICS feed URL (overrides config)
    --timezone TZ       Display timezone (default: America/New_York)
    --team-name NAME    Display name for the team
    --range RANGE       Date range: today, tomorrow, this-week, next-week,
                        this-weekend, next-N (e.g. next-7), or YYYY-MM-DD
    --home-away FILTER  home, away, or all (default: all)
    --sport SPORT       Filter by sport name (fuzzy match)
    --level LEVEL       varsity, jv, ms, or all (default: all)
    --gender GENDER     boys, girls, coed, or all (default: all)
    --config PATH       Path to config.json
    --limit N           Max events to show (default: 50)
    --format FORMAT     text or json (default: text)
"""

import argparse
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

try:
    from zoneinfo import ZoneInfo
except ImportError:
    # Python 3.8 fallback
    from backports.zoneinfo import ZoneInfo


LEVEL_LABELS = {
    "varsity": "Varsity",
    "jv": "JV",
    "ms": "MS",
    "freshman": "Freshman",
}


def parse_ics(text: str) -> List[Dict[str, str]]:
    """Parse ICS text into a list of event dicts."""
    events: List[Dict[str, str]] = []
    current: Optional[Dict[str, str]] = None
    for line in text.splitlines():
        line = line.rstrip("\r")
        if line == "BEGIN:VEVENT":
            current = {}
        elif line == "END:VEVENT":
            if current:
                events.append(current)
            current = None
        elif current is not None and ":" in line:
            # Handle properties with parameters like DTSTART;VALUE=DATE:20260314
            key_part, _, value = line.partition(":")
            key = key_part.split(";")[0]
            current[key] = value
    return events


def parse_dt(dt_str: str, tz: ZoneInfo) -> Optional[datetime]:
    """Parse an ICS datetime string to a timezone-aware datetime."""
    if not dt_str:
        return None
    dt_str = dt_str.strip()
    try:
        if dt_str.endswith("Z"):
            dt = datetime.strptime(dt_str, "%Y%m%dT%H%M%SZ")
            return dt.replace(tzinfo=ZoneInfo("UTC")).astimezone(tz)
        if "T" in dt_str:
            dt = datetime.strptime(dt_str, "%Y%m%dT%H%M%S")
            return dt.replace(tzinfo=tz)
        # Date only (all-day event)
        dt = datetime.strptime(dt_str, "%Y%m%d")
        return dt.replace(tzinfo=tz)
    except ValueError:
        return None


def parse_summary(summary: str) -> Dict[str, Any]:
    """Extract sport, level, gender, opponent, and home/away from SUMMARY.

    Examples:
        "Boys Varsity Baseball vs Bellbrook" ->
            gender=boys, level=varsity, sport=baseball, opponent=Bellbrook, home_away=home
        "Girls JV Lacrosse at Alter Scrimmage" ->
            gender=girls, level=jv, sport=lacrosse, opponent=Alter Scrimmage, home_away=away
    """
    result: Dict[str, Any] = {
        "gender": "",
        "level": "",
        "sport": "",
        "opponent": "",
        "home_away": "",
        "raw": summary,
    }
    if not summary:
        return result

    s = summary.strip()

    # Detect home/away and split on " vs " or " at "
    vs_match = re.search(r"\s+vs\s+", s, re.IGNORECASE)
    at_match = re.search(r"\s+at\s+", s, re.IGNORECASE)

    if vs_match:
        result["home_away"] = "home"
        prefix = s[: vs_match.start()]
        result["opponent"] = s[vs_match.end() :].strip()
    elif at_match:
        result["home_away"] = "away"
        prefix = s[: at_match.start()]
        result["opponent"] = s[at_match.end() :].strip()
    else:
        prefix = s

    tokens = prefix.split()

    gender_map = {
        "boys": "boys",
        "boy": "boys",
        "girls": "girls",
        "girl": "girls",
        "coed": "coed",
        "co-ed": "coed",
    }
    if tokens and tokens[0].lower() in gender_map:
        result["gender"] = gender_map[tokens[0].lower()]
        tokens = tokens[1:]

    level_patterns = [
        (re.compile(r"^varsity$|^var$", re.I), "varsity", 1),
        (re.compile(r"^jv[- ]?[a-z0-9]*$", re.I), "jv", 1),
        (re.compile(r"^junior$", re.I), "jv", 2),
        (re.compile(r"^freshman$|^fr$|^frosh$", re.I), "freshman", 1),
        (re.compile(r"^middle$|^ms$", re.I), "ms", 1),
        (re.compile(r"^[78]th$", re.I), "ms", 1),
    ]
    if tokens:
        for pattern, canonical, consume in level_patterns:
            if pattern.match(tokens[0]):
                result["level"] = canonical
                result["level_display"] = tokens[0]
                tokens = tokens[consume:]
                if canonical == "ms" and tokens and tokens[0].lower() in ("school", "grade"):
                    result["level_display"] = "%s %s" % (result["level_display"], tokens[0])
                    tokens = tokens[1:]
                if canonical == "jv" and consume == 2 and tokens and tokens[0].lower() == "varsity":
                    tokens = tokens[1:]
                break

    result["sport"] = " ".join(tokens).strip()
    return result


def get_date_range(range_str: str, tz: ZoneInfo) -> Tuple[datetime, datetime]:
    """Return (start, end) datetimes for a given range string."""
    now = datetime.now(tz)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    if range_str == "today":
        return today_start, today_start + timedelta(days=1)
    if range_str == "tomorrow":
        return today_start + timedelta(days=1), today_start + timedelta(days=2)
    if range_str == "this-week":
        start = today_start - timedelta(days=today_start.weekday())
        return start, start + timedelta(days=7)
    if range_str == "next-week":
        start = today_start - timedelta(days=today_start.weekday()) + timedelta(days=7)
        return start, start + timedelta(days=7)
    if range_str == "this-weekend":
        days_until_sat = 5 - today_start.weekday()
        if days_until_sat < 0:
            days_until_sat += 7
        sat = today_start + timedelta(days=days_until_sat)
        return sat, sat + timedelta(days=2)
    if range_str.startswith("next-"):
        try:
            n = int(range_str[5:])
            return today_start, today_start + timedelta(days=n)
        except ValueError:
            pass
    else:
        try:
            d = datetime.strptime(range_str, "%Y-%m-%d").replace(tzinfo=tz)
            return d, d + timedelta(days=1)
        except ValueError:
            pass

    return today_start, today_start + timedelta(days=7)


def fuzzy_match(query: str, target: str) -> bool:
    """Check if query loosely matches target."""
    if not query or not target:
        return False
    q = query.lower().strip()
    t = target.lower().strip()
    return q in t or t in q


def format_time(dt: Optional[datetime]) -> str:
    """Format a single event time for display."""
    if not dt:
        return "TBD"
    if dt.hour == 0 and dt.minute == 0:
        return "TBD"
    return dt.strftime("%-I:%M %p")


def build_title(info: Dict[str, Any]) -> str:
    """Build a human-readable event title."""
    parts: List[str] = []
    gender = str(info.get("gender", "")).strip()
    level = str(info.get("level", "")).strip()
    sport = str(info.get("sport", "")).strip()

    if gender:
        parts.append(gender.title())
    if level:
        parts.append(LEVEL_LABELS.get(level, level.title()))
    if sport:
        parts.append(sport.title())

    title = " ".join(parts).strip() or str(info.get("raw", "Event")).strip() or "Event"

    opponent = str(info.get("opponent", "")).strip()
    if opponent:
        direction = "vs" if info.get("home_away") == "home" else "at"
        title = "%s %s %s" % (title, direction, opponent)

    return title.strip()


def build_tags(info: Dict[str, Any]) -> List[str]:
    """Build normalized tags for JSON output."""
    tags: List[str] = []
    for key in ("gender", "level", "sport"):
        value = str(info.get(key, "")).strip().lower()
        if value:
            tags.append(value)
    raw = str(info.get("raw", "")).lower()
    opponent = str(info.get("opponent", "")).lower()
    if "scrimmage" in raw or "scrimmage" in opponent:
        tags.append("scrimmage")
    return tags


def is_all_day_event(ev: Dict[str, Any]) -> bool:
    """Return True if DTSTART is date-only or effectively all-day."""
    dtstart = str(ev.get("DTSTART", "")).strip()
    return bool(dtstart) and "T" not in dtstart


def normalize_location(location: str) -> str:
    """Shorten overly verbose venue names for Discord display."""
    cleaned = str(location).strip()
    suffix = " at Miamisburg High School"
    if cleaned.endswith(suffix):
        return cleaned[: -len(suffix)].strip()
    return cleaned


def build_json_item(ev: Dict[str, Any], team_name: str) -> Dict[str, Any]:
    """Convert a filtered event into the shared schedule JSON shape."""
    info = ev.get("_parsed", {})
    start_dt = ev.get("_dt")
    end_dt = ev.get("_end_dt")
    item: Dict[str, Any] = {
        "source": team_name,
        "category": "sports",
        "title": build_title(info),
        "status": "normal",
        "location": normalize_location(str(ev.get("LOCATION", ""))) or None,
        "opponent": str(info.get("opponent", "")).strip() or None,
        "homeAway": str(info.get("home_away", "")).strip() or None,
        "tags": build_tags(info),
        "allDay": is_all_day_event(ev),
    }

    if start_dt is not None:
        item["start"] = start_dt.isoformat()
        item["timeLabel"] = format_time(start_dt)
        item["dateLabel"] = start_dt.strftime("%a, %b %-d")
    if end_dt is not None:
        item["end"] = end_dt.isoformat()

    clean_item = {k: v for k, v in item.items() if v not in (None, [], "")}
    return clean_item


def format_events(events: List[Dict[str, Any]], team_name: str) -> str:
    """Format events grouped by day using the compact Discord-friendly style."""
    if not events:
        return "No events found matching your filters."

    by_date: Dict[str, List[Dict[str, Any]]] = {}
    for ev in events:
        dt = ev.get("_dt")
        if dt:
            key = dt.strftime("%A, %B %-d, %Y")
        else:
            key = "TBD"
        by_date.setdefault(key, []).append(ev)

    lines = ["%s Schedule" % team_name]

    for date_label, day_events in by_date.items():
        lines.append("\n%s" % date_label)
        for ev in day_events:
            info = ev.get("_parsed", {})
            time_str = format_time(ev.get("_dt"))
            title = build_title(info)
            location = normalize_location(str(ev.get("LOCATION", "")))

            line = "- %s · %s" % (time_str, title)
            if location:
                line += " · %s" % location
            lines.append(line)

    lines.append("\nTotal: %d event(s)" % len(events))
    return "\n".join(lines)


def build_json_response(
    events: List[Dict[str, Any]],
    team_name: str,
    timezone: str,
    date_range: str,
    filters: Dict[str, Any],
) -> Dict[str, Any]:
    """Build structured JSON output for shared schedule rendering."""
    items = [build_json_item(ev, team_name) for ev in events]
    return {
        "title": "%s Schedule" % team_name,
        "timezone": timezone,
        "items": items,
        "metadata": {
            "rangeLabel": date_range,
            "sourceSummary": [team_name],
            "total": len(items),
            "filters": filters,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch and filter ICS calendar events")
    parser.add_argument("--ics-url", help="ICS feed URL")
    parser.add_argument("--timezone", default="America/New_York", help="Display timezone")
    parser.add_argument("--team-name", default="Miamisburg Vikings", help="Team display name")
    parser.add_argument("--range", default="next-7", dest="date_range", help="Date range filter")
    parser.add_argument("--home-away", default="all", choices=["home", "away", "all"])
    parser.add_argument("--sport", default="", help="Sport name filter")
    parser.add_argument("--level", default="all", choices=["varsity", "jv", "ms", "freshman", "all"])
    parser.add_argument("--gender", default="all", choices=["boys", "girls", "coed", "all"])
    parser.add_argument("--config", help="Path to config.json")
    parser.add_argument("--limit", type=int, default=50, help="Max events to show")
    parser.add_argument("--format", default="text", choices=["text", "json"], help="Output format")

    args = parser.parse_args()

    config: Dict[str, Any] = {}
    config_path = args.config
    if not config_path:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        default_config = os.path.join(script_dir, "..", "references", "config.json")
        if os.path.exists(default_config):
            config_path = default_config

    if config_path and os.path.exists(config_path):
        with open(config_path) as f:
            config = json.load(f)

    ics_url = args.ics_url or config.get("ics_url", "")
    timezone = args.timezone if args.timezone != "America/New_York" else config.get("timezone", "America/New_York")
    team_name = args.team_name if args.team_name != "Miamisburg Vikings" else config.get("team_name", "Miamisburg Vikings")

    if not ics_url:
        print("Error: No ICS URL provided. Use --ics-url or set ics_url in config.json", file=sys.stderr)
        sys.exit(1)

    tz = ZoneInfo(timezone)

    try:
        req = urllib.request.Request(ics_url, headers={"User-Agent": "ics-schedule/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            ics_text = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        print("Error fetching ICS feed: %s" % e, file=sys.stderr)
        sys.exit(1)

    raw_events = parse_ics(ics_text)

    for ev in raw_events:
        ev["_dt"] = parse_dt(ev.get("DTSTART", ""), tz)
        ev["_end_dt"] = parse_dt(ev.get("DTEND", ""), tz)
        ev["_parsed"] = parse_summary(ev.get("SUMMARY", ""))

    start_dt, end_dt = get_date_range(args.date_range, tz)
    filtered: List[Dict[str, Any]] = []
    for ev in raw_events:
        dt = ev.get("_dt")
        if dt is None:
            continue
        if start_dt <= dt < end_dt:
            filtered.append(ev)

    if args.home_away != "all":
        filtered = [ev for ev in filtered if ev["_parsed"].get("home_away") == args.home_away]

    if args.sport:
        filtered = [ev for ev in filtered if fuzzy_match(args.sport, ev["_parsed"].get("sport", ""))]

    if args.level != "all":
        filtered = [ev for ev in filtered if ev["_parsed"].get("level") == args.level]

    if args.gender != "all":
        filtered = [ev for ev in filtered if ev["_parsed"].get("gender") == args.gender]

    filtered.sort(key=lambda ev: ev.get("_dt") or datetime.min.replace(tzinfo=tz))
    filtered = filtered[: args.limit]

    if args.format == "json":
        filters = {
            "homeAway": args.home_away,
            "sport": args.sport or None,
            "level": args.level,
            "gender": args.gender,
            "limit": args.limit,
        }
        response = build_json_response(filtered, team_name, timezone, args.date_range, filters)
        print(json.dumps(response, indent=2))
    else:
        print(format_events(filtered, team_name))


if __name__ == "__main__":
    main()
