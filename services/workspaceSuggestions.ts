import AsyncStorage from "@react-native-async-storage/async-storage";
import { getTopicMatchScore, detectTaskTopic } from "@/services/workspaceTopics";
import { getRecycleBinItems } from "./storage";

const WORKSPACE_HISTORY_KEY = "todoapp:workspace:history:v1";

export interface WorkspaceHistoryItem {
  taskTitle: string;
  category: string;
  workspaceId: string;
  timestamp: number;
}

export interface WorkspaceScoringInput {
  id: string;
  name: string;
  emoji?: string;
  color?: string;
}

export interface WorkspaceSuggestionResult {
  workspaceId: string;
  score: number;
  confidence: "High Match" | "Medium Match" | "Low Match" | "No Match";
}

const KEYWORD_WORKSPACE_MAP: Record<string, string> = {
  "kubernetes": "devops",
  "docker": "devops",
  "aws": "devops",
  "react": "development",
  "gym": "fitness",
  "workout": "fitness",
  "exam": "study",
  "dsa": "study",
  "leetcode": "study"
};

const STOP_WORDS = new Set([
  "study", "solve", "buy", "update", "doctor", "appointment", "meeting", "call", "get", "make", "find",
  "and", "the", "a", "an", "to", "for", "in", "on", "at", "with", "of", "from", "by", "about"
]);

function extractKeywords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

/**
 * Load workspace selection history from AsyncStorage.
 */
export async function loadWorkspaceHistory(): Promise<WorkspaceHistoryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(WORKSPACE_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as WorkspaceHistoryItem[];
      }
    }
  } catch {
    // ignore
  }
  return [];
}

/**
 * Append a workspace selection event to selection history.
 */
export async function addWorkspaceSelectionToHistory(
  taskTitle: string,
  category: string,
  workspaceId: string
): Promise<void> {
  try {
    const currentHistory = await loadWorkspaceHistory();
    const newItem: WorkspaceHistoryItem = {
      taskTitle,
      category,
      workspaceId,
      timestamp: Date.now(),
    };
    // Keep last 100 entries to prevent performance degradation
    const updated = [newItem, ...currentHistory].slice(0, 100);
    await AsyncStorage.setItem(WORKSPACE_HISTORY_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

/**
 * Compute suggested workspaces with scores from 0 to 100.
 */
export async function getWorkspaceSuggestions(
  taskTitle: string,
  category: string,
  workspaces: WorkspaceScoringInput[],
  todos: Record<string, { title: string; category?: string }[]>
): Promise<WorkspaceSuggestionResult[]> {
  if (!taskTitle || workspaces.length === 0) {
    return [];
  }

  const history = await loadWorkspaceHistory();
  const recycleBin = await getRecycleBinItems();
  const recycledWorkspaceIds = new Set<string>();
  const recycledTitles = new Set<string>();

  for (const item of recycleBin) {
    if (item.itemType === "workspace") {
      recycledWorkspaceIds.add(item.id);
      recycledTitles.add(item.title.toLowerCase().trim());
      if (item.data) {
        if (Array.isArray(item.data.todos)) {
          for (const t of item.data.todos) if (t?.title) recycledTitles.add(t.title.toLowerCase().trim());
        }
        if (Array.isArray(item.data.habits)) {
          for (const h of item.data.habits) if (h?.title) recycledTitles.add(h.title.toLowerCase().trim());
        }
      }
    } else {
      recycledTitles.add(item.title.toLowerCase().trim());
    }
  }

  const activeHistory = history.filter(hist => {
    return !recycledWorkspaceIds.has(hist.workspaceId) && !recycledTitles.has(hist.taskTitle.toLowerCase().trim());
  });

  const taskKeywords = extractKeywords(taskTitle);

  console.log(`[SUGGESTION AUDIT] Task Title: "${taskTitle}" | Category: "${category}"`);
  console.log(`  - History length: ${activeHistory.length}`);

  const results: WorkspaceSuggestionResult[] = workspaces.map((ws) => {
    let titleScore = 0;
    
    // --- 1. Title Similarity (Max: 50) ---
    if (taskKeywords.length > 0) {
      // A. Check Workspace Name keyword match
      const wsNameWords = ws.name.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
      const overlapName = taskKeywords.filter(k => wsNameWords.includes(k));
      if (overlapName.length > 0) {
        titleScore += 30;
      }

      // B. Check Existing Task Title matches
      const wsTasks = todos[ws.id] || [];
      let matchingTasksCount = 0;
      wsTasks.forEach((task) => {
        const taskWords = task.title.toLowerCase().split(/\s+/);
        const hasOverlap = taskKeywords.some((k) => taskWords.includes(k));
        if (hasOverlap) {
          matchingTasksCount++;
        }
      });
      if (matchingTasksCount > 0) {
        titleScore += Math.min(20, matchingTasksCount * 10);
      }

      // C. Check Historical Title Overlap match
      let histMatchingCount = 0;
      activeHistory.forEach((hist) => {
        if (hist.workspaceId === ws.id) {
          const histWords = hist.taskTitle.toLowerCase().split(/\s+/);
          const hasOverlap = taskKeywords.some((k) => histWords.includes(k));
          if (hasOverlap) {
            histMatchingCount++;
          }
        }
      });
      if (histMatchingCount > 0) {
        titleScore += Math.min(10, histMatchingCount * 5);
      }
    }

    titleScore = Math.min(50, titleScore);

    // --- 2. Category Match (Max: 25) ---
    let categoryScore = 0;
    const wsTasks = todos[ws.id] || [];
    if (wsTasks.length > 0) {
      const matchingCatTasks = wsTasks.filter((t) => t.category === category).length;
      categoryScore = Math.round((matchingCatTasks / wsTasks.length) * 25);
    } else {
      // Fallback: check workspace name implied association
      const nameLower = ws.name.toLowerCase();
      const catLower = category.toLowerCase();
      if (nameLower.includes(catLower)) {
        categoryScore = 25;
      } else if (category === "learning" && (nameLower.includes("prep") || nameLower.includes("study") || nameLower.includes("class") || nameLower.includes("certification"))) {
        categoryScore = 20;
      } else if (category === "work" && (nameLower.includes("office") || nameLower.includes("job") || nameLower.includes("assignment") || nameLower.includes("career"))) {
        categoryScore = 20;
      } else if (category === "personal" && (nameLower.includes("shopping") || nameLower.includes("buy") || nameLower.includes("home"))) {
        categoryScore = 15;
      }
    }

    // --- 3. Recent Workspace Usage (Max: 15) ---
    let recentScore = 0;
    if (activeHistory.length > 0) {
      if (activeHistory[0]?.workspaceId === ws.id) {
        recentScore = 15;
      } else if (activeHistory[1]?.workspaceId === ws.id) {
        recentScore = 10;
      } else if (activeHistory[2]?.workspaceId === ws.id) {
        recentScore = 5;
      }
    }

    // --- 4. Workspace Frequency (Max: 10) ---
    let frequencyScore = 0;
    if (activeHistory.length > 0) {
      const count = activeHistory.filter((h) => h.workspaceId === ws.id).length;
      frequencyScore = Math.round((count / activeHistory.length) * 10);
    }

    // --- 5. Topic-Based Match Score Boost (Max: 40) ---
    const topicScore = getTopicMatchScore(taskTitle, ws.name, wsTasks);

    // --- 6. Explicit Keyword Weighted Matching (Boost: +55) ---
    let keywordScore = 0;
    const taskLower = taskTitle.toLowerCase();
    for (const [kw, wsNameKeyword] of Object.entries(KEYWORD_WORKSPACE_MAP)) {
      if (taskLower.includes(kw) && ws.name.toLowerCase().includes(wsNameKeyword)) {
        keywordScore = 55;
        break;
      }
    }

    const totalScore = titleScore + topicScore + categoryScore + recentScore + frequencyScore + keywordScore;
    const finalScore = Math.min(100, totalScore);

    // Set match confidence
    let confidence: "High Match" | "Medium Match" | "Low Match" | "No Match" = "No Match";
    if (finalScore >= 70) {
      confidence = "High Match";
    } else if (finalScore >= 40) {
      confidence = "Medium Match";
    } else if (finalScore >= 15) {
      confidence = "Low Match";
    }

    console.log(`[SUGGESTION AUDIT] Workspace: "${ws.name}" (ID: ${ws.id})`);
    console.log(`  - Title Score: ${titleScore}`);
    console.log(`  - Topic Score: ${topicScore}`);
    console.log(`  - Category Score: ${categoryScore}`);
    console.log(`  - Recent Score: ${recentScore}`);
    console.log(`  - Frequency Score: ${frequencyScore}`);
    console.log(`  - Keyword Score: ${keywordScore}`);
    console.log(`  - Total Score: ${totalScore} -> Final: ${finalScore} (${confidence})`);

    return {
      workspaceId: ws.id,
      score: finalScore,
      confidence,
    };
  });

  // Sort descending by score
  return results.sort((a, b) => b.score - a.score);
}

export const WorkspaceMatcher = {
  getWorkspaceSuggestions,
  addWorkspaceSelectionToHistory,
  loadWorkspaceHistory,
  detectTaskTopic,
};

export { detectTaskTopic };
