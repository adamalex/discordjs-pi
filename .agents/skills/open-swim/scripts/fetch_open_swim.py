#!/usr/bin/env python3
"""
Fetch Open Swim schedules from Dayton YMCA branch pages.

Extracts the ygdScheduler._initialState JSON embedded in the HTML,
filters for events where category == "Open Swim" (the Type filter),
and outputs the full schedule details as JSON.

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
from datetime import date, timedelta
from typing import Optional

SCHEDULE_URLS = {
    "west-carrollton": "https://www.daytonymca.org/west-carrollton-schedule",
    "coffman": "https://www.daytonymca.org/coffman-schedule",
}


def fetch_html(url: str) -> str:
    """Fetch raw HTML from a URL."""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8")


def extract_initial_state(html: str) -> dict:
    """Extract the ygdScheduler._initialState JSON from embedded script tags."""
    # The data is in a pattern like: "ygdScheduler":{"_initialState":{...}}
    # within a Drupal.settings or similar JS object.
    pattern = r'"ygdScheduler"\s*:\s*\{\s*"_initialState"\s*:\s*(\{.*?\})\s*\}'
    match = re.search(pattern, html, re.DOTALL)
    if not match:
        raise ValueError("Could not find ygdScheduler._initialState in page HTML")

    raw = match.group(1)

    # The matched JSON may be truncated by the greedy/non-greedy boundary.
    # Use a brace-counting approach to extract the complete JSON object.
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
            # Skip over string contents (handle escaped quotes)
            i += 1
            while i < len(text) and text[i] != '"':
                if text[i] == "\\":
                    i += 1  # skip escaped char
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
    # Assume MM/DD/YYYY
    try:
        month, day, year = date_arg.split("/")
        return date(int(year), int(month), int(day))
    except (ValueError, AttributeError):
        print(f"Invalid date format: {date_arg!r} (expected today, tomorrow, all, or MM/DD/YYYY)",
              file=sys.stderr)
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
        name = evt.get("name", "Unknown")
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
        return f"No Open Swim events found.\n"

    lines = [f"\n{'=' * 70}", header, f"{'=' * 70}"]

    sorted_events = sorted(
        events,
        key=lambda e: (e.get("date", ""), _parse_time_for_sort(e.get("beginningAt", ""))),
    )

    for evt in sorted_events:
        name = evt.get("name", "Unknown")
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
    return sorted({e.get("name", "Unknown") for e in events})


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


def main():
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

    combined_events = []
    errors = []

    for branch_name, url in branches.items():
        try:
            html = fetch_html(url)
            state = extract_initial_state(html)
            events = filter_open_swim(state)
            events = filter_by_date(events, target_date)

            branch_label = branch_name.replace("-", " ").title() + " YMCA"
            if events:
                branch_label = events[0].get("branchName", branch_label)

            for evt in events:
                evt["_branch_label"] = branch_label
            combined_events.extend(events)
        except Exception as e:
            print(f"Error fetching {branch_name}: {e}", file=sys.stderr)
            errors.append(branch_name)

    if args.format == "json":
        # Strip internal _branch_label before serializing
        clean = [
            {k: v for k, v in evt.items() if k != "_branch_label"}
            for evt in combined_events
        ]
        print(json.dumps(clean, indent=2))
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
