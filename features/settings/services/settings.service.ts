import type { Settings, UserProfile } from "@/shared/types/domain.types";
import { UiStateRepository } from "@/repositories";
import {
  SettingsRepository,
  type SettingsPatch,
} from "@/repositories/SettingsRepository";
import { UserProfileRepository } from "@/repositories/UserProfileRepository";

export type AppSettings = Settings;
export type { UserProfile };

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