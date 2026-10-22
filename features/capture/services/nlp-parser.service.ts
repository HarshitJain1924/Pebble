import * as chrono from "chrono-node";
import { type Attachment } from "@/shared/types/domain.types";
import { dateKeyFromDate } from "@/shared/utils/date-key";

export interface ParseProductivityTextOptions {
  explicitType?: ParsedProductivityItem["type"];
}

export type ParsedProductivityItem = {
  type: "task" | "habit" | "checklist" | "note" | "link" | "idea" | "file";
  title: string;
  description?: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:MM
  durationMinutes?: number;
  category?: "work" | "personal" | "health" | "learning" | "creative" | "focus";
  priority?: "high" | "medium" | "low";
  /** True when priority was explicitly expressed in the input (not the parser's default). */
  priorityDetected?: boolean;
  recurrence?: {
    type: "daily" | "weekdays" | "weekly" | "monthly" | "interval";
    interval?: number;
    unit?: "hours" | "days";
    days?: number[];
    dayOfMonth?: number;
  };
  reminderOffsetMinutes?: number; // Alarm offset (e.g. 30 for "30 mins before")
  explicitReminder?: boolean;
  reminderTime?: string; // explicit reminder time HH:MM if specified
  confidence: number;
  // Checklist-specific: parsed items from multiline input
  items?: string[];
  // Link-specific: extracted URL
  url?: string;
  // File-specific: attached document metadata
  attachments?: Attachment[];
  // Detection metadata: what signal triggered the type detection
  detectionSignal?:
    | "url_pattern"
    | "multiline_bullets"
    | "multiline_short_lines"
    | "keyword_checklist"
    | "recurrence_routine"
    | "recurrence_health"
    | "keyword_note"
    | "keyword_idea"
    | "action_task"
    | "temporal_task"
    | "default_task"
    | "explicit_override";
  // Checklist confidence level for medium-confidence suggestions
  checklistConfidence?: "high" | "medium";
};

export interface ProductivitySignals {
  structural: {
    url?: string;
    urlDomain?: string;
    isMultiline: boolean;
    lineCount: number;
    hasBulletList: boolean;
    hasNumberedList: boolean;
    bulletItems?: string[];
    plainListCandidate: boolean;
    plainListItems?: string[];
    isLongProse: boolean;
    lines: string[];
  };
  semantic: {
    actionKeywords: string[];
    routineKeywords: string[];
    hasStrongAction: boolean;
    hasStrongRoutine: boolean;
    ideaLanguage: boolean;
    ideaPrefix?: string;
    noteLanguage: boolean;
    notePrefixOrSuffix?: string;
    explicitChecklistLanguage: boolean;
    checklistPrefix?: string;
    explicitTaskLanguage?: boolean;
    explicitHabitLanguage?: boolean;
  };
  temporal: {
    date?: string; // YYYY-MM-DD
    time?: string; // HH:MM
    durationMinutes?: number;
    hasDate: boolean;
    hasTime: boolean;
    recurrence?: ParsedProductivityItem["recurrence"];
    hasRecurrence: boolean;
    reminderOffsetMinutes?: number;
    explicitReminder?: boolean;
    reminderTime?: string;
    matchedTemporalPhrases: string[];
  };
  metadata: {
    category?: "work" | "personal" | "health" | "learning" | "creative" | "focus";
    priority?: "high" | "medium" | "low";
    matchedPriorityPhrase?: string;
  };
}

export type CandidateIntentType = "link" | "checklist" | "habit" | "task" | "idea" | "note";

export interface IntentRankingResult {
  topIntent: CandidateIntentType;
  confidence: number;
  detectionSignal: ParsedProductivityItem["detectionSignal"];
  scores: Record<CandidateIntentType, number>;
}

// Category keyword mapping
const CATEGORY_MAP = {
  learning: ["study", "course", "assignment", "exam", "coding", "homework", "learn", "kubernetes", "rust", "react", "c++", "read", "lecture"],
  health: ["gym", "workout", "run", "exercise", "yoga", "training", "cardio", "stretch", "meditate", "meditation", "walk", "hydration", "water"],
  work: ["meeting", "office", "client", "project", "devops", "presentation", "email", "zoom", "standup", "sprint", "task", "job", "report"],
  personal: ["call", "family", "home", "shopping", "groceries", "buy", "clean", "dishes", "laundry", "parent", "friend", "gift"],
  focus: ["deep work", "pomodoro", "focus", "focus block", "quiet time", "shut down"],
  creative: ["design", "writing", "drawing", "paint", "sketch", "brainstorm", "compose", "ui", "ux", "art"],
};

// Priority keyword mapping
const PRIORITY_MAP = {
  high: ["urgent", "asap", "important", "critical", "high priority", "urgently", "must"],
  medium: ["normal", "standard", "medium priority", "moderate"],
  low: ["later", "someday", "optional", "low priority", "when free", "lowkey"],
};

const SPECIFIC_WORK_KEYWORDS = [
  "submit", "client", "meeting", "project", "assignment", "report", "presentation",
  "kubernetes", "docker", "dsa", "interview", "placement", "backup", "finance", "rent", "pay rent", "pay",
  "buy", "call", "finish"
];

const ROUTINE_KEYWORDS = [
  "read", "journal", "meditate", "water", "gym", "workout", "running", "run", "exercise",
  "walk", "drink", "stretch", "swim", "train", "yoga", "hydration", "teeth", "brush"
];

const weekdayMap: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6
};

// Helper to format time as HH:MM
const formatTime = (date: Date): string => {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
};

// ─── STEP 1: Signal Extraction ───────────────────────────────────────────────

/**
 * Extracts independent structural, semantic, temporal, and metadata signals
 * without committing to a final entity intent.
 */
export function extractProductivitySignals(text: string): ProductivitySignals {
  const originalText = text.trim();
  const lowerText = originalText.toLowerCase();

  // 1. Structural Signals
  let url: string | undefined;
  let urlDomain: string | undefined;
  const urlRegex = /\b(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(com|org|net|io|dev|app|co|me|xyz|ai|edu|gov)(\/[^\s]*)?)/i;
  const urlMatch = originalText.match(urlRegex);
  if (urlMatch) {
    url = urlMatch[0];
    try {
      urlDomain = url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    } catch {
      urlDomain = url;
    }
  }

  const lines = originalText.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
  const lineCount = lines.length;
  const isMultiline = lineCount >= 2;

  let hasBulletList = false;
  let hasNumberedList = false;
  let bulletItems: string[] | undefined;
  let plainListCandidate = false;
  let plainListItems: string[] | undefined;

  if (isMultiline) {
    const explicitBulletLines = lines.filter(l => /^[-*•]\s/.test(l));
    const explicitNumberedLines = lines.filter(l => /^\d+[.)\s]/.test(l));

    if (
      explicitBulletLines.length >= 2 ||
      explicitNumberedLines.length >= 2 ||
      explicitBulletLines.length + explicitNumberedLines.length >= 2 ||
      (explicitBulletLines.length >= 1 && !/^[-*•]/.test(lines[0])) ||
      (explicitNumberedLines.length >= 1 && !/^\d+[.)\s]/.test(lines[0]))
    ) {
      hasBulletList = explicitBulletLines.length > 0;
      hasNumberedList = explicitNumberedLines.length > 0;
      const firstLine = lines[0];
      const isTitleLine = !(/^[-*•]\s/.test(firstLine) || /^\d+[.)\s]/.test(firstLine));
      if (isTitleLine) {
        bulletItems = lines.slice(1).map(l => l.replace(/^[-*•]\s*/, "").replace(/^\d+[.)\s]*/, "").trim()).filter(l => l.length > 0);
      } else {
        bulletItems = lines.map(l => l.replace(/^[-*•]\s*/, "").replace(/^\d+[.)\s]*/, "").trim()).filter(l => l.length > 0);
      }
    } else if (lines.length >= 3 && lines.every(l => l.length < 60)) {
      const endsWithPunctuation = lines.some(l => /[.!?]$/.test(l.trim()));
      if (!endsWithPunctuation) {
        plainListCandidate = true;
        plainListItems = lines.slice(1);
      }
    }
  }

  const isLongProse = originalText.length > 80 && /[.!?]/.test(originalText) && !/^(call|buy|finish|submit|meeting|project|assignment)/i.test(originalText);

  // 2. Semantic Signals
  const matchedActions: string[] = [];
  SPECIFIC_WORK_KEYWORDS.forEach(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, "i");
    if (regex.test(lowerText)) {
      matchedActions.push(kw);
    }
  });

  const matchedRoutines: string[] = [];
  ROUTINE_KEYWORDS.forEach(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, "i");
    if (regex.test(lowerText)) {
      matchedRoutines.push(kw);
    }
  });

  let ideaLanguage = false;
  let ideaPrefix: string | undefined;
  const ideaRegex = /^(idea:|idea\s+|thought:|thought\s+|concept:|concept\s+|what if\s+)/i;
  const ideaMatch = originalText.match(ideaRegex);
  if (ideaMatch) {
    ideaLanguage = true;
    ideaPrefix = ideaMatch[0];
  }

  let noteLanguage = false;
  let notePrefixOrSuffix: string | undefined;
  const notePrefixRegex = /^(notes on\s+|note:\s*|note\s+|thoughts on\s+)/i;
  const notePrefixMatch = originalText.match(notePrefixRegex);
  if (notePrefixMatch) {
    noteLanguage = true;
    notePrefixOrSuffix = notePrefixMatch[0];
  } else if (/\s+notes$/i.test(originalText)) {
    noteLanguage = true;
    notePrefixOrSuffix = "notes";
  } else if (/\bnotes\b/i.test(originalText) && !matchedActions.includes("submit") && !matchedActions.includes("assignment")) {
    noteLanguage = true;
    notePrefixOrSuffix = "notes";
  }

  let explicitChecklistLanguage = false;
  let checklistPrefix: string | undefined;
  const explicitChecklistRegex =
    /^(?:(?:create|add|make|start)\s+(?:a\s+)?(?:new\s+)?(?:checklist|check\s*list|todo\s*list)\b|(?:new\s+)?(?:checklist|check\s*list|todo\s*list)\b)/i;
  const explicitChecklistMatch = originalText.match(explicitChecklistRegex);
  if (explicitChecklistMatch) {
    explicitChecklistLanguage = true;
    checklistPrefix = explicitChecklistMatch[0];
  }

  let explicitTaskLanguage = false;
  const explicitTaskRegex =
    /^(?:(?:create|add|make|start)\s+(?:a\s+)?(?:new\s+)?task\b|(?:new\s+)?task\s*[:—\-]?)/i;
  const explicitTaskMatch = originalText.match(explicitTaskRegex);
  if (explicitTaskMatch) {
    explicitTaskLanguage = true;
  }

  let explicitHabitLanguage = false;
  const explicitHabitRegex =
    /^(?:(?:create|add|make|start)\s+(?:a\s+)?(?:new\s+)?habit\b|(?:new\s+)?habit\s*[:—\-]?)/i;
  const explicitHabitMatch = originalText.match(explicitHabitRegex);
  if (explicitHabitMatch) {
    explicitHabitLanguage = true;
  }

  // 3. Temporal Signals
  const matchedTemporalPhrases: string[] = [];
  let recurrence: ParsedProductivityItem["recurrence"] = undefined;
  let repeatType: "daily" | "weekdays" | "weekly" | "monthly" | "interval" | undefined;
  let repeatInterval: number | undefined;
  let repeatUnit: "hours" | "days" | undefined;
  let repeatDays: number[] | undefined;
  let repeatDayOfMonth: number | undefined;
  let timeStr: string | undefined;
  let dateStr: string | undefined;

  const intervalHoursRegex = /\bevery\s+(\d+)\s+hours?\b/i;
  const everyHourRegex = /\b(?:every\s+hour|hourly)\b/i;
  const intervalDaysRegex = /\bevery\s+(\d+)\s+days?\b/i;
  const monthlyOnDayRegex = /\bevery\s+month\s+(?:on\s+)?(?:the\s+)?(\d+)(?:st|nd|rd|th)?\b/i;
  const monthlyDefaultRegex = /\b(?:every\s+month|monthly)\b/i;
  const weekdaysRegex = /\b(?:every\s+weekday|weekdays)\b/i;
  const weekendsRegex = /\b(?:every\s+weekend|weekends)\b/i;

  let temporalTextWorking = originalText;

  if (intervalHoursRegex.test(temporalTextWorking)) {
    const match = temporalTextWorking.match(intervalHoursRegex);
    if (match) {
      repeatType = "interval";
      repeatInterval = Number(match[1]);
      repeatUnit = "hours";
      matchedTemporalPhrases.push(match[0]);
      temporalTextWorking = temporalTextWorking.replace(match[0], "");
    }
  } else if (everyHourRegex.test(temporalTextWorking)) {
    const match = temporalTextWorking.match(everyHourRegex);
    if (match) {
      repeatType = "interval";
      repeatInterval = 1;
      repeatUnit = "hours";
      matchedTemporalPhrases.push(match[0]);
      temporalTextWorking = temporalTextWorking.replace(match[0], "");
    }
  } else if (intervalDaysRegex.test(temporalTextWorking)) {
    const match = temporalTextWorking.match(intervalDaysRegex);
    if (match) {
      repeatType = "interval";
      repeatInterval = Number(match[1]);
      repeatUnit = "days";
      matchedTemporalPhrases.push(match[0]);
      temporalTextWorking = temporalTextWorking.replace(match[0], "");
    }
  } else if (monthlyOnDayRegex.test(temporalTextWorking)) {
    const match = temporalTextWorking.match(monthlyOnDayRegex);
    if (match) {
      repeatType = "monthly";
      repeatDayOfMonth = Number(match[1]);
      matchedTemporalPhrases.push(match[0]);
      temporalTextWorking = temporalTextWorking.replace(match[0], "");
    }
  } else if (monthlyDefaultRegex.test(temporalTextWorking)) {
    const match = temporalTextWorking.match(monthlyDefaultRegex);
    if (match) {
      repeatType = "monthly";
      repeatDayOfMonth = new Date().getDate();
      matchedTemporalPhrases.push(match[0]);
      temporalTextWorking = temporalTextWorking.replace(match[0], "");
    }
  } else if (weekdaysRegex.test(temporalTextWorking)) {
    const match = temporalTextWorking.match(weekdaysRegex);
    if (match) {
      repeatType = "weekdays";
      repeatDays = [1, 2, 3, 4, 5];
      matchedTemporalPhrases.push(match[0]);
      temporalTextWorking = temporalTextWorking.replace(match[0], "");
    }
  } else if (weekendsRegex.test(temporalTextWorking)) {
    const match = temporalTextWorking.match(weekendsRegex);
    if (match) {
      repeatType = "weekly";
      repeatDays = [0, 6];
      matchedTemporalPhrases.push(match[0]);
      temporalTextWorking = temporalTextWorking.replace(match[0], "");
    }
  } else {
    const intervalWeeksRegex = /\bevery\s+(\d+)\s*(?:weeks?|wks?)\b/i;
    let isIntervalWeeksMatched = false;
    if (intervalWeeksRegex.test(temporalTextWorking)) {
      const match = temporalTextWorking.match(intervalWeeksRegex);
      if (match) {
        repeatType = "weekly";
        repeatInterval = Number(match[1]);
        repeatUnit = undefined;
        repeatDays = [new Date().getDay()];
        matchedTemporalPhrases.push(match[0]);
        temporalTextWorking = temporalTextWorking.replace(match[0], "");
        isIntervalWeeksMatched = true;

        const onDaysMatch = temporalTextWorking.match(/^\s*on\s+([a-z\s,and&]+)\b/i);
        if (onDaysMatch) {
          const words = onDaysMatch[1].toLowerCase().split(/[\s,]+/);
          const matchedDays: number[] = [];
          words.forEach(w => {
            const cleanWord = w.replace(/[^\w]/g, "");
            if (weekdayMap[cleanWord] !== undefined) {
              matchedDays.push(weekdayMap[cleanWord]);
            }
          });
          if (matchedDays.length > 0) {
            repeatDays = Array.from(new Set(matchedDays)).sort((a, b) => a - b);
            matchedTemporalPhrases.push(onDaysMatch[0]);
            temporalTextWorking = temporalTextWorking.replace(onDaysMatch[0], "");
          }
        }
      }
    }

    let isWeeklyMatched = false;
    if (!isIntervalWeeksMatched) {
      const weeklyMatch = temporalTextWorking.match(/\bevery\s+([a-z\s,and&]+)\b/i);
      if (weeklyMatch) {
        const words = weeklyMatch[1].toLowerCase().split(/[\s,]+/);
        const matchedDays: number[] = [];
        words.forEach(w => {
          const cleanWord = w.replace(/[^\w]/g, "");
          if (weekdayMap[cleanWord] !== undefined) {
            matchedDays.push(weekdayMap[cleanWord]);
          }
        });
        if (matchedDays.length > 0) {
          repeatType = "weekly";
          repeatDays = Array.from(new Set(matchedDays)).sort((a, b) => a - b);
          matchedTemporalPhrases.push(weeklyMatch[0]);
          temporalTextWorking = temporalTextWorking.replace(weeklyMatch[0], "");
          isWeeklyMatched = true;
        }
      }
    }
    
    if (!isIntervalWeeksMatched && !isWeeklyMatched) {
      const everyWeekMatch = temporalTextWorking.match(/\bevery\s+week\b/i);
      if (everyWeekMatch) {
        repeatType = "weekly";
        repeatDays = [new Date().getDay()];
        matchedTemporalPhrases.push(everyWeekMatch[0]);
        temporalTextWorking = temporalTextWorking.replace(everyWeekMatch[0], "");
      } else {
        const adverbialWeekly = temporalTextWorking.match(/\bweekly(?:\s+(?:at|from|before|after|in|around|on)\b|[\s,.]*$)/i);
        if (adverbialWeekly && !/\b(?:called|named)\s+["']?weekly/i.test(temporalTextWorking)) {
          repeatType = "weekly";
          repeatDays = [new Date().getDay()];
          matchedTemporalPhrases.push("weekly");
          temporalTextWorking = temporalTextWorking.replace(/\bweekly\b/i, "");
        } else {
          const dailyDirective = temporalTextWorking.match(/\b(?:every\s+day|daily)\b/i);
          let matchedDaily = dailyDirective ? dailyDirective[0] : null;
          if (!matchedDaily) {
            const adverbialEveryday = temporalTextWorking.match(/\beveryday(?:\s+(?:at|from|before|after|in|around)\b|[\s,.]*$)/i);
            if (adverbialEveryday && !/\b(?:called|named)\s+["']?everyday/i.test(temporalTextWorking)) {
              matchedDaily = "everyday";
            }
          }
          if (matchedDaily) {
            repeatType = "daily";
            matchedTemporalPhrases.push(matchedDaily);
            temporalTextWorking = temporalTextWorking.replace(new RegExp(`\\b${matchedDaily}\\b`, "i"), "");
          } else if (/\bevery\s+morning\b/i.test(temporalTextWorking)) {
            const match = temporalTextWorking.match(/\bevery\s+morning\b/i);
            if (match) {
              repeatType = "daily";
              timeStr = "08:00";
              matchedTemporalPhrases.push(match[0]);
              temporalTextWorking = temporalTextWorking.replace(match[0], "");
            }
          } else if (/\bevery\s+(evening|night)\b/i.test(temporalTextWorking)) {
            const match = temporalTextWorking.match(/\bevery\s+(evening|night)\b/i);
            if (match) {
              repeatType = "daily";
              timeStr = "18:00";
              matchedTemporalPhrases.push(match[0]);
              temporalTextWorking = temporalTextWorking.replace(match[0], "");
            }
          }
        }
      }
    }
  }

  if (repeatType) {
    recurrence = {
      type: repeatType,
      interval: repeatInterval,
      unit: repeatUnit,
      days: repeatDays,
      dayOfMonth: repeatDayOfMonth,
    };
  }

  // Reminder Offset & Explicit Reminders
  let reminderOffsetMinutes: number | undefined;
  let explicitReminder = false;
  let reminderTime: string | undefined;

  const reminderOffsetRegex = /\b(?:remind|alert)(?:\s+me)?\s+(\d+)\s*(mins|min|minute|minutes|hour|hours|hr|hrs|h)\s*(?:before|prior)\b/i;
  const reminderOffsetMatch = temporalTextWorking.match(reminderOffsetRegex);
  if (reminderOffsetMatch) {
    const num = Number(reminderOffsetMatch[1]);
    const unit = reminderOffsetMatch[2].toLowerCase();
    reminderOffsetMinutes = unit.startsWith("h") ? num * 60 : num;
    explicitReminder = true;
    matchedTemporalPhrases.push(reminderOffsetMatch[0]);
    temporalTextWorking = temporalTextWorking.replace(reminderOffsetMatch[0], "");
  }

  // Explicit reminder at specific time (e.g., "remind me at 7 PM", "alert at 7:30pm")
  const reminderTimeRegex = /\b(?:remind|alert|notify)(?:\s+me)?\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2}:\d{2})\b/i;
  const reminderTimeMatch = temporalTextWorking.match(reminderTimeRegex);
  if (reminderTimeMatch) {
    const rawTime = reminderTimeMatch[1];
    const parsedDate = chrono.parseDate(rawTime);
    if (parsedDate) {
      reminderTime = formatTime(parsedDate);
    } else {
      const timeRegexes = [
        { pattern: /^(\d{1,2})pm$/i, offset: 12 },
        { pattern: /^(\d{1,2})am$/i, offset: 0 },
        { pattern: /^(\d{1,2}):(\d{2})pm$/i, offset: 12 },
        { pattern: /^(\d{1,2}):(\d{2})am$/i, offset: 0 },
      ];
      for (const tr of timeRegexes) {
        const match = rawTime.match(tr.pattern);
        if (match) {
          let h = Number(match[1]);
          const m = match[2] ? Number(match[2]) : 0;
          if (tr.offset === 12 && h < 12) h += 12;
          if (tr.offset === 0 && h === 12) h = 0;
          reminderTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          break;
        }
      }
    }
    if (reminderTime) {
      explicitReminder = true;
      matchedTemporalPhrases.push(reminderTimeMatch[0]);
      temporalTextWorking = temporalTextWorking.replace(reminderTimeMatch[0], "");
    }
  }

  // Explicit no-reminder keyword (e.g., "no reminder", "without reminder", "don't remind me", "no alert")
  let explicitNoReminder = false;
  const noReminderRegex = /\b(?:no\s+reminder|without\s+(?:a\s+)?reminder|don'?t\s+remind(?:\s+me)?|no\s+alert)\b/i;
  const noReminderMatch = temporalTextWorking.match(noReminderRegex);
  if (noReminderMatch) {
    explicitNoReminder = true;
    matchedTemporalPhrases.push(noReminderMatch[0]);
    temporalTextWorking = temporalTextWorking.replace(noReminderMatch[0], "");
  }

  // Explicit reminder keyword (e.g. "remind me to...", "set a reminder to...")
  const explicitReminderKeywordRegex = /\b(?:remind(?:\s+me)?(?:\s+to)?|set\s+(?:a\s+)?reminder(?:\s+to)?|alert(?:\s+me)?(?:\s+to)?|notify(?:\s+me)?(?:\s+to)?)\b/i;
  const explicitReminderKeywordMatch = temporalTextWorking.match(explicitReminderKeywordRegex);
  if (explicitReminderKeywordMatch && !explicitNoReminder) {
    explicitReminder = true;
    matchedTemporalPhrases.push(explicitReminderKeywordMatch[0]);
    temporalTextWorking = temporalTextWorking.replace(explicitReminderKeywordMatch[0], "");
  }

  // Duration parsing (e.g. "for 45 minutes", "for 90 mins", "for 2 hours", "for 1 hr", "duration 45 minutes")
  let durationMinutes: number | undefined;
  const durationRegex = /\b(?:for|duration:?)\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b(?!\s*(?:before|prior|ago))/i;
  const durationMatch = temporalTextWorking.match(durationRegex);
  if (durationMatch) {
    const num = parseFloat(durationMatch[1]);
    const unit = durationMatch[2].toLowerCase();
    if (!isNaN(num) && num > 0) {
      durationMinutes = unit.startsWith("h") ? Math.round(num * 60) : Math.round(num);
      matchedTemporalPhrases.push(durationMatch[0]);
      temporalTextWorking = temporalTextWorking.replace(durationMatch[0], "");
    }
  }

  // Chrono & Date/Time parsing
  try {
    const chronoResults = chrono.parse(temporalTextWorking);
    if (chronoResults.length > 0) {
      for (const result of chronoResults) {
        // Guard against bare "weekend" without temporal qualifiers (e.g. "Weekend Packing", "Weekend Trip")
        if (
          result.text.toLowerCase() === "weekend" &&
          !/\b(?:this|next|on|over|during|for\s+(?:the\s+)?|every)\s+weekend\b/i.test(temporalTextWorking)
        ) {
          continue;
        }

        // Guard against possessive temporal tokens (e.g., "tomorrow's trip", "today's meeting")
        // where a temporal noun is used as a possessive modifier rather than an execution deadline.
        const charAfterMatch = temporalTextWorking.slice(result.index + result.text.length);
        if (/^['’]s\b/i.test(charAfterMatch)) {
          continue;
        }

        const parsedDate = result.start.date();
        dateStr = dateKeyFromDate(parsedDate);

        if (result.start.isCertain("hour")) {
          timeStr = formatTime(parsedDate);
        } else {
          const timeRegexes = [
            { pattern: /\b(\d{1,2})pm\b/i, offset: 12 },
            { pattern: /\b(\d{1,2})am\b/i, offset: 0 },
            { pattern: /\b(\d{1,2}):(\d{2})pm\b/i, offset: 12 },
            { pattern: /\b(\d{1,2}):(\d{2})am\b/i, offset: 0 },
            { pattern: /\bnoon\b/i, hour: 12, min: 0 },
            { pattern: /\bmidnight\b/i, hour: 0, min: 0 },
          ];

          for (const tr of timeRegexes) {
            const match = temporalTextWorking.match(tr.pattern);
            if (match) {
              if ("hour" in tr) {
                timeStr = `${String(tr.hour).padStart(2, "0")}:${String(tr.min).padStart(2, "0")}`;
              } else {
                let h = Number(match[1]);
                const m = match[2] ? Number(match[2]) : 0;
                if (tr.offset === 12 && h < 12) h += 12;
                if (tr.offset === 0 && h === 12) h = 0;
                timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
              }
              break;
            }
          }
        }
        matchedTemporalPhrases.push(result.text);
      }
    } else {
      const todayRegex = /\btoday\b(?!['’]s)/i;
      const tomorrowRegex = /\btomorrow\b(?!['’]s)/i;
      if (todayRegex.test(temporalTextWorking)) {
        dateStr = dateKeyFromDate(new Date());
        matchedTemporalPhrases.push("today");
      } else if (tomorrowRegex.test(temporalTextWorking)) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateStr = dateKeyFromDate(tomorrow);
        matchedTemporalPhrases.push("tomorrow");
      }
    }
  } catch (err) {
    console.warn("Chrono parsing failed, falling back to regex: ", err);
  }

  // 4. Metadata Signals
  let category: ProductivitySignals["metadata"]["category"] = undefined;
  for (const [catName, keywords] of Object.entries(CATEGORY_MAP)) {
    const hasKeyword = keywords.some(keyword => {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const startBoundary = /^\w/.test(keyword) ? '\\b' : '';
      const endBoundary = /\w$/.test(keyword) ? '\\b' : '';
      const regex = new RegExp(`${startBoundary}${escaped}${endBoundary}`, "i");
      return regex.test(originalText);
    });

    if (hasKeyword) {
      category = catName as any;
      break;
    }
  }

  let priority: ProductivitySignals["metadata"]["priority"] = undefined;
  let matchedPriorityPhrase: string | undefined;
  for (const [prio, keywords] of Object.entries(PRIORITY_MAP)) {
    for (const keyword of keywords) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const startBoundary = /^\w/.test(keyword) ? '\\b' : '';
      const endBoundary = /\w$/.test(keyword) ? '\\b' : '';
      const regex = new RegExp(`${startBoundary}${escaped}${endBoundary}`, "i");
      if (regex.test(originalText)) {
        priority = prio as "high" | "medium" | "low";
        matchedPriorityPhrase = keyword;
        break;
      }
    }
    if (priority) break;
  }

  return {
    structural: {
      url,
      urlDomain,
      isMultiline,
      lineCount,
      hasBulletList,
      hasNumberedList,
      bulletItems,
      plainListCandidate,
      plainListItems,
      isLongProse,
      lines,
    },
    semantic: {
      actionKeywords: matchedActions,
      routineKeywords: matchedRoutines,
      hasStrongAction: matchedActions.length > 0,
      hasStrongRoutine: matchedRoutines.length > 0,
      ideaLanguage,
      ideaPrefix,
      noteLanguage,
      notePrefixOrSuffix,
      explicitChecklistLanguage,
      checklistPrefix,
      explicitTaskLanguage,
      explicitHabitLanguage,
    },
    temporal: {
      date: dateStr,
      time: timeStr,
      durationMinutes,
      hasDate: !!dateStr,
      hasTime: !!timeStr,
      recurrence,
      hasRecurrence: !!recurrence,
      reminderOffsetMinutes,
      explicitReminder: explicitNoReminder ? false : explicitReminder ? true : undefined,
      reminderTime,
      matchedTemporalPhrases,
    },
    metadata: {
      category,
      priority,
      matchedPriorityPhrase,
    },
  };
}

// ─── STEP 2: Intent Ranking & Selection ─────────────────────────────────────

/**
 * Scores and ranks candidate intents using extracted signals.
 */
export function rankCandidateIntents(
  signals: ProductivitySignals,
  originalText: string,
): IntentRankingResult {
  const scores: Record<CandidateIntentType, number> = {
    link: 0.0,
    checklist: 0.0,
    habit: 0.0,
    task: 0.0,
    idea: 0.0,
    note: 0.0,
  };

  // 1. Link Score (Structural URL)
  if (signals.structural.url) {
    scores.link = 0.95;
  }

  // 2. Checklist Score (Multiline / Bullets / Numbered)
  if (signals.structural.hasBulletList || signals.structural.hasNumberedList) {
    scores.checklist = 0.90;
  } else if (signals.structural.plainListCandidate) {
    scores.checklist = 0.80;
  } else if (signals.semantic.explicitChecklistLanguage) {
    scores.checklist = 0.88;
  }

  // 3. Idea Score (Explicit Idea Language)
  if (signals.semantic.ideaLanguage) {
    scores.idea = 0.85;
  }

  // 4. Note Score (Explicit Note Language or Long Prose)
  if (signals.semantic.noteLanguage) {
    scores.note = 0.85;
  } else if (signals.structural.isLongProse) {
    scores.note = 0.70;
  }

  // 5. Explicit Task & Habit Command Signals
  if (signals.semantic.explicitTaskLanguage) {
    scores.task = 0.90;
  }
  if (signals.semantic.explicitHabitLanguage) {
    scores.habit = 0.92;
  }

  // 6. Habit vs Task Scoring
  if (signals.temporal.hasRecurrence) {
    // Has explicit recurrence pattern (e.g. "every morning", "weekdays", "every Sunday", "every month on the 15th")
    const isWorkDeliverable =
      signals.semantic.actionKeywords.includes("submit") ||
      signals.semantic.actionKeywords.includes("report") ||
      signals.semantic.actionKeywords.includes("assignment") ||
      signals.semantic.actionKeywords.includes("presentation") ||
      signals.semantic.actionKeywords.includes("client") ||
      signals.metadata.category === "work";

    if (isWorkDeliverable) {
      // Work deliverable with recurring deadline -> Task
      scores.task = 0.85;
      scores.habit = 0.40;
    } else if (
      signals.semantic.explicitChecklistLanguage ||
      signals.structural.hasBulletList ||
      signals.structural.hasNumberedList ||
      signals.structural.plainListCandidate
    ) {
      // Explicit checklist or multiline list with recurrence -> Checklist beats Habit
      scores.checklist = 0.92;
      scores.habit = 0.45;
      scores.task = 0.40;
    } else {
      // Habit or personal routine -> Habit (e.g. "Exercise every morning", "Buy milk every Sunday", "Meditate weekdays")
      scores.habit = 0.90;
      scores.task = 0.50;
    }
  } else {
    // No recurrence
    if (signals.temporal.hasDate || signals.temporal.hasTime) {
      // One-off date/time specified -> Task (e.g. "Buy milk tomorrow", "Exercise tomorrow", "Call John tomorrow at 7")
      scores.task = 0.85;
      scores.habit = 0.15;
    } else if (signals.semantic.hasStrongAction) {
      // If the input is just 1 word (e.g. "meeting", "exercise", "groceries"), it is ambiguous
      const words = originalText.trim().split(/\s+/);
      if (words.length <= 1) {
        scores.task = 0.55;
        scores.habit = 0.45;
      } else {
        // Action phrase present -> Task (e.g. "Buy milk", "Call mom", "Finish report")
        scores.task = 0.80;
        scores.habit = 0.20;
      }
    } else {
      // Short/ambiguous text without date/time/recurrence (e.g. "exercise", "groceries")
      scores.task = 0.55;
      scores.habit = 0.45;
    }
  }

  // Determine winning intent by ranking
  const intentOrder: CandidateIntentType[] = ["link", "checklist", "idea", "note", "habit", "task"];
  let topIntent: CandidateIntentType = "task";
  let maxScore = -1;

  for (const intent of intentOrder) {
    if (scores[intent] > maxScore) {
      maxScore = scores[intent];
      topIntent = intent;
    }
  }

  // Derive detectionSignal
  let detectionSignal: ParsedProductivityItem["detectionSignal"] = "default_task";
  if (topIntent === "link") {
    detectionSignal = "url_pattern";
  } else if (topIntent === "checklist") {
    detectionSignal = signals.structural.hasBulletList || signals.structural.hasNumberedList
      ? "multiline_bullets"
      : signals.semantic.explicitChecklistLanguage
        ? "keyword_checklist"
        : "multiline_short_lines";
  } else if (topIntent === "idea") {
    detectionSignal = "keyword_idea";
  } else if (topIntent === "note") {
    detectionSignal = "keyword_note";
  } else if (topIntent === "habit") {
    detectionSignal = "recurrence_routine";
  } else if (topIntent === "task") {
    if (signals.temporal.hasDate || signals.temporal.hasTime) {
      detectionSignal = "temporal_task";
    } else if (signals.semantic.hasStrongAction) {
      detectionSignal = "action_task";
    } else {
      detectionSignal = "default_task";
    }
  }

  return {
    topIntent,
    confidence: Math.round(maxScore * 100) / 100,
    detectionSignal,
    scores,
  };
}

// ─── STEP 3: Complete Parser ────────────────────────────────────────────────

/**
 * Main parseProductivityText function orchestrating signal extraction,
 * candidate intent ranking, and clean entity structure assembly.
 */
export function parseProductivityText(
  text: string,
  options?: ParseProductivityTextOptions,
): ParsedProductivityItem {
  if (!text || text.trim() === "") {
    const fallbackType = options?.explicitType || "task";
    return {
      type: fallbackType,
      title: fallbackType === "checklist" ? "Checklist" : "",
      items: fallbackType === "checklist" ? [] : undefined,
      confidence: 0.10,
    };
  }

  const originalText = text.trim();
  const signals = extractProductivitySignals(originalText);
  const ranking = rankCandidateIntents(signals, originalText);

  // If caller provided an explicit type override, it is authoritative
  if (options?.explicitType) {
    if (options.explicitType !== "file") {
      ranking.topIntent = options.explicitType;
    }
    ranking.confidence = 1.0;
    ranking.detectionSignal = "explicit_override";
  }

  let cleanedTitle = originalText;
  let checklistItems: string[] | undefined;
  let taskDescription: string | undefined;
  let checklistConfidence: "high" | "medium" | undefined;
  let detectedUrl: string | undefined;

  switch (ranking.topIntent) {
    case "link": {
      detectedUrl = signals.structural.url;
      const titleWithoutUrl = originalText.replace(signals.structural.url || "", "").trim();
      if (titleWithoutUrl.length > 0) {
        cleanedTitle = titleWithoutUrl;
      } else {
        cleanedTitle = signals.structural.urlDomain || detectedUrl || originalText;
      }
      break;
    }

    case "checklist": {
      const firstLine = signals.structural.lines[0] || "Checklist";
      const isTitleLine = !(/^[-*•]\s/.test(firstLine) || /^\d+[.)\s]/.test(firstLine));
      if (isTitleLine) {
        let working = firstLine.replace(/:$/, "").replace(/—$/, "").trim();
        const explicitChecklistPrefixRegex =
          /^(?:(?:create|add|make|start)\s+(?:a\s+)?(?:new\s+)?(?:checklist|check\s*list|todo\s*list)(?:\s+(?:called|named|for|about))?|(?:new\s+)?(?:checklist|check\s*list|todo\s*list)\s*(?:[:—\-]|called\b|named\b|for\b|about\b)?)\s*/i;
        working = working.replace(explicitChecklistPrefixRegex, "");

        for (const phrase of signals.temporal.matchedTemporalPhrases) {
          if (!phrase || !phrase.trim()) continue;
          const escaped = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const startBoundary = /^\w/.test(phrase.trim()) ? '\\b' : '';
          const endBoundary = /\w$/.test(phrase.trim()) ? "(?!['’]s)\\b" : '';
          const regex = new RegExp(`${startBoundary}${escaped}${endBoundary}`, "gi");
          working = working.replace(regex, "");
        }
        if (signals.metadata.matchedPriorityPhrase) {
          const escaped = signals.metadata.matchedPriorityPhrase.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const startBoundary = /^\w/.test(signals.metadata.matchedPriorityPhrase.trim()) ? '\\b' : '';
          const endBoundary = /\w$/.test(signals.metadata.matchedPriorityPhrase.trim()) ? "(?!['’]s)\\b" : '';
          const regex = new RegExp(`${startBoundary}${escaped}${endBoundary}`, "gi");
          working = working.replace(regex, "");
        }
        working = working.replace(explicitChecklistPrefixRegex, "");

        let prev = "";
        let cleanedWorking = working;
        while (cleanedWorking !== prev) {
          prev = cleanedWorking;
          cleanedWorking = cleanedWorking
            .replace(/\s+/g, " ")
            .replace(/^[,;:\s]+|[,;:\s]+$/g, "")
            .trim()
            .replace(/^(at|on|by|for|to|with|in|and|&)\s+/i, "")
            .replace(/\s+(at|on|by|for|to|with|in|and|&)$/i, "")
            .replace(/^[,;:\s]+|[,;:\s]+$/g, "")
            .trim();
        }
        cleanedTitle = cleanedWorking.length > 0 && !/^(and|&)$/i.test(cleanedWorking) ? cleanedWorking : "Checklist";
      } else {
        cleanedTitle = "Checklist";
      }
      checklistItems = signals.structural.bulletItems || signals.structural.plainListItems || (signals.structural.lines.length > 1 ? signals.structural.lines.slice(1) : []);
      checklistConfidence = signals.structural.hasBulletList || signals.structural.hasNumberedList ? "high" : "medium";
      break;
    }

    case "idea": {
      cleanedTitle = originalText
        .replace(/^(idea:|idea\s+|thought:|thought\s+|concept:|concept\s+|what if\s+)/i, "")
        .trim();
      break;
    }

    case "note": {
      cleanedTitle = originalText
        .replace(/^(notes on\s+|note:\s*|note\s+|thoughts on\s+)/i, "")
        .replace(/\s+notes$/i, "")
        .trim();
      break;
    }

    case "habit":
    case "task": {
      const firstLine = signals.structural.lines[0] || originalText;
      let working = firstLine;

      const explicitPrefixRegex =
        ranking.topIntent === "habit"
          ? /^(?:(?:create|add|make|start)\s+(?:a\s+)?(?:new\s+)?habit(?:\s+(?:called|named|for|about|to))?|(?:new\s+)?habit\s*[:—\-]?)\s*/i
          : /^(?:(?:create|add|make|start)\s+(?:a\s+)?(?:new\s+)?task(?:\s+(?:called|named|for|about|to))?|(?:new\s+)?task\s*[:—\-]?)\s*/i;
      working = working.replace(explicitPrefixRegex, "");

      for (const phrase of signals.temporal.matchedTemporalPhrases) {
        if (!phrase || !phrase.trim()) continue;
        const escaped = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const startBoundary = /^\w/.test(phrase.trim()) ? '\\b' : '';
        const endBoundary = /\w$/.test(phrase.trim()) ? "(?!['’]s)\\b" : '';
        const regex = new RegExp(`${startBoundary}${escaped}${endBoundary}`, "gi");
        working = working.replace(regex, "");
      }
      if (signals.metadata.matchedPriorityPhrase) {
        const escaped = signals.metadata.matchedPriorityPhrase.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const startBoundary = /^\w/.test(signals.metadata.matchedPriorityPhrase.trim()) ? '\\b' : '';
        const endBoundary = /\w$/.test(signals.metadata.matchedPriorityPhrase.trim()) ? "(?!['’]s)\\b" : '';
        const regex = new RegExp(`${startBoundary}${escaped}${endBoundary}`, "gi");
        working = working.replace(regex, "");
      }
      working = working.replace(explicitPrefixRegex, "");

      let prev = "";
      let cleanedWorking = working;
      while (cleanedWorking !== prev) {
        prev = cleanedWorking;
        cleanedWorking = cleanedWorking
          .replace(/\s+/g, " ")
          .replace(/^[,;:\s]+|[,;:\s]+$/g, "")
          .trim()
          .replace(/^(at|on|by|for|to|with|in|and|&)\s+/i, "")
          .replace(/\s+(at|on|by|for|to|with|in|and|&)$/i, "")
          .replace(/^[,;:\s]+|[,;:\s]+$/g, "")
          .trim();
      }
      const defaultFallback = ranking.topIntent === "habit" ? "Habit" : "Task";
      cleanedTitle = cleanedWorking.length > 0 && !/^(and|&)$/i.test(cleanedWorking) ? cleanedWorking : defaultFallback;

      if (signals.structural.isMultiline && signals.structural.lines.length > 1) {
        taskDescription = signals.structural.lines.slice(1).join("\n");
      }
      break;
    }
  }

  // Title formatting and cleanup
  let prevTitle = "";
  while (cleanedTitle !== prevTitle) {
    prevTitle = cleanedTitle;
    cleanedTitle = cleanedTitle
      .replace(/\s+/g, " ")
      .replace(/^[,;:\s]+|[,;:\s]+$/g, "")
      .trim()
      .replace(/^(at|on|by|for|to|with|in|and|&)\s+/i, "")
      .replace(/\s+(at|on|by|for|to|with|in|and|&)$/i, "")
      .replace(/^[,;:\s]+|[,;:\s]+$/g, "")
      .trim();
  }

  const winningType = options?.explicitType || ranking.topIntent;

  if (cleanedTitle.length === 0 || /^(and|&)$/i.test(cleanedTitle)) {
    cleanedTitle =
      winningType === "checklist"
        ? "Checklist"
        : winningType === "habit"
          ? "Habit"
          : winningType === "task"
            ? "Task"
            : winningType === "file"
              ? "Attachment"
              : originalText;
  } else if (winningType !== "link" && /^[a-z]/.test(cleanedTitle)) {
    cleanedTitle = cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1);
  }

  const isResource = winningType === "link" || winningType === "idea" || winningType === "note" || winningType === "file";

  return {
    type: winningType,
    title: cleanedTitle,
    description: taskDescription,
    date: isResource ? undefined : signals.temporal.date,
    time: isResource ? undefined : signals.temporal.time,
    durationMinutes: isResource ? undefined : signals.temporal.durationMinutes,
    category: isResource ? undefined : signals.metadata.category,
    priority: isResource ? undefined : signals.metadata.priority || "medium",
    priorityDetected: !!signals.metadata.priority,
    recurrence: isResource ? undefined : signals.temporal.recurrence,
    reminderOffsetMinutes: isResource ? undefined : signals.temporal.reminderOffsetMinutes,
    explicitReminder: isResource ? undefined : signals.temporal.explicitReminder,
    reminderTime: isResource ? undefined : signals.temporal.reminderTime,
    confidence: ranking.confidence,
    items: ranking.topIntent === "checklist" ? (checklistItems || []) : undefined,
    url: detectedUrl,
    detectionSignal: ranking.detectionSignal,
    checklistConfidence,
  };
}
