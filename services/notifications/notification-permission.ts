import { Linking, Platform } from "react-native";

/**
 * notification-permission.ts
 * ──────────────────────────
 * Canonical notification permission lifecycle for Pebble.
 *
 * The OS notification permission must only be requested after the user has
 * expressed explicit intent (e.g. tapping "Enable Alerts" in the Alert
 * Center). Nothing on app startup, screen mount, or reconciliation is allowed
 * to trigger the native permission prompt automatically.
 *
 * This module is the single place that:
 *  - reads the current OS permission (web + native),
 *  - invokes the native permission request (only for explicit user intent),
 *  - routes permanently-denied installs to the system Settings screen
 *    instead of repeatedly re-invoking a doomed native request.
 *
 * It never persists Pebble preferences and never schedules notifications —
 * scheduling and preference persistence stay on their canonical paths
 * (NotificationReconcilerService / SettingsRepository / domain repositories).
 */

export type PermissionRequestResult = {
  status: string;
  /** True when the user was routed to the OS Settings screen instead of (or
   *  after) the native prompt — i.e. permission can only be restored there. */
  openedSettings: boolean;
};

async function loadNotifications() {
  return import("expo-notifications");
}

/**
 * Reads the current OS notification permission without prompting.
 * Safe to call at any time (startup inspection included).
 */
export async function getNotificationPermissionStatus(): Promise<string> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && "Notification" in window) {
      const permission = (window as any).Notification.permission;
      return permission === "default" ? "undetermined" : permission;
    }
    return "unsupported";
  }
  try {
    const Notifications = await loadNotifications();
    const { status } = await Notifications.getPermissionsAsync();
    return status;
  } catch {
    return "undetermined";
  }
}

/**
 * Opens the OS app settings where the user can restore notification
 * permission. Only meaningful on iOS/Android; web has no equivalent.
 */
export async function openNotificationSettings(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    await Linking.openSettings();
    return true;
  } catch {
    return false;
  }
}

/**
 * The deliberate permission-request flow. Call ONLY from explicit
 * user-intent actions ("Enable Alerts" / equivalent).
 *
 *  - already granted      → no request, returns current status
 *  - undetermined / askable → invokes the native prompt once
 *  - permanently denied   → does NOT re-invoke the native prompt; opens the
 *                           system Settings screen instead
 *  - web                  → uses the browser Notification API
 *
 * Never called automatically: not on launch, not on mount, not by
 * reconciliation.
 */
export async function requestNotificationPermission(): Promise<PermissionRequestResult> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && "Notification" in window) {
      const status = await (window as any).Notification.requestPermission();
      return {
        status: status === "default" ? "undetermined" : status,
        openedSettings: false,
      };
    }
    return { status: "unsupported", openedSettings: false };
  }
  try {
    const Notifications = await loadNotifications();
    const current = await Notifications.getPermissionsAsync();

    if (current.status === "granted") {
      return { status: current.status, openedSettings: false };
    }

    // The OS can still surface the prompt (first launch, or Android without a
    // permanent "don't ask again" denial). This is the explicit-intent request.
    if (current.canAskAgain !== false) {
      const result = await Notifications.requestPermissionsAsync();
      return { status: result.status, openedSettings: false };
    }

    // Permanent denial: the native request can never succeed again. Route the
    // user to system Settings instead of repeatedly invoking a dead prompt.
    const opened = await openNotificationSettings();
    return { status: current.status, openedSettings: opened };
  } catch {
    return { status: "undetermined", openedSettings: false };
  }
}