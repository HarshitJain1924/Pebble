import AsyncStorage from "@react-native-async-storage/async-storage";
import { emitStateChange } from "@/services/events/state-events";
import { TaskRepository, WorkspaceRepository } from "@/repositories";
import { isTaskCompleted } from "@/shared/utils/domain-selectors";
import { dateKeyFromDate, getOffsetDateKey } from "@/shared/utils/date-key";
import { withLock } from "@/shared/utils/mutex";

export type PebbleType = "task" | "habit" | "focus" | "checklist";

export interface PebbleLogEntry {
  type: PebbleType;
  timestamp: number;
  rewardId?: string;
}

export interface SpendLogEntry {
  spendId: string;
  amount: number;
  timestamp: number;
}

export interface PebbleCounts {
  lifetime: number;
  monthly: number;
  today: number;
  todayTypes: { task: number; habit: number; focus: number; checklist: number };
  monthlyTypes: { task: number; habit: number; focus: number; checklist: number };
  lifetimeTypes: { task: number; habit: number; focus: number; checklist: number };
  streak: number;
  bestStreak: number;
  weeklyStatus: { label: string; completed: boolean; dateKey: string; isToday: boolean }[];
  log?: PebbleLogEntry[];
}

export interface StreakRecoveryInfo {
  eligible: boolean;
  previousStreak: number;
  brokenDate: string; // YYYY-MM-DD
}

export interface PebbleReconciliationReport {
  deduplicatedPebbles: number;
  repairedBonus: boolean;
  repairedSpent: boolean;
  logCount: number;
  currentGemsBalance: number;
}

// ── Canonical Storage Keys ──────────────────────────────────────────
export const PEBBLE_LOG_KEY = "todoapp:pebble_log";
export const STREAK_RECOVERIES_KEY = "todoapp:streak_recoveries";
export const PEBBLE_SPENT_KEY = "todoapp:pebble_spent";
export const GEMS_SPENT_KEY = "todoapp:gems_spent";
export const GEMS_BONUS_KEY = "todoapp:gems_bonus";

// ── Canonical Locking Hierarchy ─────────────────────────────────────
export const PEBBLE_ECONOMY_LOCK = "pebble:v1:economy_lock";

// ── Unlocked Core Primitives (RMW under PEBBLE_ECONOMY_LOCK) ─────────

export async function earnPebbleUnlocked(
  type: PebbleType,
  rewardId?: string
): Promise<{ success: boolean; changed: boolean }> {
  const raw = await AsyncStorage.getItem(PEBBLE_LOG_KEY);
  let log: PebbleLogEntry[] = [];
  if (raw) {
    try {
      log = JSON.parse(raw);
    } catch {
      log = [];
    }
  }

  // Idempotency check: if rewardId is provided and already recorded, no-op
  if (rewardId) {
    const alreadyRewarded = log.some((entry) => entry.rewardId === rewardId);
    if (alreadyRewarded) {
      return { success: true, changed: false };
    }
  }

  // Check today's local date key (YYYY-MM-DD)
  const todayStr = getOffsetDateKey(0);
  const todayPebbles = log.filter((entry) => {
    const d = new Date(entry.timestamp);
    return dateKeyFromDate(d) === todayStr;
  });

  if (todayPebbles.length >= 15) {
    console.log("Daily pebble limit reached (15/day).");
    return { success: false, changed: false };
  }

  const isFirstPebbleToday = todayPebbles.length === 0;
  log.push({ type, timestamp: Date.now(), rewardId });
  await AsyncStorage.setItem(PEBBLE_LOG_KEY, JSON.stringify(log));

  if (isFirstPebbleToday) {
    await earnBonusGemUnlocked(1);
  }

  return { success: true, changed: true };
}

export async function reversePebbleRewardUnlocked(
  rewardId: string
): Promise<boolean> {
  const raw = await AsyncStorage.getItem(PEBBLE_LOG_KEY);
  if (!raw) return false;
  let log: PebbleLogEntry[];
  try {
    log = JSON.parse(raw);
  } catch {
    return false;
  }

  // Find by exact reward identity (most recent first)
  const idx = log.map((p) => p.rewardId).lastIndexOf(rewardId);
  if (idx === -1) {
    console.warn(`Pebble reward not found for reversal: ${rewardId}`);
    return false;
  }

  const removedEntry = log[idx];
  const removedDate = new Date(removedEntry.timestamp);
  const removedDateKey = dateKeyFromDate(removedDate);

  // Check if this was the ONLY pebble that day (it triggered a bonus gem)
  const pebblesOnSameDay = log.filter((entry) => {
    const d = new Date(entry.timestamp);
    return dateKeyFromDate(d) === removedDateKey;
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

  return true;
}

export async function earnBonusGemUnlocked(amount: number = 1): Promise<void> {
  const bonusRaw = await AsyncStorage.getItem(GEMS_BONUS_KEY);
  const currentBonus = bonusRaw ? parseInt(bonusRaw, 10) || 0 : 0;
  await AsyncStorage.setItem(GEMS_BONUS_KEY, String(currentBonus + amount));
}

export async function spendGemsUnlocked(
  amount: number = 1,
  options?: { spendId?: string }
): Promise<{ success: boolean; changed: boolean }> {
  // Idempotency: if spendId is provided and already recorded, no-op
  if (options?.spendId) {
    const rawSpent = await AsyncStorage.getItem(PEBBLE_SPENT_KEY);
    if (rawSpent) {
      try {
        const parsed = JSON.parse(rawSpent);
        if (Array.isArray(parsed) && parsed.some((e: any) => e.spendId === options.spendId)) {
          return { success: true, changed: false };
        }
      } catch {}
    }
  }

  const balance = await getGemsBalanceUnlocked();
  if (balance < amount) {
    return { success: false, changed: false };
  }

  const spentRaw = await AsyncStorage.getItem(GEMS_SPENT_KEY);
  const spent = spentRaw ? parseInt(spentRaw, 10) || 0 : 0;
  await AsyncStorage.setItem(GEMS_SPENT_KEY, String(spent + amount));

  if (options?.spendId) {
    try {
      const rawSpent = await AsyncStorage.getItem(PEBBLE_SPENT_KEY);
      let spendLog: SpendLogEntry[] = [];
      if (rawSpent) {
        const parsed = JSON.parse(rawSpent);
        if (Array.isArray(parsed)) spendLog = parsed;
      }
      spendLog.push({
        spendId: options.spendId,
        amount,
        timestamp: Date.now(),
      });
      await AsyncStorage.setItem(PEBBLE_SPENT_KEY, JSON.stringify(spendLog));
    } catch {}
  }

  return { success: true, changed: true };
}

export async function getGemsBalanceUnlocked(): Promise<number> {
  try {
    const counts = await getPebbleCountsUnlocked();
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

export async function getMainStreakRecoveryInfoUnlocked(): Promise<StreakRecoveryInfo> {
  try {
    const counts = await getPebbleCountsUnlocked();
    const log = counts.log || [];
    if (log.length === 0) {
      return { eligible: false, previousStreak: 0, brokenDate: "" };
    }

    const completedDates = new Set<string>();
    log.forEach((entry) => {
      const d = new Date(entry.timestamp);
      completedDates.add(dateKeyFromDate(d));
    });

    // Include recovered dates
    const recoveriesRaw = await AsyncStorage.getItem(STREAK_RECOVERIES_KEY);
    if (recoveriesRaw) {
      try {
        const parsed = JSON.parse(recoveriesRaw);
        if (Array.isArray(parsed)) {
          parsed.forEach((r: string) => completedDates.add(r));
        }
      } catch {}
    }

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

export async function recoverMainStreakUnlocked(
  options?: { recoveryId?: string }
): Promise<boolean> {
  const recoveryInfo = await getMainStreakRecoveryInfoUnlocked();
  if (!recoveryInfo.eligible) {
    return false;
  }

  const brokenDate = recoveryInfo.brokenDate;
  const recoveriesRaw = await AsyncStorage.getItem(STREAK_RECOVERIES_KEY);
  const recoveredDates: string[] = recoveriesRaw ? JSON.parse(recoveriesRaw) : [];

  if (recoveredDates.includes(brokenDate)) {
    return false;
  }

  // Spend 1 Gem idempotently
  const spendId = options?.recoveryId || `recovery:${brokenDate}`;
  const spendRes = await spendGemsUnlocked(1, { spendId });
  if (!spendRes.success) {
    return false;
  }

  recoveredDates.push(brokenDate);
  await AsyncStorage.setItem(STREAK_RECOVERIES_KEY, JSON.stringify(recoveredDates));
  return true;
}

export async function reconcilePebbleAccountingUnlocked(): Promise<PebbleReconciliationReport> {
  let deduplicatedCount = 0;
  let repairedBonus = false;
  let repairedSpent = false;

  const raw = await AsyncStorage.getItem(PEBBLE_LOG_KEY);
  let log: PebbleLogEntry[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        log = parsed;
      }
    } catch {
      log = [];
    }
  }

  // Deduplicate entries with identical rewardId, keeping the earliest timestamp
  if (log.length > 0) {
    const seenRewardIds = new Set<string>();
    const sanitizedLog: PebbleLogEntry[] = [];

    for (const entry of log) {
      if (entry.rewardId) {
        if (seenRewardIds.has(entry.rewardId)) {
          deduplicatedCount++;
          continue; // skip duplicate
        }
        seenRewardIds.add(entry.rewardId);
      }
      sanitizedLog.push(entry);
    }

    if (deduplicatedCount > 0) {
      log = sanitizedLog;
      await AsyncStorage.setItem(PEBBLE_LOG_KEY, JSON.stringify(log));
    }
  }

  // Sanitize bonus gems counter
  const bonusRaw = await AsyncStorage.getItem(GEMS_BONUS_KEY);
  if (bonusRaw !== null) {
    const bonusVal = parseInt(bonusRaw, 10);
    if (isNaN(bonusVal) || bonusVal < 0) {
      await AsyncStorage.setItem(GEMS_BONUS_KEY, "0");
      repairedBonus = true;
    }
  }

  // Sanitize spent gems counter
  const spentRaw = await AsyncStorage.getItem(GEMS_SPENT_KEY);
  if (spentRaw !== null) {
    const spentVal = parseInt(spentRaw, 10);
    if (isNaN(spentVal) || spentVal < 0) {
      await AsyncStorage.setItem(GEMS_SPENT_KEY, "0");
      repairedSpent = true;
    }
  }

  const currentGemsBalance = await getGemsBalanceUnlocked();

  return {
    deduplicatedPebbles: deduplicatedCount,
    repairedBonus,
    repairedSpent,
    logCount: log.length,
    currentGemsBalance,
  };
}

export async function ensurePebbleLogInitializedUnlocked(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PEBBLE_LOG_KEY);
    if (raw) return; // Already initialized

    // Count lifetime completed todos from repository
    let todosCompleted = 0;
    try {
      const folders = await WorkspaceRepository.getWorkspaces();
      for (const folder of folders) {
        const tasksMap = await TaskRepository.getTasks(folder.id);
        const compCount = Object.values(tasksMap).filter((t: any) => isTaskCompleted(t)).length;
        todosCompleted += compCount;
      }
    } catch {}

    // Backfill from history entries to restore correct dates
    const rawHistory = await AsyncStorage.getItem("pebble:history");
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

    await AsyncStorage.setItem(PEBBLE_LOG_KEY, JSON.stringify(log));
  } catch (e) {
    console.warn("Failed to initialize pebble log", e);
  }
}

export async function getPebbleCountsUnlocked(): Promise<PebbleCounts> {
  try {
    // Make sure log is initialized
    await ensurePebbleLogInitializedUnlocked();

    const raw = await AsyncStorage.getItem(PEBBLE_LOG_KEY);
    if (!raw) {
      return {
        lifetime: 0,
        monthly: 0,
        today: 0,
        todayTypes: { task: 0, habit: 0, focus: 0, checklist: 0 },
        monthlyTypes: { task: 0, habit: 0, focus: 0, checklist: 0 },
        lifetimeTypes: { task: 0, habit: 0, focus: 0, checklist: 0 },
        streak: 0,
        bestStreak: 0,
        weeklyStatus: [],
      };
    }
    const log: PebbleLogEntry[] = JSON.parse(raw);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const todayKey = getOffsetDateKey(0);
    let today = 0;
    let monthly = 0;
    const todayTypes = { task: 0, habit: 0, focus: 0, checklist: 0 };
    const monthlyTypes = { task: 0, habit: 0, focus: 0, checklist: 0 };

    log.forEach((entry) => {
      const entryDate = new Date(entry.timestamp);
      if (
        entryDate.getFullYear() === currentYear &&
        entryDate.getMonth() === currentMonth
      ) {
        monthly++;
        monthlyTypes[entry.type]++;
      }

      const d = entryDate;
      if (dateKeyFromDate(d) === todayKey) {
        today++;
        todayTypes[entry.type]++;
      }
    });

    const recoveriesRaw = await AsyncStorage.getItem(STREAK_RECOVERIES_KEY);
    const recoveredDates = new Set<string>(recoveriesRaw ? JSON.parse(recoveriesRaw) : []);

    const streak = calculateStreak(log, recoveredDates);
    const bestStreak = calculateBestStreak(log, recoveredDates);
    const weeklyStatus = getWeeklyStatus(log);

    const lifetimeTypes = { task: 0, habit: 0, focus: 0, checklist: 0 };
    log.forEach((entry) => {
      lifetimeTypes[entry.type]++;
    });

    return {
      lifetime: log.length,
      monthly,
      today,
      todayTypes,
      monthlyTypes,
      lifetimeTypes,
      streak,
      bestStreak,
      weeklyStatus,
      log,
    };
  } catch {
    return {
      lifetime: 0,
      monthly: 0,
      today: 0,
      todayTypes: { task: 0, habit: 0, focus: 0, checklist: 0 },
      monthlyTypes: { task: 0, habit: 0, focus: 0, checklist: 0 },
      lifetimeTypes: { task: 0, habit: 0, focus: 0, checklist: 0 },
      streak: 0,
      bestStreak: 0,
      weeklyStatus: [],
    };
  }
}

// ── Public Mutex-Protected API Boundary ─────────────────────────────

export async function earnPebble(type: PebbleType, rewardId?: string): Promise<boolean> {
  return withLock(PEBBLE_ECONOMY_LOCK, async () => {
    try {
      const result = await earnPebbleUnlocked(type, rewardId);
      if (result.changed) {
        emitStateChange("pebbles_changed", "pebble_service");
      }
      return result.success;
    } catch (e) {
      console.warn("Failed to earn pebble", e);
      return false;
    }
  });
}

export async function reversePebbleReward(rewardId: string): Promise<boolean> {
  return withLock(PEBBLE_ECONOMY_LOCK, async () => {
    try {
      const success = await reversePebbleRewardUnlocked(rewardId);
      if (success) {
        emitStateChange("pebbles_changed", "pebble_service");
      }
      return success;
    } catch (e) {
      console.warn("Failed to undo pebble", e);
      return false;
    }
  });
}

export async function getPebbleCounts(): Promise<PebbleCounts> {
  return getPebbleCountsUnlocked();
}

export async function ensurePebbleLogInitialized(): Promise<void> {
  const raw = await AsyncStorage.getItem(PEBBLE_LOG_KEY);
  if (raw) return;
  await withLock(PEBBLE_ECONOMY_LOCK, async () => {
    await ensurePebbleLogInitializedUnlocked();
  });
}

export async function getPebbleBalance(): Promise<number> {
  return getGemsBalance();
}

export async function spendPebbles(amount: number): Promise<boolean> {
  return spendGems(1);
}

export async function getGemsBalance(): Promise<number> {
  return getGemsBalanceUnlocked();
}

export async function earnBonusGem(amount: number = 1): Promise<void> {
  return withLock(PEBBLE_ECONOMY_LOCK, async () => {
    try {
      await earnBonusGemUnlocked(amount);
      emitStateChange("pebbles_changed", "pebble_service");
    } catch (e) {
      console.warn("Failed to earn bonus gem", e);
    }
  });
}

export async function spendGems(
  amount: number = 1,
  options?: { spendId?: string }
): Promise<boolean> {
  return withLock(PEBBLE_ECONOMY_LOCK, async () => {
    try {
      const result = await spendGemsUnlocked(amount, options);
      if (result.changed) {
        emitStateChange("pebbles_changed", "pebble_service");
      }
      return result.success;
    } catch (e) {
      console.warn("Failed to spend gems", e);
      return false;
    }
  });
}

export async function getMainStreakRecoveryInfo(): Promise<StreakRecoveryInfo> {
  return getMainStreakRecoveryInfoUnlocked();
}

export async function recoverMainStreak(
  options?: { recoveryId?: string }
): Promise<boolean> {
  return withLock(PEBBLE_ECONOMY_LOCK, async () => {
    try {
      const success = await recoverMainStreakUnlocked(options);
      if (success) {
        emitStateChange("pebbles_changed", "pebble_service");
      }
      return success;
    } catch (e) {
      console.warn("Failed to recover main streak", e);
      return false;
    }
  });
}

export async function reconcilePebbleAccounting(): Promise<PebbleReconciliationReport> {
  return withLock(PEBBLE_ECONOMY_LOCK, async () => {
    const report = await reconcilePebbleAccountingUnlocked();
    if (report.deduplicatedPebbles > 0 || report.repairedBonus || report.repairedSpent) {
      emitStateChange("pebbles_changed", "pebble_service");
    }
    return report;
  });
}

// ── Internal Helpers ────────────────────────────────────────────────

function calculateBestStreak(log: PebbleLogEntry[], recoveredDates: Set<string> = new Set()) {
  if (log.length === 0) return 0;
  
  const completedDates = new Set<string>(recoveredDates);
  log.forEach((entry) => {
    const d = new Date(entry.timestamp);
    completedDates.add(dateKeyFromDate(d));
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

  const activeStreak = calculateStreak(log, recoveredDates);
  return Math.max(maxStreak, activeStreak);
}

function calculateStreak(log: PebbleLogEntry[], recoveredDates: Set<string> = new Set()) {
  if (log.length === 0) return 0;
  
  const completedDates = new Set<string>(recoveredDates);
  log.forEach((entry) => {
    const d = new Date(entry.timestamp);
    completedDates.add(dateKeyFromDate(d));
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
    completedDates.add(dateKeyFromDate(d));
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
    const dateKey = dateKeyFromDate(d);
    return {
      label,
      completed: completedDates.has(dateKey),
      dateKey,
      isToday: dateKey === getOffsetDateKey(0),
    };
  });
}
