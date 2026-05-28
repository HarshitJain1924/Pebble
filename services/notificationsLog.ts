import AsyncStorage from "@react-native-async-storage/async-storage";
import { NOTIF_LOG_STORAGE_KEY } from "./storage";

export type NotificationLogEntry = {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  type?: string;
  itemId?: string;
};

export async function getNotificationLogs(): Promise<NotificationLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(NOTIF_LOG_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as NotificationLogEntry[];
  } catch {
    return [];
  }
}

export async function addNotificationLog(
  title: string,
  body: string,
  type?: string,
  itemId?: string,
): Promise<NotificationLogEntry> {
  const logs = await getNotificationLogs();
  const newEntry: NotificationLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title,
    body,
    timestamp: Date.now(),
    read: false,
    type,
    itemId,
  };

  const updated = [newEntry, ...logs].slice(0, 100); // Keep max 100 entries
  await AsyncStorage.setItem(NOTIF_LOG_STORAGE_KEY, JSON.stringify(updated));
  return newEntry;
}

export async function clearNotificationLogs(): Promise<void> {
  await AsyncStorage.removeItem(NOTIF_LOG_STORAGE_KEY);
}

export async function markNotificationLogsAsRead(): Promise<void> {
  const logs = await getNotificationLogs();
  const updated = logs.map((log) => ({ ...log, read: true }));
  await AsyncStorage.setItem(NOTIF_LOG_STORAGE_KEY, JSON.stringify(updated));
}
