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


def format_events(events: List[Dict[str, Any]], team_name: str) -> str:
    """Format events grouped by day."""
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

    lines = ["📅 %s Schedule" % team_name, "%s" % ("─" * 40)]

    for date_label, day_events in by_date.items():
        lines.append("\n**%s**" % date_label)
        for ev in day_events:
            dt = ev.get("_dt")
            info = ev.get("_parsed", {})

            if dt and dt.hour == 0 and dt.minute == 0:
                time_str = "TBD"
            elif dt:
                time_str = dt.strftime("%-I:%M %p")
            else:
                time_str = "TBD"

            parts: List[str] = []
            if info.get("gender"):
                parts.append(str(info["gender"]).title())
            if info.get("level"):
                display = info.get("level_display", info["level"])
                parts.append(str(display).upper())
            if info.get("sport"):
                parts.append(str(info["sport"]).title())

            sport_line = " ".join(parts) if parts else str(info.get("raw", "Event"))

            if info.get("opponent"):
                direction = "vs" if info.get("home_away") == "home" else "at"
                sport_line += " %s %s" % (direction, info["opponent"])

            location = ev.get("LOCATION", "")
            loc_str = "  📍 %s" % location if location else ""

            lines.append("  %s — %s%s" % (time_str, sport_line, loc_str))

    lines.append("\n%s" % ("─" * 40))
    lines.append("Total: %d event(s)" % len(events))
    return "\n".join(lines)


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

    print(format_events(filtered, team_name))


if __name__ == "__main__":
    main()
