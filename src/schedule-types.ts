export type ScheduleStatus =
  | "normal"
  | "limited"
  | "blocked"
  | "cancelled"
  | "postponed";

export type ScheduleCategory = "open-swim" | "sports" | "facility" | (string & {});

export type ScheduleRenderMode = "compact" | "detailed" | "availability";

export interface ScheduleLink {
  label: string;
  url: string;
}

export interface ScheduleMetadata {
  rangeLabel?: string;
  sourceSummary?: string[];
  total?: number;
  [key: string]: unknown;
}

export interface ScheduleItem {
  id?: string;
  source: string;
  category: ScheduleCategory;
  title: string;
  status: ScheduleStatus;
  start?: string;
  end?: string;
  allDay?: boolean;
  dateLabel?: string;
  timeLabel?: string;
  location?: string;
  area?: string;
  opponent?: string;
  homeAway?: "home" | "away";
  tags?: string[];
  note?: string;
  description?: string;
  url?: string;
}

export interface ScheduleResponse {
  title: string;
  mode?: ScheduleRenderMode;
  timezone?: string;
  items: ScheduleItem[];
  notes?: string[];
  links?: ScheduleLink[];
  metadata?: ScheduleMetadata;
}

export interface RenderScheduleOptions {
  mode?: ScheduleRenderMode;
  showSourceHeadings?: boolean;
  showBlocked?: boolean;
  showLinks?: boolean;
  maxItems?: number;
  collapseBlockedIntoNotes?: boolean;
  now?: Date;
  timezone?: string;
}
