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
};

export function getLevelInfo(totalPebbles: number) {
  const STAGES = [
    { max: 10, name: "First Steps" },
    { max: 25, name: "Sprout" },
    { max: 50, name: "Zen Stream" },
    { max: 100, name: "Sanctuary Base" },
    { max: 250, name: "Pebble Hoarder" },
    { max: 500, name: "Zen Mountain" },
    { max: Infinity, name: "Ocean of Focus" },
  ];

  let level = 1;
  let nextThreshold = 10;
  let rank = "First Steps";
  let minForLevel = 0;

  for (let i = 0; i < STAGES.length; i++) {
    if (totalPebbles <= STAGES[i].max) {
      level = i + 1;
      rank = STAGES[i].name;
      nextThreshold = STAGES[i].max;
      minForLevel = i === 0 ? 0 : STAGES[i - 1].max + 1;
      break;
    }
  }
  
  if (totalPebbles > 500) {
    level = 7;
    rank = "Ocean of Focus";
    nextThreshold = totalPebbles;
    minForLevel = 501;
  }

  const inCurrentLevel = totalPebbles - minForLevel;
  const neededForLevel = nextThreshold - minForLevel + (level === 7 ? 0 : 1);
  const progressPct = level === 7 ? 1 : inCurrentLevel / neededForLevel;

  return {
    level,
    xpInCurrentLevel: inCurrentLevel,
    xpNeededForNext: neededForLevel,
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



export function isCurrentlyInQuietHours(
  settings: Settings,
  targetHour: number,
  targetMinute: number = 0,
): boolean {
  if (!settings?.quietHours?.enabled) return false;

  const { startHour, endHour } = settings.quietHours;
  if (startHour === undefined || endHour === undefined || startHour === endHour)
    return false;

  const targetMinutes = targetHour * 60 + targetMinute;
  const startMinutes = startHour * 60;
  const endMinutes = endHour * 60;

  if (startMinutes < endMinutes) {
    return targetMinutes >= startMinutes && targetMinutes < endMinutes;
  } else {
    // Overnight window (e.g. 22:00 -> 07:00)
    return targetMinutes >= startMinutes || targetMinutes < endMinutes;
  }
}
