import AsyncStorage from "@react-native-async-storage/async-storage";
import { PROFILE_STORAGE_KEY, SETTINGS_STORAGE_KEY } from "./storage";

export type AppSettings = {
  theme: "dark" | "light" | "system";
  quietHours: {
    enabled: boolean;
    startHour: number; // 0..23
    endHour: number;   // 0..23
  };
  categories: Record<string, boolean>; // category key -> enabled
  escalationEnabled: boolean;
  showDuration?: boolean;
  showRepeat?: boolean;
  showReminder?: boolean;
  showTags?: boolean;
  showNotes?: boolean;
  editorRowOrder?: string[];
};

export type UserProfile = {
  name: string;
  email: string;
  avatar: string;
  level: number;
  xp: number;
};

const DEFAULT_SETTINGS: AppSettings = {
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
  editorRowOrder: ["date", "workspace", "priority", "reminder", "repeat", "duration", "tags"],
};

const DEFAULT_PROFILE: UserProfile = {
  name: "User",
  email: "local@me",
  avatar: "👨‍💻",
  level: 1,
  xp: 0,
};

// Calculate level based on XP. XP needed for level L is L * 100
// Level 1: 0 - 99 XP
// Level 2: 100 - 299 XP (200 XP more)
// Level L: requires Level-Up XP = L * 100
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

  // Level Rank Name
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

export async function getSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
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
}

export async function addXp(amount: number): Promise<UserProfile> {
  const profile = await getProfile();
  const oldXp = profile.xp;
  const newXp = oldXp + amount;
  
  const oldLevelInfo = getLevelInfo(oldXp);
  const newLevelInfo = getLevelInfo(newXp);

  const updatedProfile: UserProfile = {
    ...profile,
    xp: newXp,
    level: newLevelInfo.level,
  };

  await saveProfile(updatedProfile);
  return updatedProfile;
}

// Helper to determine if a given hour falls inside quiet hours
export function isCurrentlyInQuietHours(
  settings: AppSettings,
  targetHour: number,
): boolean {
  if (!settings.quietHours.enabled) return false;
  
  const { startHour, endHour } = settings.quietHours;
  if (startHour === endHour) return false;
  
  if (startHour < endHour) {
    // Normal interval (e.g. 22 to 7 -> startHour > endHour usually, but let's handle normal interval 9 to 17)
    return targetHour >= startHour && targetHour < endHour;
  } else {
    // Wrap around midnight (e.g. 22 to 7)
    return targetHour >= startHour || targetHour < endHour;
  }
}
