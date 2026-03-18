import { describe, expect, it } from "vitest";
import { formatDayHeading, renderSchedule } from "../src/schedule-render.js";
import type { ScheduleResponse } from "../src/schedule-types.js";

const NOW = new Date("2026-03-18T12:00:00-04:00");

describe("formatDayHeading", () => {
  it("labels today and tomorrow relative to the provided clock", () => {
    expect(formatDayHeading(new Date("2026-03-18T17:00:00-04:00"), NOW, "America/New_York")).toBe(
      "Today — Wed, Mar 18",
    );
    expect(formatDayHeading(new Date("2026-03-19T17:00:00-04:00"), NOW, "America/New_York")).toBe(
      "Tomorrow — Thu, Mar 19",
    );
  });
});

describe("renderSchedule", () => {
  it("renders compact availability output and collapses blocked items into facility notes", () => {
    const response: ScheduleResponse = {
      title: "Open Swim Today",
      mode: "availability",
      timezone: "America/New_York",
      items: [
        {
          source: "West Carrollton YMCA",
          category: "open-swim",
          title: "Open Swim",
          status: "normal",
          start: "2026-03-18T10:00:00-04:00",
          end: "2026-03-18T15:45:00-04:00",
          area: "Lap Pool",
        },
        {
          source: "West Carrollton YMCA",
          category: "open-swim",
          title: "Pool Closed",
          status: "blocked",
          start: "2026-03-18T12:00:00-04:00",
          end: "2026-03-18T16:00:00-04:00",
          area: "Therapy Pool",
        },
      ],
      links: [{ label: "West Carrollton YMCA schedule", url: "https://example.com/wc" }],
    };

    const rendered = renderSchedule(response, { now: NOW });

    expect(rendered).toContain("**Open Swim Today**");
    expect(rendered).toContain("**Today — Wed, Mar 18**");
    expect(rendered).toContain("- 10:00 AM–3:45 PM · Open Swim · Lap Pool");
    expect(rendered).not.toContain("Pool Closed");
    expect(rendered).toContain("**Facility notes**");
    expect(rendered).toContain(
      "- Today — Wed, Mar 18: West Carrollton YMCA — Therapy Pool closed 12:00 PM–4:00 PM",
    );
    expect(rendered).toContain("- West Carrollton YMCA schedule: https://example.com/wc");
  });

  it("renders detailed mode with blocked items and descriptions", () => {
    const response: ScheduleResponse = {
      title: "Open Swim Details",
      mode: "detailed",
      timezone: "America/New_York",
      items: [
        {
          source: "West Carrollton YMCA",
          category: "open-swim",
          title: "Pool Closed",
          status: "blocked",
          start: "2026-03-18T12:00:00-04:00",
          end: "2026-03-18T16:00:00-04:00",
          area: "Therapy Pool",
          location: "West Carrollton YMCA",
          description: "The pool is closed.",
        },
      ],
    };

    const rendered = renderSchedule(response, { now: NOW });

    expect(rendered).toContain("- 12:00 PM–4:00 PM · Pool Closed · Therapy Pool");
    expect(rendered).toContain("  - West Carrollton YMCA");
    expect(rendered).toContain("  - The pool is closed.");
    expect(rendered).not.toContain("**Facility notes**");
  });

  it("adds source headings when a day mixes multiple sources", () => {
    const response: ScheduleResponse = {
      title: "Schedules",
      timezone: "America/New_York",
      items: [
        {
          source: "Open Swim",
          category: "open-swim",
          title: "Open Swim",
          status: "normal",
          start: "2026-03-18T10:00:00-04:00",
          end: "2026-03-18T15:45:00-04:00",
          area: "Lap Pool",
        },
        {
          source: "Miamisburg Vikings",
          category: "sports",
          title: "Girls MS Softball at Dixie",
          status: "normal",
          start: "2026-03-18T17:30:00-04:00",
          location: "Miamisburg High School",
        },
      ],
    };

    const rendered = renderSchedule(response, { now: NOW });

    expect(rendered).toContain("**Open Swim**");
    expect(rendered).toContain("**Miamisburg Vikings**");
    expect(rendered).toContain("- 5:30 PM · Girls MS Softball at Dixie · Miamisburg High School");
  });
});
