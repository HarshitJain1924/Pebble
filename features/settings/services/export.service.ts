import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform, Share } from "react-native";
import { BackupService } from "@/services/storage/backup.service";

export interface ExportResult {
  success: boolean;
  cancelled?: boolean;
  fileUri?: string;
  error?: string;
}

/**
 * Returns a human-understandable, deterministic backup filename for a given date.
 * Default format: pebble-backup-YYYY-MM-DD.json
 */
export function getBackupFilename(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `pebble-backup-${yyyy}-${mm}-${dd}.json`;
}

let isExportActive = false;

/**
 * Checks whether an export operation is currently in progress.
 */
export function isExportInProgress(): boolean {
  return isExportActive;
}

/**
 * Resets the active export guard. For unit testing only.
 */
export function _resetExportInProgressStateForTests(): void {
  isExportActive = false;
}

/**
 * Generates an authoritative full backup from BackupService, writes it to a temporary
 * local file, and invokes the platform-native sharing / file-saving sheet.
 *
 * Re-entrant calls while an export is running are prevented.
 * Read-only with respect to Pebble's stored state.
 */
export async function exportBackupFile(options?: {
  now?: Date;
}): Promise<ExportResult> {
  if (isExportActive) {
    throw new Error("An export is already in progress.");
  }

  isExportActive = true;
  try {
    // 1. Authoritative backup generation
    const backupJson = await BackupService.generateStructuredBackup();

    if (!backupJson || typeof backupJson !== "string" || backupJson.trim().length === 0) {
      throw new Error("Generated backup payload is empty.");
    }

    // 2. Validate basic backup payload integrity
    let parsed: any;
    try {
      parsed = JSON.parse(backupJson);
    } catch (e: any) {
      throw new Error(`Generated backup payload is invalid JSON: ${e?.message || "parse error"}`);
    }

    if (!parsed || typeof parsed !== "object" || parsed.version === undefined) {
      throw new Error("Generated backup payload is missing required schema fields.");
    }

    // 3. Prepare file destination in cache directory
    const filename = getBackupFilename(options?.now);
    const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || "";
    const separator = cacheDir.endsWith("/") ? "" : "/";
    const fileUri = `${cacheDir}${separator}${filename}`;

    // 4. Write backup file to disk
    await FileSystem.writeAsStringAsync(fileUri, backupJson, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    // 5. Invoke native share sheet
    const sharingAvailable = await Sharing.isAvailableAsync();
    if (sharingAvailable) {
      try {
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/json",
          dialogTitle: "Export Pebble Backup",
          UTI: "public.json",
        });
        return { success: true, cancelled: false, fileUri };
      } catch (err: any) {
        const msg = err?.message?.toLowerCase() || "";
        if (msg.includes("cancel") || msg.includes("dismiss")) {
          return { success: true, cancelled: true, fileUri };
        }
        throw err;
      }
    }

    // 6. Platform fallback if expo-sharing is unavailable (e.g. web)
    if (Platform.OS === "web" || typeof Share?.share === "function") {
      const shareResult = await Share.share({
        title: filename,
        message: backupJson,
      });
      if (shareResult.action === Share.dismissedAction) {
        return { success: true, cancelled: true, fileUri };
      }
      return { success: true, cancelled: false, fileUri };
    }

    throw new Error("Native sharing is not available on this device.");
  } finally {
    isExportActive = false;
  }
}
