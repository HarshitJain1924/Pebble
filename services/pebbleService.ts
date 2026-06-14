import AsyncStorage from "@react-native-async-storage/async-storage";
import { TODOS_STORAGE_KEY } from "./storage";
import { emitStateChange } from "./stateEvents";

export type PebbleType = "task" | "habit" | "focus";

export interface PebbleLogEntry {
  type: PebbleType;
  timestamp: number;
}

export const PEBBLE_LOG_KEY = "todoapp:pebble_log";

export async function earnPebble(type: PebbleType): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(PEBBLE_LOG_KEY);
    let log: PebbleLogEntry[] = [];
    if (raw) {
      log = JSON.parse(raw);
    }

    // Check today's local date key (YYYY-MM-DD)
    const todayStr = getOffsetDateKey(0);
    const todayPebbles = log.filter((entry) => {
      const d = new Date(entry.timestamp);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}` === todayStr;
    });

    if (todayPebbles.length >= 15) {
      console.log("Daily pebble limit reached (15/day).");
      return false;
    }

    const isFirstPebbleToday = todayPebbles.length === 0;
    log.push({ type, timestamp: Date.now() });
    await AsyncStorage.setItem(PEBBLE_LOG_KEY, JSON.stringify(log));

    if (isFirstPebbleToday) {
      await earnBonusGem(1);
    }

    emitStateChange("pebbles_changed", "pebble_service");
    return true;
  } catch (e) {
    console.warn("Failed to earn pebble", e);
    return false;
  }
}


export async function undoLastPebble(type: PebbleType) {
  try {
    const raw = await AsyncStorage.getItem(PEBBLE_LOG_KEY);
    if (!raw) return;
    let log: PebbleLogEntry[] = JSON.parse(raw);

    // Find last index of this type
    const idx = log.map((p) => p.type).lastIndexOf(type);
    if (idx === -1) return;

    const removedEntry = log[idx];
    const removedDate = new Date(removedEntry.timestamp);
    const removedDateKey = `${removedDate.getFullYear()}-${String(removedDate.getMonth() + 1).padStart(2, "0")}-${String(removedDate.getDate()).padStart(2, "0")}`;

    // Check if this was the ONLY pebble that day (it triggered a bonus gem)
    const pebblesOnSameDay = log.filter((entry) => {
      const d = new Date(entry.timestamp);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return key === removedDateKey;
    });
    const wasOnlyPebbleToday = pebblesOnSameDay.length === 1;

    log.splice(idx, 1);
    await AsyncStorage.setItem(PEBBLE_LOG_KEY, JSON.stringify(log));

    // Roll back the bonus gem that was awarded for the first pebble of that day
    if (wasOnlyPebbleToday) {
      try {
        const bonusRaw = await AsyncStorage.getItem(GEMS_BONUS_KEY);
        const currentBonus = bonusRaw ? parseInt(bonusRaw, 10) || 0 : 0;
        if (currentBonus > 0) {
          await AsyncStorage.setItem(GEMS_BONUS_KEY, String(currentBonus - 1));
        }
      } catch {}
    }

    emitStateChange("pebbles_changed", "pebble_service");
  } catch (e) {
    console.warn("Failed to undo pebble", e);
  }
}

export async function getPebbleCounts() {
  try {
    // Make sure log is initialized
    await ensurePebbleLogInitialized();

    const raw = await AsyncStorage.getItem(PEBBLE_LOG_KEY);
    if (!raw) {
      return {
        lifetime: 0,
        monthly: 0,
        monthlyTypes: { task: 0, habit: 0, focus: 0 },
        lifetimeTypes: { task: 0, habit: 0, focus: 0 },
        streak: 0,
        bestStreak: 0,
        weeklyStatus: [],
      };
    }
    const log: PebbleLogEntry[] = JSON.parse(raw);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let monthly = 0;
    const monthlyTypes = { task: 0, habit: 0, focus: 0 };

    log.forEach((entry) => {
      const entryDate = new Date(entry.timestamp);
      if (
        entryDate.getFullYear() === currentYear &&
        entryDate.getMonth() === currentMonth
      ) {
        monthly++;
        monthlyTypes[entry.type]++;
      }
    });

    const streak = calculateStreak(log);
    const bestStreak = calculateBestStreak(log);
    const weeklyStatus = getWeeklyStatus(log);

    const lifetimeTypes = { task: 0, habit: 0, focus: 0 };
    log.forEach((entry) => {
      lifetimeTypes[entry.type]++;
    });

    return {
      lifetime: log.length,
      monthly,
      monthlyTypes,
      lifetimeTypes,
      streak,
      bestStreak,
      weeklyStatus,
      log,
    };
  } catch {
    return { lifetime: 0, monthly: 0, monthlyTypes: { task: 0, habit: 0, focus: 0 }, lifetimeTypes: { task: 0, habit: 0, focus: 0 }, streak: 0, bestStreak: 0, weeklyStatus: [] };
  }
}

function calculateBestStreak(log: PebbleLogEntry[]) {
  if (log.length === 0) return 0;
  
  const completedDates = new Set<string>();
  log.forEach((entry) => {
    const d = new Date(entry.timestamp);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    completedDates.add(`${y}-${m}-${day}`);
  });

  const dateStrings = Array.from(completedDates);
  if (dateStrings.length === 0) return 0;

  // Convert to timestamps at UTC midnight
  const timestamps = dateStrings.map(ds => {
    const [y, m, d] = ds.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  }).sort((a, b) => a - b);

  let maxStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < timestamps.length; i++) {
    const diff = timestamps[i] - timestamps[i - 1];
    const diffDays = Math.round(diff / 86400000);
    if (diffDays === 1) {
      currentStreak++;
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak;
      }
    } else if (diffDays > 1) {
      currentStreak = 1;
    }
  }

  const activeStreak = calculateStreak(log);
  return Math.max(maxStreak, activeStreak);
}


export async function ensurePebbleLogInitialized() {
  try {
    const raw = await AsyncStorage.getItem(PEBBLE_LOG_KEY);
    if (raw) return; // Already initialized

    // Count lifetime completed todos
    const rawTodos = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
    let todosCompleted = 0;
    if (rawTodos) {
      try {
        const parsed = JSON.parse(rawTodos);
        const allTodos = Object.values(parsed.todos || {}).flat() as any[];
        todosCompleted = allTodos.filter((t) => t.completed).length;
      } catch {}
    }

    // Backfill from history entries to restore correct dates
    const rawHistory = await AsyncStorage.getItem("todoapp:history:v1");
    const log: PebbleLogEntry[] = [];

    if (rawHistory) {
      try {
        const historyList = JSON.parse(rawHistory);
        if (Array.isArray(historyList)) {
          historyList.forEach((entry: any) => {
            const [entryYear, entryMonth, entryDay] = entry.date.split("-").map(Number);
            const timestamp = new Date(entryYear, entryMonth - 1, entryDay).getTime();

            for (let i = 0; i < (entry.completedTodos || 0); i++) {
              log.push({ type: "task", timestamp });
            }
            for (let i = 0; i < (entry.completedHabits || 0); i++) {
              log.push({ type: "habit", timestamp });
            }
            // NOTE: focus sessions are NOT backfilled from history because
            // `completedToday` is a daily-reset field that cannot be trusted
            // as a historical count. Only real pebble log entries count.
          });
        }
      } catch {}
    }

    // Add any completed todos not yet captured in history
    const historyTodosCount = log.filter((p) => p.type === "task").length;
    const remainingTodos = Math.max(0, todosCompleted - historyTodosCount);
    const now = Date.now();
    for (let i = 0; i < remainingTodos; i++) {
      log.push({ type: "task", timestamp: now });
    }

    // Write the log (even if empty — marks the key as initialized so this
    // function is skipped on subsequent calls)
    await AsyncStorage.setItem(PEBBLE_LOG_KEY, JSON.stringify(log));
  } catch (e) {
    console.warn("Failed to initialize pebble log", e);
  }
}

function getOffsetDateKey(offsetDays: number) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function calculateStreak(log: PebbleLogEntry[]) {
  if (log.length === 0) return 0;
  
  const completedDates = new Set<string>();
  log.forEach((entry) => {
    const d = new Date(entry.timestamp);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    completedDates.add(`${y}-${m}-${day}`);
  });

  let streak = 0;
  let checkOffset = 0;
  
  const todayKey = getOffsetDateKey(0);
  const yesterdayKey = getOffsetDateKey(1);

  if (completedDates.has(todayKey)) {
    streak = 1;
    checkOffset = 1;
    while (true) {
      const key = getOffsetDateKey(checkOffset);
      if (completedDates.has(key)) {
        streak++;
        checkOffset++;
      } else {
        break;
      }
    }
  } else if (completedDates.has(yesterdayKey)) {
    streak = 1;
    checkOffset = 2;
    while (true) {
      const key = getOffsetDateKey(checkOffset);
      if (completedDates.has(key)) {
        streak++;
        checkOffset++;
      } else {
        break;
      }
    }
  }

  return streak;
}

function getWeeklyStatus(log: PebbleLogEntry[]) {
  const completedDates = new Set<string>();
  log.forEach((entry) => {
    const d = new Date(entry.timestamp);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    completedDates.add(`${y}-${m}-${day}`);
  });

  const today = new Date();
  const currentDay = today.getDay(); // 0 is Sunday, 1 is Monday, etc.
  const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
  const monday = new Date(today);
  monday.setDate(today.getDate() + distanceToMonday);

  const WEEK_DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  return WEEK_DAYS.map((label, index) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + index);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const dateKey = `${y}-${m}-${day}`;
    return {
      label,
      completed: completedDates.has(dateKey),
      dateKey,
      isToday: dateKey === getOffsetDateKey(0),
    };
  });
}

export const PEBBLE_SPENT_KEY = "todoapp:pebble_spent";

export async function getPebbleBalance(): Promise<number> {
  // Wrap with getGemsBalance for backward compatibility
  return getGemsBalance();
}

export async function spendPebbles(amount: number): Promise<boolean> {
  // Each call to spendPebbles spends exactly 1 gem regardless of the raw pebble amount
  // (callers are expected to already express the cost in gems via spendGems directly;
  //  this function exists for backward-compatibility with legacy call sites)
  return spendGems(1);
}

export const GEMS_SPENT_KEY = "todoapp:gems_spent";
export const GEMS_BONUS_KEY = "todoapp:gems_bonus";

export async function getGemsBalance(): Promise<number> {
  try {
    const counts = await getPebbleCounts();
    const lifetimePebbles = counts.lifetime;
    
    // 1 Gem per 45 Pebbles earned
    const gemsFromPebbles = Math.floor(lifetimePebbles / 45);

    // Read bonus Gems (daily consistency check-ins, etc.)
    const bonusRaw = await AsyncStorage.getItem(GEMS_BONUS_KEY);
    const bonus = bonusRaw ? parseInt(bonusRaw, 10) || 0 : 0;

    // Read spent Gems
    const spentRaw = await AsyncStorage.getItem(GEMS_SPENT_KEY);
    const spent = spentRaw ? parseInt(spentRaw, 10) || 0 : 0;

    return Math.max(0, gemsFromPebbles + bonus - spent);
  } catch (e) {
    console.warn("Failed to get gems balance", e);
    return 0;
  }
}

export async function earnBonusGem(amount: number = 1): Promise<void> {
  try {
    const bonusRaw = await AsyncStorage.getItem(GEMS_BONUS_KEY);
    const currentBonus = bonusRaw ? parseInt(bonusRaw, 10) || 0 : 0;
    await AsyncStorage.setItem(GEMS_BONUS_KEY, String(currentBonus + amount));
    emitStateChange("pebbles_changed", "pebble_service");
  } catch (e) {
    console.warn("Failed to earn bonus gem", e);
  }
}

export async function spendGems(amount: number = 1): Promise<boolean> {
  try {
    const balance = await getGemsBalance();
    if (balance < amount) {
      return false;
    }
    const spentRaw = await AsyncStorage.getItem(GEMS_SPENT_KEY);
    const spent = spentRaw ? parseInt(spentRaw, 10) || 0 : 0;
    await AsyncStorage.setItem(GEMS_SPENT_KEY, String(spent + amount));
    emitStateChange("pebbles_changed", "pebble_service");
    return true;
  } catch (e) {
    console.warn("Failed to spend gems", e);
    return false;
  }
}

export interface StreakRecoveryInfo {
  eligible: boolean;
  previousStreak: number;
  brokenDate: string; // YYYY-MM-DD
}

export async function getMainStreakRecoveryInfo(): Promise<StreakRecoveryInfo> {
  try {
    const counts = await getPebbleCounts();
    const log = counts.log || [];
    if (log.length === 0) {
      return { eligible: false, previousStreak: 0, brokenDate: "" };
    }

    const completedDates = new Set<string>();
    log.forEach((entry) => {
      const d = new Date(entry.timestamp);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      completedDates.add(`${y}-${m}-${day}`);
    });

    const yesterday = getOffsetDateKey(1);

    // If yesterday is already completed, the streak isn't broken
    if (completedDates.has(yesterday)) {
      return { eligible: false, previousStreak: 0, brokenDate: "" };
    }

    // Calculate the streak ending on the day before yesterday
    let previousStreak = 0;
    let offset = 2;
    while (true) {
      const key = getOffsetDateKey(offset);
      if (completedDates.has(key)) {
        previousStreak++;
        offset++;
      } else {
        break;
      }
    }

    if (previousStreak === 0) {
      return { eligible: false, previousStreak: 0, brokenDate: "" };
    }

    return {
      eligible: true,
      previousStreak,
      brokenDate: yesterday,
    };
  } catch (e) {
    console.warn("Failed to get main streak recovery info", e);
    return { eligible: false, previousStreak: 0, brokenDate: "" };
  }
}

export async function recoverMainStreak(): Promise<boolean> {
  try {
    const recoveryInfo = await getMainStreakRecoveryInfo();
    if (!recoveryInfo.eligible) {
      return false;
    }

    // Spend 1 Gem
    const success = await spendGems(1);
    if (!success) {
      return false;
    }

    // Insert dummy focus pebble for yesterday to heal the streak
    const brokenDate = recoveryInfo.brokenDate;
    const [y, m, d] = brokenDate.split("-").map(Number);
    const timestamp = new Date(y, m - 1, d, 12, 0, 0).getTime(); // noon on broken date

    const raw = await AsyncStorage.getItem(PEBBLE_LOG_KEY);
    let log: PebbleLogEntry[] = [];
    if (raw) {
      log = JSON.parse(raw);
    }
    log.push({ type: "focus", timestamp });
    await AsyncStorage.setItem(PEBBLE_LOG_KEY, JSON.stringify(log));

    emitStateChange("pebbles_changed", "pebble_service");
    return true;
  } catch (e) {
    console.warn("Failed to recover main streak", e);
    return false;
  }
}


