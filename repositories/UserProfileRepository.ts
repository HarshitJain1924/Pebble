/**
 * UserProfileRepository.ts
 * ────────────────────────
 * UserProfile persistence — single global key `pebble:profile` (preserved for
 * existing installs) with defensive runtime normalization.
 *
 * Persisted JSON must never be trusted as a fully-formed `UserProfile` object:
 * each field is validated and falls back to the canonical default when missing
 * or malformed. Unknown top-level fields are preserved so forward-compatible
 * payloads survive a round trip.
 */
import { type UserProfile } from "@/shared/types/domain.types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { withLock } from "@/shared/utils/mutex";

export const PROFILE_STORAGE_KEY = "pebble:profile";

export const DEFAULT_PROFILE: UserProfile = {
  name: "User",
  email: "local@me",
  avatar: "👨‍💻",
};

/**
 * Coerce arbitrary persisted data into a fully valid `UserProfile` object.
 */
export function normalizeUserProfile(raw: any): UserProfile {
  const base: any =
    raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};

  const result: any = { ...base };
  result.name =
    typeof base.name === "string" && base.name.trim().length > 0
      ? base.name
      : DEFAULT_PROFILE.name;
  result.email =
    typeof base.email === "string" ? base.email : DEFAULT_PROFILE.email;
  result.avatar =
    typeof base.avatar === "string" ? base.avatar : DEFAULT_PROFILE.avatar;

  return result as UserProfile;
}

export class UserProfileRepository {
  /**
   * Read persisted profile (or defaults when missing/corrupt).
   * Plain read — safe without a lock because AsyncStorage single-key
   * reads are atomic and the write primitives hold the canonical lock.
   */
  static async getProfile(): Promise<UserProfile> {
    return this.getProfileUnlocked();
  }

  /**
   * Unlocked read primitive required for locked Read-Modify-Write cycles
   * (see `updateProfile`) to avoid re-entrant deadlocks on the same key.
   */
  static async getProfileUnlocked(): Promise<UserProfile> {
    try {
      const raw = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
      if (!raw) return normalizeUserProfile(DEFAULT_PROFILE);
      return normalizeUserProfile(JSON.parse(raw));
    } catch (e) {
      console.warn(
        "[UserProfileRepository] Failed to parse persisted profile; using defaults",
        e,
      );
      return normalizeUserProfile(DEFAULT_PROFILE);
    }
  }

  /** Full-state write, normalized before persistence. */
  static async saveProfile(profile: UserProfile): Promise<void> {
    await withLock(PROFILE_STORAGE_KEY, async () => {
      await this.saveProfileUnlocked(profile);
    });
  }

  /** Unlocked persistence primitive for composition under held locks. */
  static async saveProfileUnlocked(profile: UserProfile): Promise<void> {
    const normalized = normalizeUserProfile(profile);
    await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(normalized));
  }

  /**
   * Locked Read-Modify-Write partial update. The read/merge/write cycle
   * happens entirely inside the lock boundary so concurrent patches never
   * lose unrelated fields.
   */
  static async updateProfile(patch: Partial<UserProfile>): Promise<UserProfile> {
    return withLock(PROFILE_STORAGE_KEY, async () => {
      return this.updateProfileUnlocked(patch);
    });
  }

  /** Unlocked partial-update primitive for composition under held locks. */
  static async updateProfileUnlocked(
    patch: Partial<UserProfile>,
  ): Promise<UserProfile> {
    const current = await this.getProfileUnlocked();
    const merged = { ...current, ...patch };
    const normalized = normalizeUserProfile(merged);
    await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }
}