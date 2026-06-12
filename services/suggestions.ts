import AsyncStorage from "@react-native-async-storage/async-storage";
import { getRecycleBinItems } from "./storage";

export type SuggestionType = "convert_habit" | "recurring_schedule";

export type SmartSuggestion = {
  id: string;
  type: SuggestionType;
  title: string; // The text matching the task name (e.g. "Gym" or "Study React")
  message: string; // User-facing prompt (e.g. "Convert Gym into a recurring habit?")
  timestamp: number;
  resolved: boolean;
};

type CreationHistoryEntry = {
  title: string;
  timestamp: number;
};

const HISTORY_STORAGE_KEY = "PEBBLE_CAPTURE_CREATION_HISTORY";
const SUGGESTION_STORAGE_KEY = "PEBBLE_CAPTURE_ACTIVE_SUGGESTIONS";
const HISTORY_LIMIT = 30;

export async function logTaskCreation(title: string): Promise<SmartSuggestion | null> {
  const cleanTitle = title.trim();
  if (cleanTitle.length === 0) return null;

  try {
    // 1. Fetch creation history
    const historyRaw = await AsyncStorage.getItem(HISTORY_STORAGE_KEY);
    const history: CreationHistoryEntry[] = historyRaw ? JSON.parse(historyRaw) : [];

    // 2. Add current creation to history
    history.push({
      title: cleanTitle,
      timestamp: Date.now(),
    });

    // Cap history
    if (history.length > HISTORY_LIMIT) {
      history.shift();
    }
    await AsyncStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));

    // Fetch recycle bin titles to filter
    const recycleBin = await getRecycleBinItems();
    const recycledTitles = new Set(recycleBin.map(item => {
      if (item.itemType === "workspace") {
        const titles = [item.title.toLowerCase().trim()];
        if (item.data) {
          if (Array.isArray(item.data.todos)) {
            for (const t of item.data.todos) if (t?.title) titles.push(t.title.toLowerCase().trim());
          }
          if (Array.isArray(item.data.habits)) {
            for (const h of item.data.habits) if (h?.title) titles.push(h.title.toLowerCase().trim());
          }
        }
        return titles;
      } else {
        return [item.title.toLowerCase().trim()];
      }
    }).flat());

    // 3. Heuristics matching: Count occurrences in the past 30 days
    const lowerTitle = cleanTitle.toLowerCase();
    const count = history.filter(entry => {
      const entryTitle = entry.title.toLowerCase().trim();
      return entryTitle === lowerTitle && !recycledTitles.has(entryTitle);
    }).length;

    if (count >= 3) {
      // 4. Check if we've already suggested this
      const suggestionsRaw = await AsyncStorage.getItem(SUGGESTION_STORAGE_KEY);
      const suggestions: SmartSuggestion[] = suggestionsRaw ? JSON.parse(suggestionsRaw) : [];

      const alreadySuggested = suggestions.some(s => s.title.toLowerCase() === lowerTitle);
      if (!alreadySuggested) {
        // Create new suggestion
        const isStudyRelated = lowerTitle.includes("study") || lowerTitle.includes("code") || lowerTitle.includes("learn");
        const suggestionType: SuggestionType = isStudyRelated ? "recurring_schedule" : "convert_habit";
        
        const message = isStudyRelated
          ? `Create recurring study schedule for "${cleanTitle}"?`
          : `Convert "${cleanTitle}" into a recurring habit?`;

        const newSuggestion: SmartSuggestion = {
          id: `suggest-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          type: suggestionType,
          title: cleanTitle,
          message,
          timestamp: Date.now(),
          resolved: false,
        };

        suggestions.push(newSuggestion);
        await AsyncStorage.setItem(SUGGESTION_STORAGE_KEY, JSON.stringify(suggestions));
        return newSuggestion;
      }
    }
  } catch (err) {
    console.warn("Failed to log task creation for suggestions:", err);
  }

  return null;
}

export async function getActiveSuggestions(): Promise<SmartSuggestion[]> {
  try {
    const suggestionsRaw = await AsyncStorage.getItem(SUGGESTION_STORAGE_KEY);
    const suggestions: SmartSuggestion[] = suggestionsRaw ? JSON.parse(suggestionsRaw) : [];
    
    const recycleBin = await getRecycleBinItems();
    const recycledTitles = new Set(recycleBin.map(item => {
      if (item.itemType === "workspace") {
        const titles = [item.title.toLowerCase().trim()];
        if (item.data) {
          if (Array.isArray(item.data.todos)) {
            for (const t of item.data.todos) if (t?.title) titles.push(t.title.toLowerCase().trim());
          }
          if (Array.isArray(item.data.habits)) {
            for (const h of item.data.habits) if (h?.title) titles.push(h.title.toLowerCase().trim());
          }
        }
        return titles;
      } else {
        return [item.title.toLowerCase().trim()];
      }
    }).flat());

    return suggestions.filter(s => !s.resolved && !recycledTitles.has(s.title.toLowerCase().trim()));
  } catch {
    return [];
  }
}

export async function resolveSuggestion(id: string): Promise<void> {
  try {
    const suggestionsRaw = await AsyncStorage.getItem(SUGGESTION_STORAGE_KEY);
    if (!suggestionsRaw) return;

    const suggestions: SmartSuggestion[] = JSON.parse(suggestionsRaw);
    const updated = suggestions.map(s => s.id === id ? { ...s, resolved: true } : s);
    await AsyncStorage.setItem(SUGGESTION_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn("Failed to resolve suggestion:", err);
  }
}

export async function clearSuggestionHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(HISTORY_STORAGE_KEY);
    await AsyncStorage.removeItem(SUGGESTION_STORAGE_KEY);
  } catch {}
}
