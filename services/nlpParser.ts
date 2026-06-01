import * as chrono from "chrono-node";
import nlp from "compromise";

export type ParsedProductivityItem = {
  type: "task" | "habit";
  title: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:MM
  category?: "work" | "personal" | "health" | "learning" | "creative" | "focus";
  priority?: "high" | "medium" | "low";
  recurrence?: "daily" | "weekdays" | "weekends" | "none";
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
  return `${y}-${m}-${d}`;
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
  let recurrence: "daily" | "weekdays" | "weekends" | "none" = "none";
  let category: "work" | "personal" | "health" | "learning" | "creative" | "focus" | undefined;
  let priority: "high" | "medium" | "low" | undefined;
  let dateStr: string | undefined;
  let timeStr: string | undefined;
  let confidence = 0.5;

  // 1. Habit Detection & Recurrence Stripping
  const habitKeywords = [
    { pattern: /\bdaily\b/gi, type: "daily" as const },
    { pattern: /\bevery day\b/gi, type: "daily" as const },
    { pattern: /\beveryday\b/gi, type: "daily" as const },
    { pattern: /\bevery morning\b/gi, type: "daily" as const, time: "08:00" },
    { pattern: /\bevery evening\b/gi, type: "daily" as const, time: "18:00" },
    { pattern: /\bweekdays\b/gi, type: "weekdays" as const },
    { pattern: /\bweekends\b/gi, type: "weekends" as const },
    { pattern: /\bevery weekday\b/gi, type: "weekdays" as const },
    { pattern: /\bevery weekend\b/gi, type: "weekends" as const },
  ];

  for (const habitRule of habitKeywords) {
    if (habitRule.pattern.test(cleanedText)) {
      type = "habit";
      recurrence = habitRule.type;
      if (habitRule.time) {
        timeStr = habitRule.time;
      }
      cleanedText = cleanedText.replace(habitRule.pattern, "");
      confidence += 0.15;
      break; // Match first matching habit rule
    }
  }

  // Handle generic "every ..." recurrence
  if (type !== "habit" && /\bevery\b/gi.test(cleanedText)) {
    // If it says "every monday", "every gym session" etc
    type = "habit";
    recurrence = "daily";
    confidence += 0.1;
    cleanedText = cleanedText.replace(/\bevery\b/gi, "");
  }

  // 1.5 Smart Reminder parsing (e.g. "and remind me 30 minutes before")
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

  // 2. Priority Detection
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

  // 3. Category Detection using keywords + Compromise
  lowText = cleanedText.toLowerCase();
  const compromiseDoc = nlp(cleanedText);
  
  for (const [catName, keywords] of Object.entries(CATEGORY_MAP)) {
    // Check keyword array match
    const hasKeyword = keywords.some(keyword => {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const startBoundary = /^\w/.test(keyword) ? '\\b' : '';
      const endBoundary = /\w$/.test(keyword) ? '\\b' : '';
      const regex = new RegExp(`${startBoundary}${escaped}${endBoundary}`, "i");
      return regex.test(cleanedText);
    });

    // Check Compromise match if keyword found or double check verbs/nouns
    if (hasKeyword) {
      category = catName as any;
      confidence += 0.15;
      break;
    }
  }

  // Fallback category heuristics using Compromise parts of speech
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

  // 4. Date & Time Parsing via Chrono
  // We parse the current cleanedText so date keywords are extracted
  try {
    const chronoResults = chrono.parse(cleanedText);
    if (chronoResults.length > 0) {
      for (const result of chronoResults) {
        const parsedDate = result.start.date();
        
        // If task, extract target date
        if (type === "task") {
          dateStr = formatDate(parsedDate);
        }

        // Check if time was explicitly specified
        const hourSpecified = result.start.isCertain("hour");
        if (hourSpecified) {
          timeStr = formatTime(parsedDate);
        } else {
          // Fallback checks for custom strings Chrono might miss certain flags on
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

        // Strip the matched date text from the title
        cleanedText = cleanedText.replace(result.text, "");
      }
      confidence += 0.15;
    } else {
      // Manual backup regexes for simple dates in case chrono has issues
      const todayRegex = /\btoday\b/i;
      const tomorrowRegex = /\btomorrow\b/i;
      if (todayRegex.test(cleanedText)) {
        if (type === "task") dateStr = formatDate(new Date());
        cleanedText = cleanedText.replace(todayRegex, "");
        confidence += 0.1;
      } else if (tomorrowRegex.test(cleanedText)) {
        if (type === "task") {
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

  // 5. Final Title Clean Up
  // Strip trailing/leading space, prepositions like "at", "on", "by", "for", "to"
  let title = cleanedText
    .replace(/\s+/g, " ") // Collapse spaces
    .trim();

  // Strip leading/trailing connector words (e.g. "at 7pm", "to study", "gym at")
  title = title
    .replace(/^(at|on|by|for|to|with|in)\s+/i, "")
    .replace(/\s+(at|on|by|for|to|with|in)$/i, "")
    .trim();

  // Capitalize first letter
  if (title.length > 0) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  } else {
    title = originalText; // Fallback to full input if everything got stripped
  }

  // Default values if unspecified
  if (!priority) {
    priority = "medium";
  }

  // Cap confidence score
  confidence = Math.min(1.0, Math.max(0.1, confidence));

  return {
    type,
    title,
    date: dateStr,
    time: timeStr,
    category,
    priority,
    recurrence: recurrence !== "none" ? recurrence : undefined,
    reminderOffsetMinutes,
    confidence: Math.round(confidence * 100) / 100, // round to 2 decimals
  };
}
