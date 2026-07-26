import type { Habit, Task, Settings, UserProfile } from "@/shared/types/domain.types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PROFILE_STORAGE_KEY, SETTINGS_STORAGE_KEY } from "@/services/storage/storage.service";
import { UiStateRepository } from "@/repositories";
import { isTaskCompleted, isHabitCompletedToday } from "@/shared/utils/domain-selectors";

export type AppSettings = Settings;
export type { UserProfile };

const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  quietHours: {
    enabled: false,
    startHour: 22,
    endHour: 7,
  },
  categories: {
    work: true,
    personal: true,
    health: true,
    learning: true,
    creative: true,
    focus: true,
    habit: true,
  },
  escalationEnabled: true,
  showDuration: true,
  showRepeat: true,
  showReminder: true,
  showTags: true,
  showNotes: true,
  showMascot: true,
  editorRowOrder: [
    "date",
    "workspace",
    "priority",
    "reminder",
    "repeat",
    "duration",
    "tags",
  ],
};

const DEFAULT_PROFILE: UserProfile = {
  name: "User",
  email: "local@me",
  avatar: "👨‍💻",
  level: 1,
  xp: 0,
};

export function getLevelInfo(xp: number) {
  let level = 1;
  let xpNeededForNext = 100;
  let accumulatedXpForCurrent = 0;
  let remaining = xp;

  while (true) {
    const cost = level * 100;
    if (remaining >= cost) {
      remaining -= cost;
      accumulatedXpForCurrent += cost;
      level++;
    } else {
      xpNeededForNext = cost;
      break;
    }
  }

  const currentLevelProgressXp = remaining;
  const progressPct = currentLevelProgressXp / xpNeededForNext;

  let rank = "Mindful Starter";
  if (level >= 10) rank = "Productivity Overlord 👑";
  else if (level >= 7) rank = "Ultimate Focus Zen Master 🧘";
  else if (level >= 5) rank = "Flow State Master ⚡";
  else if (level >= 3) rank = "Efficiency Builder 🛠";
  else if (level >= 2) rank = "Active Organizer 📋";

  return {
    level,
    xpInCurrentLevel: currentLevelProgressXp,
    xpNeededForNext,
    progressPct,
    rank,
  };
}

export async function getSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  await UiStateRepository.saveUiState({ themeCache: settings.theme === "system" ? "dark" : settings.theme });
}

export async function getProfile(): Promise<UserProfile> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PROFILE, ...parsed };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  if (profile.name !== "") {
    await UiStateRepository.saveUiState({ completedOnboarding: true });
  }
}

export async function addXp(amount: number): Promise<UserProfile> {
  const profile = await getProfile();
  const oldXp = profile.xp;
  const newXp = oldXp + amount;

  const newLevelInfo = getLevelInfo(newXp);

  const updatedProfile: UserProfile = {
    ...profile,
    xp: newXp,
    level: newLevelInfo.level,
  };

  await saveProfile(updatedProfile);
  return updatedProfile;
}

export async function handleTaskXpChange(
  todo: Task,
  nextCompleted: boolean,
): Promise<{ xpAwarded: boolean; xpChange: number }> {
  let xpChange = 0;
  const currentlyCompleted = isTaskCompleted(todo);
  let xpAwarded = currentlyCompleted;

  if (nextCompleted) {
    if (!currentlyCompleted) {
      xpChange = 10;
      xpAwarded = true;
    }
  } else {
    if (currentlyCompleted) {
      xpChange = -10;
      xpAwarded = false;
    }
  }

  if (xpChange !== 0) {
    await addXp(xpChange).catch(() => {});
  }

  return { xpAwarded, xpChange };
}

export async function handleHabitXpChange(
  habit: Habit,
  nextCompleted: boolean,
  todayKey: string,
): Promise<{ xpAwardedDate?: string; xpChange: number }> {
  let xpChange = 0;
  const currentlyCompleted = isHabitCompletedToday(habit, todayKey);
  let xpAwardedDate = currentlyCompleted ? todayKey : undefined;

  if (nextCompleted) {
    if (!currentlyCompleted) {
      xpChange = 15;
      xpAwardedDate = todayKey;
    }
  } else {
    if (currentlyCompleted) {
      xpChange = -15;
      xpAwardedDate = undefined;
    }
  }

  if (xpChange !== 0) {
    await addXp(xpChange).catch(() => {});
  }

  return { xpAwardedDate, xpChange };
}

export function isCurrentlyInQuietHours(
  settings: Settings,
  targetHour: number,
): boolean {
  if (!settings?.quietHours?.enabled) return false;

  const { startHour, endHour } = settings.quietHours;
  if (startHour === undefined || endHour === undefined || startHour === endHour)
    return false;

  if (startHour < endHour) {
    return targetHour >= startHour && targetHour < endHour;
  } else {
    return targetHour >= startHour || targetHour < endHour;
  }
}
