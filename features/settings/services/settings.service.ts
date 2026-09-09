import type { Settings, UserProfile } from "@/shared/types/domain.types";
import { UiStateRepository } from "@/repositories";
import {
  SettingsRepository,
  type SettingsPatch,
} from "@/repositories/SettingsRepository";
import { UserProfileRepository } from "@/repositories/UserProfileRepository";

export type AppSettings = Settings;
export type { UserProfile };

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
  return SettingsRepository.getSettings();
}

export async function saveSettings(settings: Settings): Promise<void> {
  await SettingsRepository.saveSettings(settings);
  await UiStateRepository.saveUiState({
    themeCache: settings.theme === "system" ? "dark" : settings.theme,
  });
}

export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  const next = await SettingsRepository.updateSettings(patch);
  await UiStateRepository.saveUiState({
    themeCache: next.theme === "system" ? "dark" : next.theme,
  });
  return next;
}

export async function getProfile(): Promise<UserProfile> {
  return UserProfileRepository.getProfile();
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await UserProfileRepository.saveProfile(profile);
}

export async function updateProfile(
  patch: Partial<UserProfile>,
): Promise<UserProfile> {
  const next = await UserProfileRepository.updateProfile(patch);
  return next;
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