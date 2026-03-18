# Unified Schedule Display for Discord

## Purpose

Define a shared, Discord-friendly display format for all schedule-like outputs in this repo, including:

- athletics / ICS events
- open swim / facility schedules
- closures / availability windows
- future calendar-style skills

The goal is to make schedule responses:

- easy to scan on mobile
- consistent across skills
- compact by default
- rich enough to show important details
- flexible across multiple source types

---

## Core Principles

1. **Day-first grouping**
   - Users usually care about *when* first.

2. **Compact by default**
   - One primary line per item.
   - Optional secondary detail line only when it adds value.

3. **Discord-native formatting**
   - Prefer bullets and bold headings.
   - Avoid code blocks for normal schedule output.

4. **Usable availability over raw source fidelity**
   - Especially for facility schedules, prioritize what a user can actually do.

5. **Shared normalization before rendering**
   - Different feeds should map into a common item shape.

---

## Display Modes

### `compact` (default)
Use for most schedule replies.

Characteristics:
- grouped by day
- short bullet per item
- source subheading only when helpful
- blocked items usually hidden
- links at footer

### `detailed`
Use when the user asks for:
- full schedule
- all items
- full details
- every closure block

Characteristics:
- includes blocked items
- includes more descriptions and notes
- same structure, just more detail

### `availability`
Use for facility-style schedules like open swim.

Characteristics:
- emphasizes usable windows
- restrictions shown inline or as short notes
- closures collapsed into notes when possible

---

## Canonical Item Model

```ts
type ScheduleStatus =
  | "normal"
  | "limited"
  | "blocked"
  | "cancelled"
  | "postponed";

type ScheduleItem = {
  id?: string;

  source: string;             // "West Carrollton YMCA", "Miamisburg Vikings"
  category: string;           // "open-swim", "sports", "facility", etc.
  title: string;              // human-readable title
  status: ScheduleStatus;

  start?: string;             // ISO datetime preferred
  end?: string;               // ISO datetime preferred
  allDay?: boolean;

  dateLabel?: string;         // fallback if source doesn't provide full datetime
  timeLabel?: string;         // fallback display time

  location?: string;          // "Miamisburg High School"
  area?: string;              // "Therapy Pool"
  opponent?: string;
  homeAway?: "home" | "away";

  tags?: string[];            // ["varsity", "girls", "scrimmage"]
  note?: string;              // short detail
  description?: string;       // longer detail when needed
  url?: string;
};

type ScheduleResponse = {
  title: string;
  mode?: "compact" | "detailed" | "availability";
  timezone?: string;
  items: ScheduleItem[];

  notes?: string[];
  links?: Array<{
    label: string;
    url: string;
  }>;

  metadata?: {
    rangeLabel?: string;
    sourceSummary?: string[];
  };
};
```

---

## Status Rules

### `normal`
Regular event or availability.

Examples:
- Open Swim
- scheduled game

### `limited`
Available but restricted.

Examples:
- Adult Swim
- Open Swim - 3 Lanes
- Deep End Only

### `blocked`
Unavailable.

Examples:
- Pool Closed
- facility unavailable block

### `cancelled`
Explicitly cancelled.

### `postponed`
Explicitly postponed.

---

## Default Rendering Rules

### Message structure

```md
**<Title>**

**<Day Heading>**
**<Source Heading>**   // only when useful
- <Primary line>
  - <Secondary line, optional>

**<Next Day Heading>**
- <Primary line>

<Optional footer notes / links>
```

### Day headings
Use:
- `**Today — Wed, Mar 18**`
- `**Tomorrow — Thu, Mar 19**`
- otherwise `**Fri, Mar 20**`

### Primary line
Format:

```md
- <time> · <title> · <place>
```

Examples:
- `- 5:30 PM · Girls MS Softball at Dixie · Miamisburg High School`
- `- 10:00 AM–3:45 PM · Open Swim · Lap Pool`

### Secondary line
Only include when it adds value.

Use for:
- restrictions
- cancellation/postponement
- extra venue detail
- short notes

Examples:
- `  - Adults 18+ only`
- `  - Cancelled`
- `  - Miamisburg High School`

### Time formatting
Preferred:
- `5:30 PM`
- `10:00 AM–3:45 PM`
- `TBD`

Rules:
- no seconds
- local timezone
- omit end time if unavailable

---

## Source Grouping Rules

Within a day:

- if all items come from one source, skip source heading
- if multiple sources are mixed, use source subheadings

Example:

```md
**Today — Wed, Mar 18**

**West Carrollton YMCA**
- 10:00 AM–3:45 PM · Open Swim · Lap Pool

**Miamisburg Vikings**
- 5:30 PM · Girls MS Softball at Dixie · Miamisburg High School
```

---

## Blocked Item Rules

### Default behavior
In `compact` mode:
- show `normal`
- show `limited`
- usually hide `blocked`
- always show `cancelled` and `postponed`

### Show blocked items when:
- user requests full schedule
- closures explain missing availability
- closures are the main point of the question
- no usable items exist

### Preferred rendering of blocked items
Do not let closures dominate the main list if they can be summarized.

Prefer:

```md
**Facility notes**
- West Carrollton therapy pool closed 12:00–4:00 PM
- Coffman warm water therapy pool closed 5:00–8:00 AM and 2:00–5:00 PM
```

instead of many individual closure bullets.

---

## Source Mapping Guidance

### Athletics / ICS feeds
Map:
- parsed summary → `title`
- opponent → `opponent`
- home/away → `homeAway`
- start/end → `start` / `end`
- location → `location`
- source/team → `source`
- category → `sports`

Preferred title examples:
- `Girls JV Lacrosse vs Little Miami`
- `Boys Varsity Baseball at Middletown Scrimmage`

### Open swim / facility feeds
Map:
- branch name → `source`
- event name → `title`
- area name → `area`
- date/time → `start` / `end`
- description → `description`
- category → `open-swim` or `facility`

Status mapping examples:
- `Pool Closed` → `blocked`
- `Adult Swim` → `limited`
- `Open Swim - 3 Lanes` → `limited`
- `Open Swim` → `normal`

---

## Output Examples

### Open swim (compact)

```md
**Open Swim Today — Wed, Mar 18**

**West Carrollton YMCA**
- 6:00–9:00 AM · Water Walking · Lap Pool
- 7:00–9:00 AM · Adult Swim · Therapy Pool
  - Adults 18+ only
- 10:00 AM–3:45 PM · Open Swim · Lap Pool
- 11:30 AM–12:00 PM · Open Swim · Therapy Pool
- 4:00–6:00 PM · Open Swim · Therapy Pool

**Facility notes**
- West Carrollton therapy pool closed 12:00–4:00 PM
- Coffman warm water therapy pool has multiple closure blocks today

Links:
- West Carrollton schedule
- Coffman schedule
```

### Athletics (compact)

```md
**Miamisburg Vikings — Today through Fri, Mar 20**

**Today — Wed, Mar 18**
- 5:30 PM · Girls MS Softball at Dixie · Miamisburg High School
- 6:00 PM · Girls MS Lacrosse at Centerville Black · Schoolhouse Park

**Tomorrow — Thu, Mar 19**
- 5:00 PM · Boys Varsity Baseball at Middletown Scrimmage · Middletown High School
- 5:00 PM · Boys JV Baseball vs Middletown · Toadvine Field
- 5:30 PM · Girls Varsity Softball vs Sidney Scrimmage · Miamisburg High School

**Fri, Mar 20**
- 5:30 PM · Girls JV Lacrosse vs Little Miami · Holland Field
- 7:00 PM · Girls Varsity Lacrosse vs Little Miami · Holland Field
```

### Mixed-source response

```md
**Schedules — Wed, Mar 18 through Fri, Mar 20**

**Today — Wed, Mar 18**

**Open Swim**
- 6:00–9:00 AM · Water Walking · West Carrollton Lap Pool
- 7:00–9:00 AM · Adult Swim · West Carrollton Therapy Pool
- 10:00 AM–3:45 PM · Open Swim · West Carrollton Lap Pool

**Miamisburg Vikings**
- 5:30 PM · Girls MS Softball at Dixie · Miamisburg High School
- 6:00 PM · Girls MS Lacrosse at Centerville Black · Schoolhouse Park

**Facility notes**
- Coffman pool areas have multiple closure blocks today
```

---

## Empty Results

If nothing is found:

```md
**Open Swim Today — Wed, Mar 18**
No open swim sessions found today.
```

If closures explain why:

```md
**Open Swim Today — Wed, Mar 18**
No open swim sessions found today.

**Facility notes**
- West Carrollton therapy pool closed 12:00–4:00 PM
```

---

## Practical Guidance

### Do
- use bold headings
- use bullets
- keep lines short
- normalize titles for humans
- treat closures as notes when appropriate

### Don't
- default to code blocks
- repeat `Date:` and `Time:` on every item
- dump raw tables unless explicitly asked
- interleave too many closure rows with usable items

---

## Rollout Guidance

1. Update schedule skills to normalize into this shape.
2. Prefer structured data from fetch scripts where possible.
3. Use this rendering style consistently across skills.
4. Later, centralize rendering in shared bot code.
