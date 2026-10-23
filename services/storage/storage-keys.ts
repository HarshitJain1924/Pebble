/**
 * storage-keys.ts
 * ───────────────
 * Authoritative registry of Pebble-owned storage keys and dynamic patterns.
 * Defines the canonical contract for what data Pebble owns in local persistence.
 */

export const RESTORE_INTENT_KEY = "pebble:v1:backup_restore_intent";

// ── Today dashboard filter preferences ──────────────────────────────
// Defined here (the ownership module) so the registry and the persistence
// layer share one literal per key instead of re-typing the string.
export const DASHBOARD_FILTER_STORAGE_KEY = "todoapp:dashboard:filter";
export const DASHBOARD_PRIORITY_STORAGE_KEY = "todoapp:dashboard:priority";
export const DASHBOARD_WORKSPACE_STORAGE_KEY = "todoapp:dashboard:workspace";
export const DASHBOARD_CATEGORY_STORAGE_KEY = "todoapp:dashboard:category";
export const DASHBOARD_SCHEDULE_STORAGE_KEY = "todoapp:dashboard:schedule";
export const DASHBOARD_STATUS_STORAGE_KEY = "todoapp:dashboard:status";
export const DASHBOARD_SORT_STORAGE_KEY = "todoapp:dashboard:sort";

/**
 * Exact, static keys owned by Pebble across all features and layers.
 */
export const PEBBLE_EXACT_OWNED_KEYS = new Set<string>([
  // 1. Canonical Domain & System State (v1)
  "pebble:v1:workspaces",
  "pebble:v1:recycle_bin",
  "pebble:v1:relationships",
  "pebble:v1:focus_sessions",
  "pebble:v1:system_event_log",
  "pebble:v1:tombstones",
  "pebble:v1:ui_state",
  "pebble:v1:move_journal",
  "pebble:v1:move_journal_seq",
  "pebble:v1:conversion_journal",
  "pebble:v1:conversion_journal_seq",
  "pebble:v1:reconciler_running",
  "pebble:v1:graph_reconciler_running",
  RESTORE_INTENT_KEY,

  // 2. Settings & Profile
  "pebble:settings",
  "pebble:profile",

  // 3. Legacy & Auxiliary Storage
  "pebble:checklists",
  "pebble:collections",
  "pebble:history",
  "pebble:notifications:log",
  "pebble:recycle_bin",
  "pebble:quick-suggestions:seen",
  "pebble:workspace:history",
  "pebble:vault",
  "pebble:schema_version",
  "pebble:tasks",
  "pebble:habits",

  // 4. Analytics & Widgets
  "@pebble_widget_payload",

  // 5. Quick Capture
  "PEBBLE_CAPTURE_CREATION_HISTORY",
  "PEBBLE_CAPTURE_ACTIVE_SUGGESTIONS",

  // 6. Focus, Dashboard, Calendar, Mascot & Onboarding (todoapp:*)
  DASHBOARD_FILTER_STORAGE_KEY,
  DASHBOARD_PRIORITY_STORAGE_KEY,
  DASHBOARD_WORKSPACE_STORAGE_KEY,
  DASHBOARD_CATEGORY_STORAGE_KEY,
  DASHBOARD_SCHEDULE_STORAGE_KEY,
  DASHBOARD_STATUS_STORAGE_KEY,
  DASHBOARD_SORT_STORAGE_KEY,
  "todoapp:calendar:selectedDate",
  "todoapp:gratitude_history",
  "todoapp:onboarding_completed",
  "todoapp:mascot:dismissed",
  "todoapp:focus:current_session",
  "todoapp:focus:current_stopwatch",
  "todoapp:focus:custom_tracks",
  "todoapp:focus:glow_enabled",
  "todoapp:focus:is_muted",
  "todoapp:focus:is_repeat",
  "todoapp:focus:is_shuffle",
  "todoapp:focus:liked_sound_ids",
  "todoapp:focus:selected_sound_id",
  "todoapp:focus:sound_volume",
  "todoapp:focus:stats",

  // 7. Economy & Gamification (todoapp:*)
  "todoapp:pebble_log",
  "todoapp:pebble_spent",
  "todoapp:gems_bonus",
  "todoapp:gems_spent",
  "todoapp:streak_recoveries",
]);

/**
 * Regular expressions for dynamic partition keys owned by Pebble.
 * Workspace entities are partitioned by workspace ID: pebble:v1:<entityType>:<workspaceId>
 */
const PEBBLE_DYNAMIC_KEY_PATTERNS: RegExp[] = [
  /^pebble:v1:tasks:[a-zA-Z0-9_-]+$/,
  /^pebble:v1:habits:[a-zA-Z0-9_-]+$/,
  /^pebble:v1:checklists:[a-zA-Z0-9_-]+$/,
  /^pebble:v1:resources:[a-zA-Z0-9_-]+$/,
];

/**
 * Authoritative predicate determining whether a storage key is owned by Pebble.
 * Rejects arbitrary or pseudo-Pebble keys that do not match the enumerated contract.
 */
export function isPebbleOwnedKey(key: string): boolean {
  if (PEBBLE_EXACT_OWNED_KEYS.has(key)) {
    return true;
  }
  return PEBBLE_DYNAMIC_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

// ── Backup / restore policy ─────────────────────────────────────────
//
// The structured backup payload (version 1) carries user *data*: workspaces,
// entities, recycle bin, relationships, system events, focus-session history,
// settings, profile, ui state and gratitude history. Restore removes every
// owned key and then writes the payload, so any owned key that is NOT in the
// payload is destroyed. Each such key needs an explicit decision:
//
//   preserved — device-local preference. Survives restore untouched.
//   reset     — owned, not in the payload, deliberately cleared.
//
// Keys backed up and restored (restored) are the payload keys themselves; the
// backup function serializes them by name, not by scanning AsyncStorage, so no
// entry is needed here for them.

export type RestorePolicy = "preserved" | "reset";

/**
 * Device-local presentation preferences.
 *
 * These describe how *this device* shows Pebble (dashboard filters, focus sound
 * setup, last calendar day, mascot state). They are not user content, so a data
 * restore must not silently wipe them — and they are deliberately excluded from
 * backups so a backup taken on one device cannot impose its audio/filter setup
 * on another.
 */
export const PEBBLE_RESTORE_PRESERVED_KEYS = new Set<string>([
  // Today dashboard filter prefs
  DASHBOARD_FILTER_STORAGE_KEY,
  DASHBOARD_PRIORITY_STORAGE_KEY,
  DASHBOARD_WORKSPACE_STORAGE_KEY,
  DASHBOARD_CATEGORY_STORAGE_KEY,
  DASHBOARD_SCHEDULE_STORAGE_KEY,
  DASHBOARD_STATUS_STORAGE_KEY,
  DASHBOARD_SORT_STORAGE_KEY,
  // Focus sound prefs (device audio setup, not session data)
  "todoapp:focus:selected_sound_id",
  "todoapp:focus:sound_volume",
  "todoapp:focus:is_muted",
  "todoapp:focus:liked_sound_ids",
  "todoapp:focus:custom_tracks",
  "todoapp:focus:is_shuffle",
  "todoapp:focus:is_repeat",
  "todoapp:focus:glow_enabled",
  // Navigation / presentation state
  "todoapp:calendar:selectedDate",
  "todoapp:mascot:dismissed",
]);

/**
 * In-flight or infrastructure keys that must never survive a restore.
 *
 * They cannot be meaningfully restored (a paused timer belongs to the previous
 * data set) or are single-flight guards whose values would be invalid after the
 * payload replaces the domain. They are cleared as part of the restore reset.
 */
export const PEBBLE_RESTORE_EPHEMERAL_KEYS = new Set<string>([
  "todoapp:focus:current_session",
  "todoapp:focus:current_stopwatch",
  "pebble:v1:move_journal",
  "pebble:v1:move_journal_seq",
  "pebble:v1:conversion_journal",
  "pebble:v1:conversion_journal_seq",
  "pebble:v1:reconciler_running",
  "pebble:v1:graph_reconciler_running",
  RESTORE_INTENT_KEY,
]);

/** Whether restore must leave this key untouched. */
export function isPreservedOnRestore(key: string): boolean {
  return PEBBLE_RESTORE_PRESERVED_KEYS.has(key);
}

/** Whether this key is in-flight/infrastructure state rather than user data. */
export function isEphemeralStorageKey(key: string): boolean {
  return PEBBLE_RESTORE_EPHEMERAL_KEYS.has(key);
}

/**
 * Declared policy for one owned key. Dynamic partition keys (entities) are
 * always restored from the payload.
 */
export function getRestorePolicy(key: string): RestorePolicy {
  return isPreservedOnRestore(key) ? "preserved" : "reset";
}
