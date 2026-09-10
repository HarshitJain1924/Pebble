import React from "react";
import { Linking, Platform } from "react-native";
import { act, create } from "react-test-renderer";
import * as Notifications from "expo-notifications";

import NotificationListener from "@/shared/components/ui/NotificationListener";
import { NotificationReconcilerService } from "../NotificationReconcilerService";
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
} from "../notification-permission";
import { SettingsRepository } from "@/repositories/SettingsRepository";
import {
  ChecklistRepository,
  HabitRepository,
  TaskRepository,
  WorkspaceRepository,
} from "@/repositories";
import type { Task, Workspace } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// Tracks "OS-scheduled" notifications so reconciliation passes observe a
// realistic, persistent OS state (same convention as settingsDrivenReconciliation).
let mockNotifSeq = 0;
let mockScheduledOsNotifications: any[] = [];

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest
    .fn()
    .mockResolvedValue({ status: "undetermined", canAskAgain: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  scheduleNotificationAsync: jest.fn().mockImplementation(async (req: any) => {
    const id = `os-notif-${++mockNotifSeq}`;
    mockScheduledOsNotifications.push({ identifier: id, content: req.content });
    return id;
  }),
  cancelScheduledNotificationAsync: jest
    .fn()
    .mockImplementation(async (id: string) => {
      mockScheduledOsNotifications = mockScheduledOsNotifications.filter(
        (n) => n.identifier !== id,
      );
    }),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: jest
    .fn()
    .mockImplementation(async () => [...mockScheduledOsNotifications]),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  setNotificationHandler: jest.fn(),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  addNotificationResponseReceivedListener: jest
    .fn()
    .mockReturnValue({ remove: jest.fn() }),
  addNotificationReceivedListener: jest
    .fn()
    .mockReturnValue({ remove: jest.fn() }),
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
  SchedulableTriggerInputTypes: {
    DATE: "date",
    DAILY: "daily",
    WEEKLY: "weekly",
  },
}));

jest.mock("@/shared/components/ui/UndoContext", () => ({
  useUndo: () => ({
    showBanner: jest.fn(),
    showUndo: jest.fn(),
    showToast: jest.fn(),
  }),
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

function osNotifsFor(itemId: string): any[] {
  return mockScheduledOsNotifications.filter(
    (n) => n.content.data?.itemId === itemId,
  );
}

function makeTask(id: string, workspaceId: string, triggerAt: number): Task {
  return {
    id,
    workspaceId,
    title: `Task ${id}`,
    status: "todo",
    priority: "none",
    reminder: { enabled: true, triggerAt, notificationIds: [] },
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as any;
}

describe("Notification permission lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    mockNotifSeq = 0;
    mockScheduledOsNotifications = [];
  });

  // ── 1 + 2: Cold launch / listener mounting must never prompt ─────────────
  describe("NotificationListener mounting (global layout mount point)", () => {
    it("does not request or even inspect OS permission on mount (iOS)", async () => {
      await act(async () => {
        create(<NotificationListener />);
      });
      await act(async () => {});
      await act(async () => {});

      expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
      expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
      // Bootstrapping still happens: response handler + listeners registered.
      expect(Notifications.setNotificationHandler).toHaveBeenCalled();
    });

    it("does not request permission on Android either, but still configures channels", async () => {
      const replace = jest.replaceProperty(Platform, "OS", "android");
      try {
        await act(async () => {
          create(<NotificationListener />);
        });
        await act(async () => {});
        await act(async () => {});

        expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
        expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
        // Channel setup is permission-free and required for scheduling.
        expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledTimes(
          2,
        );
      } finally {
        replace.restore();
      }
    });

    it("mounting never mutates persisted Pebble settings", async () => {
      const saveSpy = jest.spyOn(SettingsRepository, "saveSettings");
      const updateSpy = jest.spyOn(SettingsRepository, "updateSettings");

      await act(async () => {
        create(<NotificationListener />);
      });
      await act(async () => {});
      await act(async () => {});

      expect(saveSpy).not.toHaveBeenCalled();
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  // ── Startup-safe inspection ──────────────────────────────────────────────
  describe("getNotificationPermissionStatus", () => {
    it("returns the current OS status without prompting", async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: "granted",
        canAskAgain: true,
      });
      expect(await getNotificationPermissionStatus()).toBe("granted");
      expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    });

    it("is tolerant when the native call fails", async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockRejectedValue(
        new Error("native failure"),
      );
      expect(await getNotificationPermissionStatus()).toBe("undetermined");
    });
  });

  // ── 3: Explicit user intent triggers the request ─────────────────────────
  describe("requestNotificationPermission (explicit user intent)", () => {
    it("invokes the native prompt when permission is undetermined", async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: "undetermined",
        canAskAgain: true,
      });
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        status: "granted",
      });

      const result = await requestNotificationPermission();

      expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ status: "granted", openedSettings: false });
    });

    // ── 4: Already-granted → no redundant request ─────────────────────────
    it("does not request again when permission is already granted", async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: "granted",
        canAskAgain: true,
      });

      const result = await requestNotificationPermission();

      expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
      expect(result).toEqual({ status: "granted", openedSettings: false });
    });

    // ── 5: Permanent denial → system settings, no doomed re-request ────────
    it("routes a permanent denial to system settings instead of re-requesting", async () => {
      const openSettingsSpy = jest
        .spyOn(Linking, "openSettings")
        .mockResolvedValue(true as any);
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: "denied",
        canAskAgain: false,
      });

      const result = await requestNotificationPermission();

      expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
      expect(openSettingsSpy).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ status: "denied", openedSettings: true });
    });

    it("still honors explicit intent with a native request when denial is askable", async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: "denied",
        canAskAgain: true,
      });
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        status: "granted",
      });

      const result = await requestNotificationPermission();

      expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(result.status).toBe("granted");
    });

    // ── 8: Permission requests never schedule anything (no duplicates) ─────
    it("never schedules or cancels notifications as a side effect", async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: "undetermined",
        canAskAgain: true,
      });
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        status: "granted",
      });

      await requestNotificationPermission();

      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
      expect(
        Notifications.cancelScheduledNotificationAsync,
      ).not.toHaveBeenCalled();
    });

    // ── 7: Persisted Pebble settings untouched by the permission flow ──────
    it("does not mutate persisted Pebble settings", async () => {
      const saveSpy = jest.spyOn(SettingsRepository, "saveSettings");
      const updateSpy = jest.spyOn(SettingsRepository, "updateSettings");
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: "undetermined",
        canAskAgain: true,
      });
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        status: "granted",
      });

      await requestNotificationPermission();

      expect(saveSpy).not.toHaveBeenCalled();
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  // ── 6 + 8: Reconciliation/scheduling intact, idempotent, permission-free ─
  describe("reconciliation after the permission-lifecycle change", () => {
    const wsId = "ws-perm-1";
    let inMemoryTasks: Record<string, Task> = {};
    let inMemoryWorkspaces: Workspace[] = [];

    beforeEach(() => {
      inMemoryTasks = {};
      inMemoryWorkspaces = [
        {
          id: wsId,
          name: "Perm Workspace",
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      jest
        .spyOn(WorkspaceRepository, "getWorkspaces")
        .mockImplementation(async () => inMemoryWorkspaces);
      jest
        .spyOn(TaskRepository, "getTasks")
        .mockImplementation(async (wId) =>
          wId === wsId ? { ...inMemoryTasks } : {},
        );
      jest
        .spyOn(TaskRepository, "updateNotificationIds")
        .mockImplementation(async (id, wId, ids) => {
          if (inMemoryTasks[id]) {
            inMemoryTasks[id] = {
              ...inMemoryTasks[id],
              reminder: {
                ...inMemoryTasks[id].reminder!,
                notificationIds: ids,
              },
            };
            return "updated";
          }
          return "not_found";
        });
      jest.spyOn(HabitRepository, "getHabits").mockImplementation(async () => ({}));
      jest
        .spyOn(ChecklistRepository, "getChecklists")
        .mockImplementation(async () => ({}));
    });

    it("still schedules missing reminders and never requests permission", async () => {
      const future = Date.now() + 60 * 60 * 1000;
      inMemoryTasks["t-perm"] = makeTask("t-perm", wsId, future);

      await NotificationReconcilerService.reconcileAll();

      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
      expect(osNotifsFor("t-perm").length).toBeGreaterThan(0);
      expect(
        inMemoryTasks["t-perm"].reminder?.notificationIds?.length,
      ).toBeGreaterThan(0);
      // Reconciliation is permission-free: it never prompts, never inspects.
      expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
      expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    });

    it("does not introduce duplicate notifications across repeated passes", async () => {
      const future = Date.now() + 60 * 60 * 1000;
      inMemoryTasks["t-dup"] = makeTask("t-dup", wsId, future);

      await NotificationReconcilerService.reconcileAll();
      const afterFirst = osNotifsFor("t-dup").length;
      expect(afterFirst).toBeGreaterThan(0);

      (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();

      await NotificationReconcilerService.reconcileAll();

      expect(osNotifsFor("t-dup").length).toBe(afterFirst);
      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });
  });
});