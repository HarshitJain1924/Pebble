import AsyncStorage from "@react-native-async-storage/async-storage";
import { NOTIF_LOG_STORAGE_KEY } from "@/services/storage/storage.service";
import { withLock } from "@/shared/utils/mutex";

export type NotificationLogEntry = {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  type?: string;
  itemId?: string;
};

/**
 * Internal unlocked reader primitive to prevent re-entrant mutex deadlocks.
 * Safely handles empty, corrupt, or non-array storage values by falling back to [].
 */
async function readNotificationLogsUnlocked(): Promise<NotificationLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(NOTIF_LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as NotificationLogEntry[];
  } catch {
    return [];
  }
}

export async function getNotificationLogs(): Promise<NotificationLogEntry[]> {
  return readNotificationLogsUnlocked();
}

export async function addNotificationLog(
  title: string,
  body: string,
  type?: string,
  itemId?: string,
): Promise<NotificationLogEntry> {
  return withLock(NOTIF_LOG_STORAGE_KEY, async () => {
    const logs = await readNotificationLogsUnlocked();
    const newEntry: NotificationLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title,
      body,
      timestamp: Date.now(),
      read: false,
      type,
      itemId,
    };

    const updated = [newEntry, ...logs].slice(0, 100); // Keep max 100 entries (newest-first)
    await AsyncStorage.setItem(NOTIF_LOG_STORAGE_KEY, JSON.stringify(updated));
    return newEntry;
  });
}

export async function clearNotificationLogs(): Promise<void> {
  return withLock(NOTIF_LOG_STORAGE_KEY, async () => {
    await AsyncStorage.removeItem(NOTIF_LOG_STORAGE_KEY);
  });
}

export async function markNotificationLogsAsRead(): Promise<void> {
  return withLock(NOTIF_LOG_STORAGE_KEY, async () => {
    const logs = await readNotificationLogsUnlocked();
    const updated = logs.map((log) => ({ ...log, read: true }));
    await AsyncStorage.setItem(NOTIF_LOG_STORAGE_KEY, JSON.stringify(updated));
  });
}

