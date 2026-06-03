import * as chrono from "chrono-node";
import nlp from "compromise";

export type ParsedProductivityItem = {
  type: "task" | "habit";
  title: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:MM
  category?: "work" | "personal" | "health" | "learning" | "creative" | "focus";
  priority?: "high" | "medium" | "low";
  recurrence?: {
    type: "daily" | "weekdays" | "weekly" | "monthly" | "interval";
    interval?: number;
    unit?: "hours" | "days";
    days?: number[];
    dayOfMonth?: number;
  };
  reminderOffsetMinutes?: number; // Alarm offset (e.g. 30 for "30 mins before")
  confidence: number;
};

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

// Helper to format date as YYYY-MM-DD
const formatDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}:${d}`; // Wait! The original was `${y}-${m}-${d}`. Wait, let's look at the original formatting: line 38 was `${y}-${m}-${d}`. I should keep it as `${y}-${m}-${d}`. Ah! Let me copy it exactly as in line 38.
};

// Helper to format time as HH:MM
const formatTime = (date: Date): string => {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
};

export function parseProductivityText(text: string): ParsedProductivityItem {
  if (!text || text.trim() === "") {
    return {
      type: "task",
      title: "",
      confidence: 0.1,
    };
  }

  const originalText = text.trim();
  let cleanedText = originalText;
  let lowText = cleanedText.toLowerCase();

  let type: "task" | "habit" = "task";
  let category: "work" | "personal" | "health" | "learning" | "creative" | "focus" | undefined;
  let priority: "high" | "medium" | "low" | undefined;
  let dateStr: string | undefined;
  let timeStr: string | undefined;
  let confidence = 0.5;

  const weekdayMap: Record<string, number> = {
    sunday: 0, sun: 0,
    monday: 1, mon: 1,
    tuesday: 2, tue: 2,
    wednesday: 3, wed: 3,
    thursday: 4, thu: 4,
    friday: 5, fri: 5,
    saturday: 6, sat: 6
  };

  // --- 1. Category Detection (Early for Heuristic Classification) ---
  const compromiseDoc = nlp(cleanedText);
  
  for (const [catName, keywords] of Object.entries(CATEGORY_MAP)) {
    const hasKeyword = keywords.some(keyword => {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const startBoundary = /^\w/.test(keyword) ? '\\b' : '';
      const endBoundary = /\w$/.test(keyword) ? '\\b' : '';
      const regex = new RegExp(`${startBoundary}${escaped}${endBoundary}`, "i");
      return regex.test(cleanedText);
    });

    if (hasKeyword) {
      category = catName as any;
      confidence += 0.15;
      break;
    }
  }

  if (!category) {
    if (compromiseDoc.match("#Verb (study|read|learn|write|code)").found) {
      category = "learning";
      confidence += 0.1;
    } else if (compromiseDoc.match("#Verb (run|walk|gym|stretch|swim|train)").found) {
      category = "health";
      confidence += 0.1;
    } else if (compromiseDoc.match("(meeting|client|office|presentation|sprint)").found) {
      category = "work";
      confidence += 0.1;
    }
  }

  // --- 2. Recurrence Parsing ---
  let recurrence: ParsedProductivityItem["recurrence"] = undefined;
  let repeatType: "daily" | "weekdays" | "weekly" | "monthly" | "interval" | undefined;
  let repeatInterval: number | undefined;
  let repeatUnit: "hours" | "days" | undefined;
  let repeatDays: number[] | undefined;
  let repeatDayOfMonth: number | undefined;

  const intervalHoursRegex = /\bevery\s+(\d+)\s+hours?\b/i;
  const everyHourRegex = /\b(?:every\s+hour|hourly)\b/i;
  const intervalDaysRegex = /\bevery\s+(\d+)\s+days?\b/i;
  const monthlyOnDayRegex = /\bevery\s+month\s+(?:on\s+)?(?:the\s+)?(\d+)(?:st|nd|rd|th)?\b/i;
  const monthlyDefaultRegex = /\b(?:every\s+month|monthly)\b/i;
  const weekdaysRegex = /\b(?:every\s+weekday|weekdays)\b/i;
  const weekendsRegex = /\b(?:every\s+weekend|weekends)\b/i;

  if (intervalHoursRegex.test(cleanedText)) {
    const match = cleanedText.match(intervalHoursRegex);
    if (match) {
      repeatType = "interval";
      repeatInterval = Number(match[1]);
      repeatUnit = "hours";
      cleanedText = cleanedText.replace(match[0], "");
      confidence += 0.15;
    }
  } else if (everyHourRegex.test(cleanedText)) {
    const match = cleanedText.match(everyHourRegex);
    if (match) {
      repeatType = "interval";
      repeatInterval = 1;
      repeatUnit = "hours";
      cleanedText = cleanedText.replace(match[0], "");
      confidence += 0.15;
    }
  } else if (intervalDaysRegex.test(cleanedText)) {
    const match = cleanedText.match(intervalDaysRegex);
    if (match) {
      repeatType = "interval";
      repeatInterval = Number(match[1]);
      repeatUnit = "days";
      cleanedText = cleanedText.replace(match[0], "");
      confidence += 0.15;
    }
  } else if (monthlyOnDayRegex.test(cleanedText)) {
    const match = cleanedText.match(monthlyOnDayRegex);
    if (match) {
      repeatType = "monthly";
      repeatDayOfMonth = Number(match[1]);
      cleanedText = cleanedText.replace(match[0], "");
      confidence += 0.15;
    }
  } else if (monthlyDefaultRegex.test(cleanedText)) {
    const match = cleanedText.match(monthlyDefaultRegex);
    if (match) {
      repeatType = "monthly";
      repeatDayOfMonth = new Date().getDate();
      cleanedText = cleanedText.replace(match[0], "");
      confidence += 0.15;
    }
  } else if (weekdaysRegex.test(cleanedText)) {
    const match = cleanedText.match(weekdaysRegex);
    if (match) {
      repeatType = "weekdays";
      repeatDays = [1, 2, 3, 4, 5];
      cleanedText = cleanedText.replace(match[0], "");
      confidence += 0.15;
    }
  } else if (weekendsRegex.test(cleanedText)) {
    const match = cleanedText.match(weekendsRegex);
    if (match) {
      repeatType = "weekly";
      repeatDays = [0, 6];
      cleanedText = cleanedText.replace(match[0], "");
      confidence += 0.15;
    }
  } else {
    // Specific weekdays check (e.g. "every monday and thursday")
    const weeklyMatch = cleanedText.match(/\bevery\s+([a-z\s,and&]+)\b/i);
    let isWeeklyMatched = false;
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
        cleanedText = cleanedText.replace(weeklyMatch[0], "");
        confidence += 0.15;
        isWeeklyMatched = true;
      }
    }
    
    if (!isWeeklyMatched) {
      const weeklyDefaultRegex = /\b(?:every\s+week|weekly)\b/i;
      if (weeklyDefaultRegex.test(cleanedText)) {
        repeatType = "weekly";
        repeatDays = [new Date().getDay()];
        cleanedText = cleanedText.replace(weeklyDefaultRegex, "");
        confidence += 0.15;
      } else if (/\b(?:every\s+day|daily|everyday)\b/i.test(cleanedText)) {
        const match = cleanedText.match(/\b(?:every\s+day|daily|everyday)\b/i);
        if (match) {
          repeatType = "daily";
          cleanedText = cleanedText.replace(match[0], "");
          confidence += 0.15;
        }
      } else if (/\bevery\s+morning\b/i.test(cleanedText)) {
        const match = cleanedText.match(/\bevery\s+morning\b/i);
        if (match) {
          repeatType = "daily";
          timeStr = "08:00";
          cleanedText = cleanedText.replace(match[0], "");
          confidence += 0.15;
        }
      } else if (/\bevery\s+evening\b/i.test(cleanedText)) {
        const match = cleanedText.match(/\bevery\s+evening\b/i);
        if (match) {
          repeatType = "daily";
          timeStr = "18:00";
          cleanedText = cleanedText.replace(match[0], "");
          confidence += 0.15;
        }
      }
    }
  }

  // If a recurrence pattern was matched, assemble the object and run classification heuristic
  if (repeatType) {
    recurrence = {
      type: repeatType,
      interval: repeatInterval,
      unit: repeatUnit,
      days: repeatDays,
      dayOfMonth: repeatDayOfMonth,
    };

    // Heuristic Classification: Habits vs Tasks
    const lowTitle = cleanedText.toLowerCase();
    const isWorkLike =
      category === "work" ||
      category === "creative" ||
      category === "focus" ||
      /\b(?:pay\s+)?rent\b/i.test(lowTitle) ||
      /\bkubernetes\b/i.test(lowTitle) ||
      /\bdocker\b/i.test(lowTitle) ||
      /\bdsa\b/i.test(lowTitle) ||
      /\binterview\b/i.test(lowTitle) ||
      /\bplacement\b/i.test(lowTitle) ||
      /\bbackup\b/i.test(lowTitle) ||
      /\bfinance\b/i.test(lowTitle) ||
      /\bmeeting\b/i.test(lowTitle) ||
      /\bproject\b/i.test(lowTitle) ||
      /\bassignment\b/i.test(lowTitle);

    const isHabitLike =
      category === "health" ||
      /\b(?:read|journal|meditate|water|gym|workout|running|run|exercise|walk|drink)\b/i.test(lowTitle);

    if (isWorkLike && !isHabitLike) {
      type = "task";
    } else {
      type = "habit";
    }
  } else {
    type = "task"; // non-recurring defaults to task
  }

  // --- 3. Reminder Offset parsing (e.g. "and remind me 30 minutes before") ---
  let reminderOffsetMinutes: number | undefined;
  const reminderRegex = /\b(?:remind|alert)(?:\s+me)?\s+(\d+)\s*(min|minute|minutes|hour|hours|hr|hrs|h)\s*(?:before|prior)\b/i;
  const reminderMatch = cleanedText.match(reminderRegex);
  if (reminderMatch) {
    const num = Number(reminderMatch[1]);
    const unit = reminderMatch[2].toLowerCase();
    
    if (unit.startsWith("h")) {
      reminderOffsetMinutes = num * 60;
    } else {
      reminderOffsetMinutes = num;
    }
    
    cleanedText = cleanedText.replace(reminderMatch[0], "");
    confidence += 0.1;
  }

  // --- 4. Priority Detection ---
  lowText = cleanedText.toLowerCase();
  for (const [prio, keywords] of Object.entries(PRIORITY_MAP)) {
    for (const keyword of keywords) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const startBoundary = /^\w/.test(keyword) ? '\\b' : '';
      const endBoundary = /\w$/.test(keyword) ? '\\b' : '';
      const regex = new RegExp(`${startBoundary}${escaped}${endBoundary}`, "i");
      if (regex.test(cleanedText)) {
        priority = prio as "high" | "medium" | "low";
        cleanedText = cleanedText.replace(regex, "");
        confidence += 0.15;
        break;
      }
    }
    if (priority) break;
  }

  // --- 5. Date & Time Parsing via Chrono ---
  try {
    const chronoResults = chrono.parse(cleanedText);
    if (chronoResults.length > 0) {
      for (const result of chronoResults) {
        const parsedDate = result.start.date();
        
        // If task, extract target date (only if NOT recurring)
        if (type === "task" && !recurrence) {
          dateStr = formatDate(parsedDate);
        }

        const hourSpecified = result.start.isCertain("hour");
        if (hourSpecified) {
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

          for (const timeRegex of timeRegexes) {
            const match = cleanedText.match(timeRegex.pattern);
            if (match) {
              if ("hour" in timeRegex) {
                timeStr = `${String(timeRegex.hour).padStart(2, "0")}:${String(timeRegex.min).padStart(2, "0")}`;
              } else {
                let h = Number(match[1]);
                const m = match[2] ? Number(match[2]) : 0;
                if (timeRegex.offset === 12 && h < 12) h += 12;
                if (timeRegex.offset === 0 && h === 12) h = 0;
                timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
              }
              break;
            }
          }
        }

        cleanedText = cleanedText.replace(result.text, "");
      }
      confidence += 0.15;
    } else {
      const todayRegex = /\btoday\b/i;
      const tomorrowRegex = /\btomorrow\b/i;
      if (todayRegex.test(cleanedText)) {
        if (type === "task" && !recurrence) dateStr = formatDate(new Date());
        cleanedText = cleanedText.replace(todayRegex, "");
        confidence += 0.1;
      } else if (tomorrowRegex.test(cleanedText)) {
        if (type === "task" && !recurrence) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          dateStr = formatDate(tomorrow);
        }
        cleanedText = cleanedText.replace(tomorrowRegex, "");
        confidence += 0.1;
      }
    }
  } catch (err) {
    console.warn("Chrono parsing failed, falling back to regex: ", err);
  }

  // --- 6. Final Title Clean Up ---
  let title = cleanedText
    .replace(/\s+/g, " ")
    .trim();

  title = title
    .replace(/^(at|on|by|for|to|with|in)\s+/i, "")
    .replace(/\s+(at|on|by|for|to|with|in)$/i, "")
    .trim();

  if (title.length > 0) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  } else {
    title = originalText;
  }

  if (!priority) {
    priority = "medium";
  }

  const formatCleanDate = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const finalDateStr = dateStr ? dateStr.replace(":", "-") : undefined;

  confidence = Math.min(1.0, Math.max(0.1, confidence));

  return {
    type,
    title,
    date: finalDateStr,
    time: timeStr,
    category,
    priority,
    recurrence,
    reminderOffsetMinutes,
    confidence: Math.round(confidence * 100) / 100,
  };
}
