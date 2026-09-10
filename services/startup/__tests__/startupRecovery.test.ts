import { runStartupRecovery } from "../startup-recovery";
import { BackupService } from "@/services/storage/backup.service";
import { ConversionReconcilerService } from "@/services/storage/ConversionReconcilerService";
import { GraphReconcilerService } from "@/services/storage/GraphReconcilerService";
import { MoveReconcilerService } from "@/services/storage/MoveReconcilerService";
import { NotificationReconcilerService } from "@/services/notifications/NotificationReconcilerService";
import * as storageService from "@/services/storage/storage.service";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  scheduleNotificationAsync: jest.fn().mockResolvedValue("mock-os-notif-1"),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  setNotificationHandler: jest.fn(),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  addNotificationResponseReceivedListener: jest.fn(),
  addNotificationReceivedListener: jest.fn(),
  SchedulableTriggerInputTypes: {
    DATE: "date",
    DAILY: "daily",
    WEEKLY: "weekly",
  },
}));

describe("startup recovery sequence (runStartupRecovery)", () => {
  let calls: string[];

  beforeEach(() => {
    jest.restoreAllMocks();
    calls = [];

    jest
      .spyOn(BackupService, "recoverInterruptedRestore")
      .mockImplementation(async () => {
        calls.push("recoverInterruptedRestore");
      });
    jest
      .spyOn(MoveReconcilerService, "reconcileAll")
      .mockImplementation(async () => {
        calls.push("moveReconcileAll");
      });
    jest
      .spyOn(MoveReconcilerService, "reconcileHistoricalGhosts")
      .mockImplementation(async () => {
        calls.push("reconcileHistoricalGhosts");
      });
    jest
      .spyOn(ConversionReconcilerService, "reconcileAll")
      .mockImplementation(async () => {
        calls.push("conversionReconcileAll");
      });
    jest
      .spyOn(GraphReconcilerService, "reconcileAll")
      .mockImplementation(async () => {
        calls.push("graphReconcileAll");
        return {
          checked: 0,
          prunedDangling: 0,
          deduplicated: 0,
          updated: 0,
          cleanedResourceIds: 0,
        };
      });
    jest
      .spyOn(NotificationReconcilerService, "reconcileAll")
      .mockImplementation(async () => {
        calls.push("notificationReconcileAll");
      });
    jest
      .spyOn(storageService, "cleanupRecycleBin")
      .mockImplementation(async () => {
        calls.push("cleanupRecycleBin");
      });
  });

  it("1: startup invokes every required recovery reconciler exactly once, in order", async () => {
    await runStartupRecovery();

    expect(calls).toEqual([
      "recoverInterruptedRestore",
      "moveReconcileAll",
      "conversionReconcileAll",
      "reconcileHistoricalGhosts",
      "cleanupRecycleBin",
      "graphReconcileAll",
      "notificationReconcileAll",
    ]);
  });

  it("2: graph reconciliation runs after entity reconcilers and recycle-bin cleanup, before notification reconciliation", async () => {
    await runStartupRecovery();

    const graphIdx = calls.indexOf("graphReconcileAll");
    expect(graphIdx).toBeGreaterThan(calls.indexOf("recoverInterruptedRestore"));
    expect(graphIdx).toBeGreaterThan(calls.indexOf("moveReconcileAll"));
    expect(graphIdx).toBeGreaterThan(calls.indexOf("conversionReconcileAll"));
    expect(graphIdx).toBeGreaterThan(calls.indexOf("reconcileHistoricalGhosts"));
    expect(graphIdx).toBeGreaterThan(calls.indexOf("cleanupRecycleBin"));
    expect(calls.indexOf("notificationReconcileAll")).toBeGreaterThan(graphIdx);
  });

  it("3: startup recovery never requests notification permission", async () => {
    const { requestPermissionsAsync, getPermissionsAsync } =
      require("expo-notifications") as any;

    await runStartupRecovery();

    expect(requestPermissionsAsync).not.toHaveBeenCalled();
    expect(getPermissionsAsync).not.toHaveBeenCalled();
  });

  it("4: a notification reconciliation failure does not crash startup, and all other steps still ran", async () => {
    (NotificationReconcilerService.reconcileAll as jest.Mock).mockRejectedValueOnce(
      new Error("native notification failure"),
    );

    await expect(runStartupRecovery()).resolves.toBeUndefined();

    expect(calls).toEqual([
      "recoverInterruptedRestore",
      "moveReconcileAll",
      "conversionReconcileAll",
      "reconcileHistoricalGhosts",
      "cleanupRecycleBin",
      "graphReconcileAll",
    ]);
  });
});