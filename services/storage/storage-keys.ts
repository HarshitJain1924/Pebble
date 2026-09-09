/**
 * storage-keys.ts
 * ───────────────
 * Authoritative registry of Pebble-owned storage keys and dynamic patterns.
 * Defines the canonical contract for what data Pebble owns in local persistence.
 */

export const RESTORE_INTENT_KEY = "pebble:v1:backup_restore_intent";

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
  "todoapp:dashboard:filter",
  "todoapp:dashboard:priority",
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
