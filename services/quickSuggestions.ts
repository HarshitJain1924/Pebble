/**
 * quickSuggestions.ts
 *
 * Context-aware Quick Add suggestion engine.
 *
 * Rules:
 *  1. Never suggest items that already exist as a task or habit (fuzzy title match).
 *  2. Prefer suggestions that relate to the user's workspaces.
 *  3. Promote habit suggestions when the user has few habits.
 *  4. Avoid repeating the same suggestions across sessions (async rotation via AsyncStorage).
 *  5. Rotate across Learning, Fitness, Health, Personal, Productivity, Finance categories.
 *  6. Always return at most MAX_SUGGESTIONS results.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Todo, Habit, TaskList } from "@/modules/types";

const MAX_SUGGESTIONS = 4;
const SEEN_KEY = "pebble:quick-suggestions:seen-v1";
const MAX_SEEN_HISTORY = 20;

// ─── Suggestion Pool ──────────────────────────────────────────────────────────

interface SuggestionEntry {
  text: string;
  /** Keywords that link this suggestion to a workspace name (lowercase). */
  workspaceKeywords: string[];
  category: "learning" | "fitness" | "health" | "personal" | "productivity" | "finance";
}

const SUGGESTION_POOL: SuggestionEntry[] = [
  // Learning
  { text: "Study Kubernetes tomorrow at 8pm", workspaceKeywords: ["devops", "cloud", "kubernetes", "k8s"], category: "learning" },
  { text: "Review Docker networking tonight", workspaceKeywords: ["devops", "cloud", "docker"], category: "learning" },
  { text: "Finish deployment checklist Friday", workspaceKeywords: ["devops", "cloud"], category: "learning" },
  { text: "Complete assignment before Friday", workspaceKeywords: ["college", "university", "study", "academic", "school"], category: "learning" },
  { text: "Revise operating systems tonight", workspaceKeywords: ["college", "university", "study", "academic"], category: "learning" },
  { text: "Practice coding for 1 hour daily", workspaceKeywords: ["college", "placement", "coding", "dsa", "leetcode"], category: "learning" },
  { text: "Read tech article every morning", workspaceKeywords: ["learning", "study", "tech"], category: "learning" },
  { text: "Watch tutorial and take notes today", workspaceKeywords: ["learning", "course", "study"], category: "learning" },
  { text: "Solve 2 LeetCode problems daily", workspaceKeywords: ["placement", "coding", "dsa", "leetcode"], category: "learning" },

  // Fitness
  { text: "Gym every weekday at 7am", workspaceKeywords: ["fitness", "gym", "workout", "health"], category: "fitness" },
  { text: "Walk 30 minutes daily at 6pm", workspaceKeywords: ["fitness", "health", "wellness"], category: "fitness" },
  { text: "Stretch every morning for 10 minutes", workspaceKeywords: ["fitness", "health", "yoga", "wellness"], category: "fitness" },
  { text: "Run 5km every Saturday", workspaceKeywords: ["fitness", "running", "health"], category: "fitness" },
  { text: "Do 20 pushups every morning", workspaceKeywords: ["fitness", "workout", "gym"], category: "fitness" },
  { text: "Yoga session every Monday and Thursday", workspaceKeywords: ["fitness", "yoga", "wellness", "health"], category: "fitness" },

  // Health
  { text: "Drink water every 2 hours", workspaceKeywords: ["health", "wellness", "fitness"], category: "health" },
  { text: "Sleep by 11pm every night", workspaceKeywords: ["health", "wellness"], category: "health" },
  { text: "Take vitamins every morning", workspaceKeywords: ["health", "wellness"], category: "health" },
  { text: "Track meals every evening", workspaceKeywords: ["health", "diet", "nutrition"], category: "health" },
  { text: "Meditate for 10 minutes every morning", workspaceKeywords: ["health", "wellness", "mindfulness"], category: "health" },
  { text: "No screens 30 minutes before bed", workspaceKeywords: ["health", "wellness", "mindfulness"], category: "health" },

  // Productivity
  { text: "Plan tomorrow every evening at 9pm", workspaceKeywords: ["work", "productivity"], category: "productivity" },
  { text: "Weekly review every Sunday at 7pm", workspaceKeywords: ["work", "productivity"], category: "productivity" },
  { text: "Inbox zero every Friday afternoon", workspaceKeywords: ["work", "productivity"], category: "productivity" },
  { text: "Deep work session every morning 9-11am", workspaceKeywords: ["work", "productivity"], category: "productivity" },
  { text: "Update project notes every evening", workspaceKeywords: ["work", "project", "productivity"], category: "productivity" },

  // Personal
  { text: "Read 10 pages daily before bed", workspaceKeywords: ["personal", "reading", "book"], category: "personal" },
  { text: "Journal for 5 minutes every night", workspaceKeywords: ["personal", "mindfulness", "journal"], category: "personal" },
  { text: "Call a friend or family member weekly", workspaceKeywords: ["personal", "social"], category: "personal" },
  { text: "Learn one new word every day", workspaceKeywords: ["personal", "learning", "language"], category: "personal" },

  // Finance
  { text: "Pay rent every month on the 1st", workspaceKeywords: ["finance", "bills", "personal"], category: "finance" },
  { text: "Track expenses every Sunday", workspaceKeywords: ["finance", "budget", "personal"], category: "finance" },
  { text: "Review monthly budget this weekend", workspaceKeywords: ["finance", "budget"], category: "finance" },
  { text: "Check investments every Monday morning", workspaceKeywords: ["finance", "investing"], category: "finance" },
];

// ─── Normalisation Helpers ────────────────────────────────────────────────────

/** Lowercase + remove punctuation + collapse whitespace. */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns true if `candidate` "matches" any existing title.
 * Match = the first significant word (≥4 chars) of the candidate appears in the existing title.
 */
function conflictsWithExisting(candidate: string, existingNorm: string[]): boolean {
  const normCandidate = normalise(candidate);
  const significantWords = normCandidate
    .split(" ")
    .filter((w) => w.length >= 4);

  return existingNorm.some((existing) =>
    significantWords.some((word) => existing.includes(word))
  );
}

// ─── Seen-list helpers (AsyncStorage) ────────────────────────────────────────

async function getSeenSuggestions(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

async function addSeenSuggestions(suggestions: string[]): Promise<void> {
  try {
    const current = await getSeenSuggestions();
    const combined = [...current, ...suggestions];
    // Keep only the most recent MAX_SEEN_HISTORY to avoid growing forever
    const trimmed = combined.slice(-MAX_SEEN_HISTORY);
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
}

// ─── Workspace Relevance ──────────────────────────────────────────────────────

/**
 * Scores how relevant a suggestion entry is to a list of workspace names.
 * Returns a positive number when any workspace keyword matches a workspace name.
 */
function workspaceRelevanceScore(
  entry: SuggestionEntry,
  workspaceNames: string[]
): number {
  if (workspaceNames.length === 0) return 0;
  const normWsNames = workspaceNames.map((n) => n.toLowerCase());
  const matched = entry.workspaceKeywords.filter((kw) =>
    normWsNames.some((ws) => ws.includes(kw) || kw.includes(ws))
  );
  return matched.length;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export interface SmartSuggestionsInput {
  tasks: Todo[];
  habits: Habit[];
  workspaces: TaskList[];
}

/**
 * Returns up to MAX_SUGGESTIONS smart, personalised suggestion strings.
 *
 * Priority order:
 *  1. Workspace-relevant entries that haven't been seen before
 *  2. Workspace-relevant entries (even if seen)
 *  3. Unseen entries from underrepresented categories
 *  4. Any remaining entries to fill the list
 */
export async function getSmartQuickSuggestions(
  input: SmartSuggestionsInput
): Promise<string[]> {
  const { tasks, habits, workspaces } = input;

  // Build normalised existing-item list for conflict detection
  const existingNorm: string[] = [
    ...tasks.map((t) => normalise(t.title)),
    ...habits.map((h) => normalise(h.title)),
  ];

  // Workspace names for relevance scoring
  const wsNames = workspaces.map((w) => w.name);

  // Load recently shown suggestions
  const seen = await getSeenSuggestions();
  const seenSet = new Set(seen);

  // Filter pool: remove anything that conflicts with an existing item
  const eligible = SUGGESTION_POOL.filter(
    (entry) => !conflictsWithExisting(entry.text, existingNorm)
  );

  const wsRelevant = eligible
    .filter((e) => workspaceRelevanceScore(e, wsNames) > 0)
    .sort((a, b) => workspaceRelevanceScore(b, wsNames) - workspaceRelevanceScore(a, wsNames));

  const nonWs = eligible.filter((e) => workspaceRelevanceScore(e, wsNames) === 0);

  // Is this a new user? (very few habits)
  const isNewUser = habits.filter((h) => !h.archived).length <= 2;

  // ── Build final list ──────────────────────────────────────────────────────
  const chosen: SuggestionEntry[] = [];
  const usedTexts = new Set<string>();

  const tryAdd = (entry: SuggestionEntry) => {
    if (chosen.length >= MAX_SUGGESTIONS) return;
    if (usedTexts.has(entry.text)) return;
    chosen.push(entry);
    usedTexts.add(entry.text);
  };

  // 1. Unseen workspace-relevant first
  wsRelevant.filter((e) => !seenSet.has(e.text)).forEach(tryAdd);

  // 2. Seen workspace-relevant (fallback)
  wsRelevant.filter((e) => seenSet.has(e.text)).forEach(tryAdd);

  // 3. Unseen non-workspace entries (category diversity)
  const categoryOrder: SuggestionEntry["category"][] = [
    "fitness", "health", "productivity", "learning", "personal", "finance",
  ];

  if (isNewUser) {
    // New users: favour habit-building categories
    const habitCategories: SuggestionEntry["category"][] = [
      "fitness", "health", "personal", "productivity", "learning", "finance",
    ];
    for (const cat of habitCategories) {
      nonWs
        .filter((e) => e.category === cat && !seenSet.has(e.text))
        .forEach(tryAdd);
    }
  } else {
    for (const cat of categoryOrder) {
      nonWs
        .filter((e) => e.category === cat && !seenSet.has(e.text))
        .forEach(tryAdd);
    }
  }

  // 4. Fill any remaining slots from seen entries
  nonWs.filter((e) => seenSet.has(e.text)).forEach(tryAdd);

  // 5. Absolute fallback: static starters if pool is somehow exhausted
  const starters = [
    "Gym every weekday at 7am",
    "Study Kubernetes tomorrow at 8pm",
    "Drink water every 2 hours",
    "Pay rent every month on the 1st",
  ];
  for (const s of starters) {
    if (chosen.length >= MAX_SUGGESTIONS) break;
    if (!usedTexts.has(s)) {
      chosen.push({ text: s, workspaceKeywords: [], category: "personal" });
      usedTexts.add(s);
    }
  }

  const result = chosen.slice(0, MAX_SUGGESTIONS).map((e) => e.text);

  // Persist seen list asynchronously (don't await — not blocking)
  void addSeenSuggestions(result);

  return result;
}

/** Call this when the sheet opens to pre-load suggestions. */
export async function loadQuickSuggestions(
  input: SmartSuggestionsInput
): Promise<string[]> {
  return getSmartQuickSuggestions(input);
}
