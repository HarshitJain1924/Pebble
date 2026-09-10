import AsyncStorage from "@react-native-async-storage/async-storage";
import { BackupService } from "@/services/storage/backup.service";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Share, Platform } from "react-native";
import {
  exportBackupFile,
  getBackupFilename,
  isExportInProgress,
  _resetExportInProgressStateForTests,
} from "../export.service";

jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///test-cache/",
  documentDirectory: "file:///test-docs/",
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  EncodingType: { UTF8: "utf8" },
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

// jest-expo already provides the react-native mock environment.

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

describe("export.service - Manual Data Export", () => {
  const validMockBackup = JSON.stringify({
    version: 1,
    timestamp: 1726000000000,
    workspaces: [{ id: "ws-1", name: "Personal", revision: 1 }],
    tasks: [{ id: "task-1", title: "Complete audit", status: "todo" }],
    habits: [],
    checklists: [],
    resources: [],
    recycleBin: [],
    focusSessions: [],
    relationships: [],
    systemEvents: [],
    settings: { theme: "dark" },
    profile: { name: "Harshit" },
  }, null, 2);

  beforeEach(async () => {
    jest.clearAllMocks();
    _resetExportInProgressStateForTests();
    await AsyncStorage.clear();
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.writeAsStringAsync as jest.Mock).mockResolvedValue(undefined);
    jest.spyOn(BackupService, "generateStructuredBackup").mockResolvedValue(validMockBackup);
  });

  afterEach(() => {
    _resetExportInProgressStateForTests();
    jest.restoreAllMocks();
  });

  describe("getBackupFilename", () => {
    it("produces deterministic filename for a specified date", () => {
      const fixedDate = new Date(2026, 8, 11, 12, 0, 0); // Sept 11, 2026
      const filename = getBackupFilename(fixedDate);
      expect(filename).toBe("pebble-backup-2026-09-11.json");
    });

    it("defaults to pebble-backup-YYYY-MM-DD.json format", () => {
      const filename = getBackupFilename();
      expect(filename).toMatch(/^pebble-backup-\d{4}-\d{2}-\d{2}\.json$/);
    });
  });

  describe("exportBackupFile", () => {
    it("invokes authoritative BackupService, writes file with deterministic name, and calls native sharing", async () => {
      const testDate = new Date(2026, 8, 11, 10, 0, 0);
      const expectedFilename = "pebble-backup-2026-09-11.json";
      const expectedUri = `file:///test-cache/${expectedFilename}`;

      const result = await exportBackupFile({ now: testDate });

      expect(BackupService.generateStructuredBackup).toHaveBeenCalledTimes(1);
      expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
        expectedUri,
        validMockBackup,
        { encoding: "utf8" },
      );
      expect(Sharing.isAvailableAsync).toHaveBeenCalledTimes(1);
      expect(Sharing.shareAsync).toHaveBeenCalledWith(expectedUri, {
        mimeType: "application/json",
        dialogTitle: "Export Pebble Backup",
        UTI: "public.json",
      });
      expect(result).toEqual({
        success: true,
        cancelled: false,
        fileUri: expectedUri,
      });
      expect(isExportInProgress()).toBe(false);
    });

    it("prevents multiple concurrent exports (re-entrancy guard)", async () => {
      let resolveBackup: (val: string) => void;
      const backupPromise = new Promise<string>((resolve) => {
        resolveBackup = resolve;
      });

      jest.spyOn(BackupService, "generateStructuredBackup").mockReturnValue(backupPromise);

      const firstExport = exportBackupFile();
      expect(isExportInProgress()).toBe(true);

      // Attempt second export while first is in-flight
      await expect(exportBackupFile()).rejects.toThrow("An export is already in progress.");

      // Resolve first export
      resolveBackup!(validMockBackup);
      await firstExport;

      expect(isExportInProgress()).toBe(false);
    });

    it("handles BackupService generation failure gracefully", async () => {
      jest.spyOn(BackupService, "generateStructuredBackup").mockRejectedValue(
        new Error("Disk read failure"),
      );

      await expect(exportBackupFile()).rejects.toThrow("Disk read failure");

      expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
      expect(Sharing.shareAsync).not.toHaveBeenCalled();
      expect(isExportInProgress()).toBe(false);
    });

    it("rejects empty or malformed backup payloads", async () => {
      // Empty string
      jest.spyOn(BackupService, "generateStructuredBackup").mockResolvedValue("");
      await expect(exportBackupFile()).rejects.toThrow("Generated backup payload is empty.");
      expect(isExportInProgress()).toBe(false);

      // Invalid JSON
      jest.spyOn(BackupService, "generateStructuredBackup").mockResolvedValue("INVALID{JSON");
      await expect(exportBackupFile()).rejects.toThrow("Generated backup payload is invalid JSON");
      expect(isExportInProgress()).toBe(false);

      // Missing version field
      jest.spyOn(BackupService, "generateStructuredBackup").mockResolvedValue(JSON.stringify({ notABackup: true }));
      await expect(exportBackupFile()).rejects.toThrow("Generated backup payload is missing required schema fields.");
      expect(isExportInProgress()).toBe(false);
    });

    it("treats user cancellation in native share sheet cleanly without throwing error", async () => {
      (Sharing.shareAsync as jest.Mock).mockRejectedValue(new Error("User cancelled share sheet"));

      const result = await exportBackupFile();

      expect(result.success).toBe(true);
      expect(result.cancelled).toBe(true);
      expect(isExportInProgress()).toBe(false);
    });

    it("falls back to React Native Share when Sharing.isAvailableAsync is false", async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
      const shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" as any });

      const testDate = new Date(2026, 8, 11);
      const result = await exportBackupFile({ now: testDate });

      expect(Sharing.shareAsync).not.toHaveBeenCalled();
      expect(shareSpy).toHaveBeenCalledWith({
        title: "pebble-backup-2026-09-11.json",
        message: validMockBackup,
      });
      expect(result.success).toBe(true);
      expect(result.cancelled).toBe(false);
      shareSpy.mockRestore();
    });

    it("handles user cancellation in Share fallback cleanly", async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
      const shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: "dismissedAction" as any });

      const result = await exportBackupFile();

      expect(result.success).toBe(true);
      expect(result.cancelled).toBe(true);
      shareSpy.mockRestore();
    });

    it("does not mutate stored application state during export (read-only verification)", async () => {
      // Restore the real BackupService implementation with in-memory AsyncStorage
      jest.restoreAllMocks();

      // Populate AsyncStorage with diverse initial data
      const initialKeysAndData: Record<string, string> = {
        "pebble:v1:workspaces": JSON.stringify([{ id: "ws-test", name: "Test WS", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 }]),
        "pebble:v1:tasks:ws-test": JSON.stringify({ "task-1": { id: "task-1", title: "Test Task", workspaceId: "ws-test", status: "todo", priority: "none", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 } }),
        "pebble:v1:settings": JSON.stringify({ theme: "dark", escalationEnabled: true }),
        "pebble:v1:profile": JSON.stringify({ name: "Tester", email: "test@example.com" }),
      };

      for (const [k, v] of Object.entries(initialKeysAndData)) {
        await AsyncStorage.setItem(k, v);
      }

      // Snapshot storage state before export
      const allKeysBefore = await AsyncStorage.getAllKeys();
      const storageBefore: Record<string, string | null> = {};
      for (const key of allKeysBefore) {
        storageBefore[key] = await AsyncStorage.getItem(key);
      }

      // Execute export
      const result = await exportBackupFile();

      expect(result.success).toBe(true);

      // Snapshot storage state after export
      const allKeysAfter = await AsyncStorage.getAllKeys();
      const storageAfter: Record<string, string | null> = {};
      for (const key of allKeysAfter) {
        storageAfter[key] = await AsyncStorage.getItem(key);
      }

      // Verify all keys and exact values remain identical
      expect([...allKeysAfter].sort()).toEqual([...allKeysBefore].sort());
      for (const key of allKeysBefore) {
        expect(storageAfter[key]).toEqual(storageBefore[key]);
      }
    });
  });
});
