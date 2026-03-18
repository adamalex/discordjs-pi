import type {
  RenderScheduleOptions,
  ScheduleItem,
  ScheduleRenderMode,
  ScheduleResponse,
  ScheduleStatus,
} from "./schedule-types.js";

interface NormalizedScheduleItem extends ScheduleItem {
  startDate: Date | undefined;
  endDate: Date | undefined;
  dayKey: string;
  dayLabel: string;
  renderedTime: string;
  sortKey: number;
  place: string | undefined;
}

interface ResolvedRenderOptions {
  mode: ScheduleRenderMode;
  showSourceHeadings: boolean | undefined;
  showBlocked: boolean;
  showLinks: boolean;
  maxItems: number | undefined;
  collapseBlockedIntoNotes: boolean;
  now: Date;
  timezone: string;
}

interface DayGroup {
  dayKey: string;
  dayLabel: string;
  items: NormalizedScheduleItem[];
}

export function renderSchedule(
  response: ScheduleResponse,
  options: RenderScheduleOptions = {},
): string {
  const resolved = resolveOptions(response, options);
  const normalized = response.items.map((item) => normalizeItem(item, resolved));
  const visibleItems = normalized.filter((item) => shouldRenderItem(item, resolved));
  const hiddenBlockedItems = normalized.filter((item) => isHiddenBlockedItem(item, resolved));

  const limitedItems =
    resolved.maxItems !== undefined && visibleItems.length > resolved.maxItems
      ? visibleItems.slice(0, resolved.maxItems)
      : visibleItems;
  const hiddenCount = Math.max(0, visibleItems.length - limitedItems.length);

  const groups = groupItemsByDay(limitedItems);
  const lines = [`**${response.title}**`];

  if (groups.length === 0) {
    lines.push("", "No schedule items found.");
  } else {
    for (const group of groups) {
      lines.push(...renderDayGroup(group, groups, normalized, resolved));
    }
  }

  const noteLines = [
    ...(response.notes ?? []),
    ...(resolved.collapseBlockedIntoNotes ? summarizeBlockedItems(hiddenBlockedItems) : []),
  ];
  if (noteLines.length > 0) {
    lines.push("", `**${noteHeading(hiddenBlockedItems)}**`);
    for (const note of noteLines) {
      lines.push(`- ${note}`);
    }
  }

  if (hiddenCount > 0) {
    lines.push("", `- Plus ${hiddenCount} more item(s)`);
  }

  if (resolved.showLinks && response.links && response.links.length > 0) {
    lines.push("", "Links:");
    for (const link of response.links) {
      lines.push(`- ${link.label}: ${link.url}`);
    }
  }

  return lines.join("\n").trim();
}

export function formatDayHeading(date: Date, now: Date, timeZone: string): string {
  const dateKey = dateKeyForTimeZone(date, timeZone);
  const nowKey = dateKeyForTimeZone(now, timeZone);
  if (dateKey === nowKey) {
    return `Today — ${formatShortDay(date, timeZone)}`;
  }

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (dateKey === dateKeyForTimeZone(tomorrow, timeZone)) {
    return `Tomorrow — ${formatShortDay(date, timeZone)}`;
  }

  return formatShortDay(date, timeZone);
}

function resolveOptions(
  response: ScheduleResponse,
  options: RenderScheduleOptions,
): ResolvedRenderOptions {
  const mode = options.mode ?? response.mode ?? "compact";
  return {
    mode,
    showSourceHeadings: options.showSourceHeadings,
    showBlocked: options.showBlocked ?? mode === "detailed",
    showLinks: options.showLinks ?? true,
    maxItems: options.maxItems,
    collapseBlockedIntoNotes: options.collapseBlockedIntoNotes ?? mode !== "detailed",
    now: options.now ?? new Date(),
    timezone: options.timezone ?? response.timezone ?? "America/New_York",
  };
}

function normalizeItem(item: ScheduleItem, options: ResolvedRenderOptions): NormalizedScheduleItem {
  const startDate = parseIsoDate(item.start);
  const endDate = parseIsoDate(item.end);
  const dayLabel = startDate
    ? formatDayHeading(startDate, options.now, options.timezone)
    : item.dateLabel ?? "Date TBD";
  const dayKey = startDate ? dateKeyForTimeZone(startDate, options.timezone) : `label:${dayLabel}`;

  return {
    ...item,
    startDate,
    endDate,
    dayLabel,
    dayKey,
    renderedTime: buildRenderedTime(item, startDate, endDate, options.timezone),
    sortKey: startDate?.getTime() ?? Number.MAX_SAFE_INTEGER,
    place: choosePrimaryPlace(item),
  };
}

function parseIsoDate(value?: string): Date | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function buildRenderedTime(
  item: ScheduleItem,
  startDate: Date | undefined,
  endDate: Date | undefined,
  timeZone: string,
): string {
  if (item.timeLabel) {
    return item.timeLabel;
  }
  if (item.allDay) {
    return "TBD";
  }
  if (!startDate) {
    return "TBD";
  }

  const startText = formatTime(startDate, timeZone);
  if (!endDate) {
    return startText;
  }

  return `${startText}–${formatTime(endDate, timeZone)}`;
}

function formatTime(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).formatToParts(date);

  const hour = parts.find((part) => part.type === "hour")?.value ?? "";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  const dayPeriod = parts.find((part) => part.type === "dayPeriod")?.value ?? "";
  if (hour === "12" && minute === "00" && dayPeriod.toUpperCase() === "AM") {
    return "TBD";
  }
  return `${hour}:${minute} ${dayPeriod.toUpperCase()}`.trim();
}

function formatShortDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(date);
}

function dateKeyForTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

function choosePrimaryPlace(item: ScheduleItem): string | undefined {
  return item.area ?? item.location;
}

function shouldRenderItem(item: NormalizedScheduleItem, options: ResolvedRenderOptions): boolean {
  if (item.status === "blocked") {
    return options.showBlocked;
  }
  return true;
}

function isHiddenBlockedItem(item: NormalizedScheduleItem, options: ResolvedRenderOptions): boolean {
  return item.status === "blocked" && !options.showBlocked;
}

function groupItemsByDay(items: NormalizedScheduleItem[]): DayGroup[] {
  const dayMap = new Map<string, DayGroup>();
  const sorted = [...items].sort((a, b) => {
    if (a.dayKey !== b.dayKey) {
      return a.dayKey.localeCompare(b.dayKey);
    }
    return a.sortKey - b.sortKey;
  });

  for (const item of sorted) {
    const existing = dayMap.get(item.dayKey);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    dayMap.set(item.dayKey, {
      dayKey: item.dayKey,
      dayLabel: item.dayLabel,
      items: [item],
    });
  }

  return [...dayMap.values()];
}

function renderDayGroup(
  group: DayGroup,
  groups: DayGroup[],
  allItems: NormalizedScheduleItem[],
  options: ResolvedRenderOptions,
): string[] {
  const lines = ["", `**${group.dayLabel}**`];
  const renderSourceHeadings = shouldRenderSourceHeadings(group, groups, allItems, options);

  if (!renderSourceHeadings) {
    for (const item of group.items) {
      lines.push(...renderScheduleItem(item, options));
    }
    return lines;
  }

  const sourceMap = new Map<string, NormalizedScheduleItem[]>();
  for (const item of group.items) {
    const sourceItems = sourceMap.get(item.source) ?? [];
    sourceItems.push(item);
    sourceMap.set(item.source, sourceItems);
  }

  let isFirstSource = true;
  for (const [source, items] of sourceMap.entries()) {
    if (!isFirstSource) {
      lines.push("");
    }
    lines.push(`**${source}**`);
    for (const item of items) {
      lines.push(...renderScheduleItem(item, options));
    }
    isFirstSource = false;
  }

  return lines;
}

function shouldRenderSourceHeadings(
  group: DayGroup,
  groups: DayGroup[],
  allItems: NormalizedScheduleItem[],
  options: ResolvedRenderOptions,
): boolean {
  if (options.showSourceHeadings !== undefined) {
    return options.showSourceHeadings;
  }

  const groupSources = new Set(group.items.map((item) => item.source));
  if (groupSources.size > 1) {
    return true;
  }

  const allSources = new Set(allItems.map((item) => item.source));
  return allSources.size > 1 && groups.length === 1;
}

function renderScheduleItem(item: NormalizedScheduleItem, options: ResolvedRenderOptions): string[] {
  const primary = [`- ${item.renderedTime}`, item.title];
  if (item.place) {
    primary.push(item.place);
  }

  const lines = [primary.join(" · ")];
  const detail = buildDetailLines(item, options);
  for (const value of detail) {
    lines.push(`  - ${value}`);
  }
  return lines;
}

function buildDetailLines(item: NormalizedScheduleItem, options: ResolvedRenderOptions): string[] {
  const details: string[] = [];

  if (item.status === "cancelled") {
    details.push("Cancelled");
  } else if (item.status === "postponed") {
    details.push("Postponed");
  }

  if (item.note) {
    details.push(item.note);
  }

  if (options.mode === "detailed") {
    if (item.place === item.area && item.location && item.location !== item.area) {
      details.push(item.location);
    }
    if (item.description && item.description !== item.note) {
      details.push(item.description);
    }
  }

  return dedupe(details);
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = value.trim();
    if (!cleaned || seen.has(cleaned)) {
      continue;
    }
    seen.add(cleaned);
    result.push(cleaned);
  }
  return result;
}

function summarizeBlockedItems(items: NormalizedScheduleItem[]): string[] {
  if (items.length === 0) {
    return [];
  }

  const groups = new Map<string, { dayLabel: string; source: string; place: string; times: string[] }>();
  for (const item of items) {
    const place = item.place ?? item.location ?? item.title;
    const key = `${item.dayKey}|${item.source}|${place}`;
    const existing = groups.get(key);
    if (existing) {
      existing.times.push(item.renderedTime);
      continue;
    }
    groups.set(key, {
      dayLabel: item.dayLabel,
      source: item.source,
      place,
      times: [item.renderedTime],
    });
  }

  return [...groups.values()].map((group) => {
    const uniqueTimes = dedupe(group.times);
    const timeText = uniqueTimes.join(", ");
    return `${group.dayLabel}: ${group.source} — ${group.place} closed ${timeText}`;
  });
}

function noteHeading(hiddenBlockedItems: NormalizedScheduleItem[]): string {
  if (
    hiddenBlockedItems.length > 0 &&
    hiddenBlockedItems.every((item) => item.category === "open-swim" || item.category === "facility")
  ) {
    return "Facility notes";
  }
  return "Notes";
}

export function renderStatusLabel(status: ScheduleStatus): string {
  switch (status) {
    case "cancelled":
      return "Cancelled";
    case "postponed":
      return "Postponed";
    case "blocked":
      return "Blocked";
    case "limited":
      return "Limited";
    default:
      return "Normal";
  }
}
