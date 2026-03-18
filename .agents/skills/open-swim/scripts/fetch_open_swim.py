#!/usr/bin/env python3
"""
Fetch Open Swim schedules from Dayton YMCA branch pages.

Extracts the ygdScheduler._initialState JSON embedded in the HTML,
filters for events where category == "Open Swim" (the Type filter),
and outputs either a human-readable table or normalized JSON shaped for
shared schedule rendering.

Usage:
    python3 fetch_open_swim.py [--branch west-carrollton|coffman|all]
                               [--date today|tomorrow|all|MM/DD/YYYY]
                               [--format json|table]
"""

import argparse
import json
import re
import sys
import urllib.request
from datetime import date, datetime, timedelta
from typing import Any, Dict, Optional

try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo

SCHEDULE_URLS = {
    "west-carrollton": "https://www.daytonymca.org/west-carrollton-schedule",
    "coffman": "https://www.daytonymca.org/coffman-schedule",
}

TIMEZONE = "America/New_York"


def fetch_html(url: str) -> str:
    """Fetch raw HTML from a URL."""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8")


def extract_initial_state(html: str) -> dict:
    """Extract the ygdScheduler._initialState JSON from embedded script tags."""
    pattern = r'"ygdScheduler"\s*:\s*\{\s*"_initialState"\s*:\s*(\{.*?\})\s*\}'
    match = re.search(pattern, html, re.DOTALL)
    if not match:
        raise ValueError("Could not find ygdScheduler._initialState in page HTML")

    return _extract_balanced_json(html, match.start(1))


def _extract_balanced_json(text: str, start: int) -> dict:
    """Extract a balanced JSON object starting at the given position."""
    depth = 0
    i = start
    while i < len(text):
        ch = text[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(text[start : i + 1])
        elif ch == '"':
            i += 1
            while i < len(text) and text[i] != '"':
                if text[i] == "\\":
                    i += 1
                i += 1
        i += 1
    raise ValueError("Unbalanced JSON object")


def filter_open_swim(initial_state: dict) -> list[dict]:
    """Filter initialClasses for category == 'Open Swim'."""
    classes = initial_state.get("initialClasses", [])
    return [c for c in classes if c.get("category") == "Open Swim"]


def resolve_target_date(date_arg: str) -> Optional[date]:
    """Convert a --date argument to a datetime.date, or None for 'all'."""
    if date_arg == "all":
        return None
    if date_arg == "today":
        return date.today()
    if date_arg == "tomorrow":
        return date.today() + timedelta(days=1)
    try:
        month, day_value, year = date_arg.split("/")
        return date(int(year), int(month), int(day_value))
    except (ValueError, AttributeError):
        print(
            f"Invalid date format: {date_arg!r} (expected today, tomorrow, all, or MM/DD/YYYY)",
            file=sys.stderr,
        )
        sys.exit(1)


def filter_by_date(events: list[dict], target_date: Optional[date]) -> list[dict]:
    """Filter events to those matching target_date. Returns all if target_date is None."""
    if target_date is None:
        return events
    target_str = target_date.strftime("%m/%d/%Y")
    return [e for e in events if e.get("date") == target_str]


def _parse_time_for_sort(time_str: str) -> tuple[int, int, int]:
    """Convert '07:00:00 AM' to a 24-hour (hour, minute, second) tuple for sorting."""
    try:
        parts = time_str.strip().split()
        hms = parts[0].split(":")
        h, m, s = int(hms[0]), int(hms[1]), int(hms[2])
        period = parts[1].upper() if len(parts) > 1 else "AM"
        if period == "AM" and h == 12:
            h = 0
        elif period == "PM" and h != 12:
            h += 12
        return (h, m, s)
    except (IndexError, ValueError):
        return (99, 99, 99)


def clean_name(value: str) -> str:
    """Normalize event names for display and JSON output."""
    return str(value or "Unknown").strip()


def format_clock_time(time_str: str) -> str:
    """Convert source time strings to Discord-friendly times without seconds."""
    try:
        parsed = datetime.strptime(time_str.strip(), "%I:%M:%S %p")
        return parsed.strftime("%-I:%M %p")
    except ValueError:
        return time_str.strip() or "TBD"


def parse_local_datetime(date_str: str, time_str: str) -> Optional[datetime]:
    """Parse local branch date/time strings into timezone-aware datetimes."""
    try:
        parsed = datetime.strptime(
            "%s %s" % (date_str.strip(), time_str.strip()),
            "%m/%d/%Y %I:%M:%S %p",
        )
        return parsed.replace(tzinfo=ZoneInfo(TIMEZONE))
    except ValueError:
        return None


def build_time_label(start_dt: Optional[datetime], end_dt: Optional[datetime], event: dict) -> str:
    """Build a compact time label for the event."""
    if start_dt is None:
        raw_start = format_clock_time(str(event.get("beginningAt", "")))
        raw_end = format_clock_time(str(event.get("endingAt", "")))
        return "%s–%s" % (raw_start, raw_end) if raw_end and raw_end != "TBD" else raw_start

    start_text = start_dt.strftime("%-I:%M %p")
    if end_dt is None:
        return start_text
    return "%s–%s" % (start_text, end_dt.strftime("%-I:%M %p"))


def classify_status(event: dict) -> str:
    """Map source event rows to the shared schedule status enum."""
    if event.get("canceled") or event.get("isCancelled"):
        return "cancelled"

    name = clean_name(str(event.get("name", ""))).lower()
    if "pool closed" in name:
        return "blocked"
    if name.startswith("adult swim"):
        return "limited"
    if "3 lanes" in name or "deep end only" in name:
        return "limited"
    if name.startswith("water walking") or name.startswith("water volleyball"):
        return "limited"
    return "normal"


def build_tags(name: str, status: str) -> list[str]:
    """Build simple tags for downstream rendering/filtering."""
    lowered = clean_name(name).lower()
    tags: list[str] = []
    if status != "normal":
        tags.append(status)
    if "adult" in lowered:
        tags.append("adult")
    if "3 lanes" in lowered:
        tags.append("3-lanes")
    if "deep end only" in lowered:
        tags.append("deep-end-only")
    if "water walking" in lowered:
        tags.append("water-walking")
    if "water volleyball" in lowered:
        tags.append("water-volleyball")
    return tags


def build_note(name: str, description: str, status: str) -> Optional[str]:
    """Build a short note when there is a useful compact explanation."""
    if status == "cancelled":
        return "Cancelled"
    cleaned_name = clean_name(name)
    cleaned_description = str(description or "").strip()
    if cleaned_name == "Adult Swim" and cleaned_description:
        return cleaned_description
    return None


def build_json_item(event: dict, branch_slug: str, branch_label: str) -> Dict[str, Any]:
    """Convert a raw event row into the shared schedule JSON shape."""
    start_dt = parse_local_datetime(str(event.get("date", "")), str(event.get("beginningAt", "")))
    end_dt = parse_local_datetime(str(event.get("date", "")), str(event.get("endingAt", "")))
    name = clean_name(str(event.get("name", "Unknown")))
    status = classify_status(event)
    description = str(event.get("description", "")).strip()
    item: Dict[str, Any] = {
        "source": branch_label,
        "category": "open-swim",
        "title": name,
        "status": status,
        "area": str(event.get("areaName", "")).strip() or None,
        "description": description or None,
        "note": build_note(name, description, status),
        "tags": build_tags(name, status),
        "dateLabel": str(event.get("date", "")).strip() or None,
        "timeLabel": build_time_label(start_dt, end_dt, event),
        "url": SCHEDULE_URLS[branch_slug],
    }

    if start_dt is not None:
        item["start"] = start_dt.isoformat()
        item["dateLabel"] = start_dt.strftime("%a, %b %-d")
    if end_dt is not None:
        item["end"] = end_dt.isoformat()

    clean_item = {k: v for k, v in item.items() if v not in (None, [], "")}
    return clean_item


def format_table(events: list[dict], branch_label: str) -> str:
    """Format events as a human-readable table for a single branch."""
    if not events:
        return f"No Open Swim events found for {branch_label}.\n"

    lines = [f"\n{'=' * 70}", f"Open Swim Schedule — {branch_label}", f"{'=' * 70}"]

    sorted_events = sorted(
        events,
        key=lambda e: (e.get("date", ""), _parse_time_for_sort(e.get("beginningAt", ""))),
    )

    for evt in sorted_events:
        name = clean_name(str(evt.get("name", "Unknown")))
        evt_date = evt.get("date", "N/A")
        start = evt.get("beginningAt", "N/A")
        end = evt.get("endingAt", "N/A")
        area = evt.get("areaName", "N/A")
        days = evt.get("weekdays", "N/A")
        duration = evt.get("duration", "N/A")
        desc = evt.get("description", "")
        cancelled = evt.get("canceled", False) or evt.get("isCancelled", False)

        status = " [CANCELLED]" if cancelled else ""
        lines.append(f"\n  {name}{status}")
        lines.append(f"    Date:     {evt_date} ({days})")
        lines.append(f"    Time:     {start} – {end} ({duration})")
        lines.append(f"    Area:     {area}")
        if desc:
            lines.append(f"    Details:  {desc}")

    lines.append(f"\nTotal: {len(sorted_events)} events\n")
    return "\n".join(lines)


def format_combined_table(events: list[dict], header: str) -> str:
    """Format events from multiple branches into a single chronological table."""
    if not events:
        return "No Open Swim events found.\n"

    lines = [f"\n{'=' * 70}", header, f"{'=' * 70}"]

    sorted_events = sorted(
        events,
        key=lambda e: (e.get("date", ""), _parse_time_for_sort(e.get("beginningAt", ""))),
    )

    for evt in sorted_events:
        name = clean_name(str(evt.get("name", "Unknown")))
        evt_date = evt.get("date", "N/A")
        start = evt.get("beginningAt", "N/A")
        end = evt.get("endingAt", "N/A")
        area = evt.get("areaName", "N/A")
        branch = evt.get("_branch_label", "N/A")
        days = evt.get("weekdays", "N/A")
        duration = evt.get("duration", "N/A")
        desc = evt.get("description", "")
        cancelled = evt.get("canceled", False) or evt.get("isCancelled", False)

        status = " [CANCELLED]" if cancelled else ""
        lines.append(f"\n  {name}{status}")
        lines.append(f"    Branch:   {branch}")
        lines.append(f"    Date:     {evt_date} ({days})")
        lines.append(f"    Time:     {start} – {end} ({duration})")
        lines.append(f"    Area:     {area}")
        if desc:
            lines.append(f"    Details:  {desc}")

    lines.append(f"\nTotal: {len(sorted_events)} events\n")
    return "\n".join(lines)


def get_distinct_event_names(events: list[dict]) -> list[str]:
    """Return sorted list of distinct Open Swim event names."""
    return sorted({clean_name(str(e.get("name", "Unknown"))) for e in events})


def make_title(target_date: Optional[date]) -> str:
    """Build a shared-rendering-friendly title string."""
    if target_date is None:
        return "Open Swim Schedule"
    today = date.today()
    if target_date == today:
        return "Open Swim Today"
    if target_date == today + timedelta(days=1):
        return "Open Swim Tomorrow"
    return "Open Swim — %s" % target_date.strftime("%m/%d/%Y")


def _make_header(target_date: Optional[date]) -> str:
    """Build the table header string based on the target date."""
    if target_date is None:
        return "Open Swim Schedule — All Dates"
    today = date.today()
    if target_date == today:
        label = f"Today ({target_date.strftime('%m/%d/%Y')})"
    elif target_date == today + timedelta(days=1):
        label = f"Tomorrow ({target_date.strftime('%m/%d/%Y')})"
    else:
        label = target_date.strftime("%m/%d/%Y")
    return f"Open Swim Schedule — {label}"


def build_json_response(
    events: list[dict],
    branch_slugs: list[str],
    branch_labels: dict[str, str],
    target_date: Optional[date],
    errors: list[str],
) -> Dict[str, Any]:
    """Build normalized JSON shaped for the shared schedule renderer."""
    items = [
        build_json_item(event, str(event.get("_branch_slug", "")), str(event.get("_branch_label", "")))
        for event in sorted(
            events,
            key=lambda e: (e.get("date", ""), _parse_time_for_sort(e.get("beginningAt", ""))),
        )
    ]
    links = [
        {"label": "%s schedule" % branch_labels[slug], "url": SCHEDULE_URLS[slug]}
        for slug in branch_slugs
    ]
    metadata: Dict[str, Any] = {
        "rangeLabel": "all" if target_date is None else target_date.strftime("%m/%d/%Y"),
        "sourceSummary": [branch_labels[slug] for slug in branch_slugs],
        "branchFilter": branch_slugs[0] if len(branch_slugs) == 1 else "all",
        "dateFilter": "all" if target_date is None else target_date.strftime("%m/%d/%Y"),
        "distinctTypes": get_distinct_event_names(events),
        "total": len(items),
    }
    if errors:
        metadata["errors"] = errors
    return {
        "title": make_title(target_date),
        "mode": "availability",
        "timezone": TIMEZONE,
        "items": items,
        "links": links,
        "metadata": metadata,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch Dayton YMCA Open Swim schedules")
    parser.add_argument(
        "--branch",
        choices=["west-carrollton", "coffman", "all"],
        default="all",
        help="Which branch schedule to fetch (default: all)",
    )
    parser.add_argument(
        "--date",
        default="today",
        help="Date filter: today (default), tomorrow, all, or MM/DD/YYYY",
    )
    parser.add_argument(
        "--format",
        choices=["json", "table"],
        default="table",
        help="Output format (default: table)",
    )
    args = parser.parse_args()

    target_date = resolve_target_date(args.date)
    branches = SCHEDULE_URLS if args.branch == "all" else {args.branch: SCHEDULE_URLS[args.branch]}

    combined_events: list[dict] = []
    errors: list[str] = []
    branch_labels: dict[str, str] = {}

    for branch_name, url in branches.items():
        try:
            html = fetch_html(url)
            state = extract_initial_state(html)
            events = filter_open_swim(state)
            events = filter_by_date(events, target_date)

            branch_label = branch_name.replace("-", " ").title() + " YMCA"
            if events:
                branch_label = str(events[0].get("branchName", branch_label)).strip() or branch_label
            branch_labels[branch_name] = branch_label

            for evt in events:
                evt["_branch_label"] = branch_label
                evt["_branch_slug"] = branch_name
            combined_events.extend(events)
        except Exception as e:
            print(f"Error fetching {branch_name}: {e}", file=sys.stderr)
            errors.append(branch_name)
            branch_labels[branch_name] = branch_name.replace("-", " ").title() + " YMCA"

    branch_slugs = list(branches.keys())

    if args.format == "json":
        response = build_json_response(combined_events, branch_slugs, branch_labels, target_date, errors)
        print(json.dumps(response, indent=2))
    else:
        if errors and not combined_events:
            for branch_name in errors:
                print(f"Error fetching {branch_name}.")
        else:
            header = _make_header(target_date)
            print(format_combined_table(combined_events, header))
            distinct = get_distinct_event_names(combined_events)
            if distinct:
                print(f"  Distinct Open Swim types: {', '.join(distinct)}")


if __name__ == "__main__":
    main()
