import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalizeChecklist, ChecklistRepository } from "@/repositories/ChecklistRepository";
import { Checklist } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

describe("ChecklistRepository Integrity & Purity", () => {
  const wsId = "ws-repo-test";

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  describe("1. normalizeChecklist purity", () => {
    test("normalizeChecklist does not mutate rawChecklist or nested resourceIds array", () => {
      const rawInput = Object.freeze({
        id: "chk-pure-1",
        workspaceId: wsId,
        title: "Pure Checklist",
        resourceId: "res-primary",
        resourceIds: Object.freeze(["res-1", "res-2"]) as any,
        linkedResourceIds: Object.freeze(["res-3", "res-4"]) as any,
        tags: Object.freeze(["work", "urgent"]) as any,
        items: Object.freeze([
          Object.freeze({ id: "i1", title: "Step 1", completed: false }),
        ]) as any,
        reminder: Object.freeze({
          enabled: true,
          triggerAt: 1780000000000,
          notificationIds: Object.freeze(["notif-1"]) as any,
        }) as any,
        schedule: Object.freeze({
          date: "2026-10-15",
          startTime: "10:00",
        }) as any,
        recurrence: Object.freeze({
          frequency: "daily",
          interval: 1,
        }) as any,
        recurrenceExceptions: Object.freeze(["2026-10-16"]) as any,
      });

      // Should not throw even with Object.freeze on all input properties
      const normalized = normalizeChecklist(rawInput, wsId);

      expect(normalized.id).toBe("chk-pure-1");
      expect(normalized.resourceIds).toEqual(["res-1", "res-2", "res-primary", "res-3", "res-4"]);
      expect(normalized.tags).toEqual(["work", "urgent"]);
      expect(normalized.reminder?.notificationIds).toEqual(["notif-1"]);

      // Verify that input arrays remain untouched
      expect(rawInput.resourceIds).toEqual(["res-1", "res-2"]);
      expect(rawInput.linkedResourceIds).toEqual(["res-3", "res-4"]);
    });
  });

  describe("2. parseRecords defensive corruption handling", () => {
    test("Throws error on malformed JSON or non-object payload to prevent silent data loss", async () => {
      const key = `pebble:v1:checklists:${wsId}`;
      
      // Invalid JSON
      await AsyncStorage.setItem(key, "{ invalid JSON }");
      await expect(ChecklistRepository.getChecklists(wsId)).rejects.toThrow();

      // Non-object JSON (array)
      await AsyncStorage.setItem(key, JSON.stringify(["not", "an", "object"]));
      await expect(ChecklistRepository.getChecklists(wsId)).rejects.toThrow(
        /not a JSON object/
      );
    });
  });

  describe("3. updateNotificationIds targeted persistence & snapshot invariants", () => {
    test("Updates notification IDs when snapshot matches and returns 'updated'", async () => {
      const checklist: Checklist = {
        id: "chk-target-1",
        workspaceId: wsId,
        title: "Test Targeted",
        items: [],
        createdAt: 1000,
        updatedAt: 1000,
        revision: 2,
        lifecycleGeneration: 1,
        reminder: { enabled: true, triggerAt: 2000 },
      };

      const saved = await ChecklistRepository.saveChecklistUnlocked(checklist);

      const status = await ChecklistRepository.updateNotificationIds(
        "chk-target-1",
        wsId,
        ["os-notif-1"],
        {
          reminder: { enabled: true, triggerAt: 2000 },
          archivedAt: undefined,
          revision: 2,
        }
      );

      expect(status).toBe("updated");
      const updated = await ChecklistRepository.getChecklist("chk-target-1", wsId);
      expect(updated?.reminder?.notificationIds).toEqual(["os-notif-1"]);
      // Revision and timestamps are strictly preserved, not incremented by system write
      expect(updated?.revision).toBe(2);
      expect(updated?.updatedAt).toBe(saved.updatedAt);
    });

    test("Rejects update when revision has moved (state_changed)", async () => {
      const checklist: Checklist = {
        id: "chk-target-2",
        workspaceId: wsId,
        title: "Test Stale Revision",
        items: [],
        createdAt: 1000,
        updatedAt: 1000,
        revision: 3, // Current in DB is 3
        lifecycleGeneration: 1,
        reminder: { enabled: true, triggerAt: 2000 },
      };

      await ChecklistRepository.saveChecklistUnlocked(checklist);

      // Async operation from revision 2 finishes late
      const status = await ChecklistRepository.updateNotificationIds(
        "chk-target-2",
        wsId,
        ["stale-os-notif"],
        {
          reminder: { enabled: true, triggerAt: 2000 },
          archivedAt: undefined,
          revision: 2, // Expected revision 2
        }
      );

      expect(status).toBe("state_changed");
      const current = await ChecklistRepository.getChecklist("chk-target-2", wsId);
      expect(current?.reminder?.notificationIds).toBeUndefined();
    });

    test("Returns not_found when entity does not exist in workspace", async () => {
      const status = await ChecklistRepository.updateNotificationIds(
        "non-existent-chk",
        wsId,
        ["os-notif-xyz"],
        { revision: 1 }
      );
      expect(status).toBe("not_found");
    });
  });
});
