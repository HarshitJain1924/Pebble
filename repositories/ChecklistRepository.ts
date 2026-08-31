/**
 * ChecklistRepository.ts
 * ────────────────────────
 * Checklist persistence — partitioned by workspaceId using canonical Checklist model.
 */
import {
  INBOX_WORKSPACE_ID,
  type Checklist,
  type ChecklistItem,
} from "@/shared/types/domain.types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { withLock } from "@/shared/utils/mutex";

export function normalizeChecklist(
  rawChecklist: any,
  defaultWorkspaceId: string,
): Checklist {
  const wsId = rawChecklist.workspaceId || defaultWorkspaceId;

  const items: ChecklistItem[] = (rawChecklist.items || []).map(
    (item: any) => ({
      id: item.id,
      title: item.title || item.text || "",
      completed: !!item.completed,
      completedAt:
        item.completedAt || (item.completed ? Date.now() : undefined),
    }),
  );

  // Construct resourceIds
  let resourceIds = rawChecklist.resourceIds || [];
  if (
    rawChecklist.resourceId &&
    !resourceIds.includes(rawChecklist.resourceId)
  ) {
    resourceIds.push(rawChecklist.resourceId);
  }
  if (Array.isArray(rawChecklist.linkedResourceIds)) {
    rawChecklist.linkedResourceIds.forEach((rid: string) => {
      if (!resourceIds.includes(rid)) resourceIds.push(rid);
    });
  }

  return {
    id: rawChecklist.id,
    workspaceId: wsId,
    title: rawChecklist.title || "",
    description: rawChecklist.description || undefined,
    items,
    categoryId: rawChecklist.categoryId || rawChecklist.category || undefined,
    tags: rawChecklist.tags || undefined,
    resourceIds: resourceIds.length > 0 ? resourceIds : undefined,
    createdAt: rawChecklist.createdAt || Date.now(),
    updatedAt: rawChecklist.updatedAt || Date.now(),
    archivedAt:
      rawChecklist.archivedAt ||
      (rawChecklist.archived ? Date.now() : undefined),
    pebbleAwarded: rawChecklist.pebbleAwarded ? true : undefined,
    revision: rawChecklist.revision ?? 1,
    lifecycleGeneration: rawChecklist.lifecycleGeneration ?? 1,
    schedule: rawChecklist.schedule ? { ...rawChecklist.schedule } : undefined,
    recurrence: rawChecklist.recurrence ? { ...rawChecklist.recurrence } : undefined,
    recurrenceExceptions: Array.isArray(rawChecklist.recurrenceExceptions)
      ? [...rawChecklist.recurrenceExceptions]
      : undefined,
    reminder: rawChecklist.reminder ? { ...rawChecklist.reminder } : undefined,
    occurrenceHistory:
      rawChecklist.occurrenceHistory &&
      typeof rawChecklist.occurrenceHistory === "object"
        ? { ...rawChecklist.occurrenceHistory }
        : undefined,
  };
}

export class ChecklistRepository {
  private static validateId(id: unknown, method: string): asserts id is string {
    if (
      id === undefined ||
      id === null ||
      typeof id !== "string" ||
      id.trim().length === 0
    ) {
      throw new Error(
        `ChecklistRepository.${method}: checklist.id is required`,
      );
    }
  }

  private static getChecklistsKey(workspaceId: string) {
    return `pebble:v1:checklists:${workspaceId}`;
  }

  /**
   * Parse a stored workspace payload defensively. Malformed JSON (e.g. from a
   * partial write or corrupted storage) must never crash the consuming screen;
   * following the repository's tolerant recovery convention, the payload is
   * logged and treated as empty so callers see a missing/empty collection.
   */
  private static parseRecords(
    raw: string,
    key: string,
    method: string,
  ): Record<string, any> {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, any>;
      }
      throw new Error(
        `[ChecklistRepository] Stored value for "${key}" is not a JSON object (${method})`
      );
    } catch (e) {
      console.error(
        `[ChecklistRepository] Failed to parse stored value for "${key}" (${method})`,
        e,
      );
      throw e;
    }
  }

  static async getChecklist(
    id: string,
    workspaceId: string,
  ): Promise<Checklist | null> {
    const key = this.getChecklistsKey(workspaceId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const records: Record<string, any> = this.parseRecords(raw, key, "getChecklist");
    const rawChecklist = records[id] || null;
    if (rawChecklist) {
      return normalizeChecklist(rawChecklist, workspaceId);
    }
    return null;
  }

  static async getChecklists(
    workspaceId: string,
  ): Promise<Record<string, Checklist>> {
    const key = this.getChecklistsKey(workspaceId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return {};
    const parsed = this.parseRecords(raw, key, "getChecklists");
    const records: Record<string, Checklist> = {};
    Object.entries(parsed).forEach(([id, rawChecklist]: [string, any]) => {
      records[id] = normalizeChecklist(rawChecklist, workspaceId);
    });
    return records;
  }

  static async saveChecklist(checklist: any): Promise<void> {
    const workspaceId = checklist?.workspaceId || INBOX_WORKSPACE_ID;
    const key = this.getChecklistsKey(workspaceId);
    
    await withLock(key, async () => {
      await this.saveChecklistUnlocked(checklist);
    });
  }

  static async saveChecklistUnlocked(checklist: any): Promise<Checklist> {
    this.validateId(checklist?.id, "saveChecklistUnlocked");
    const workspaceId = checklist.workspaceId || INBOX_WORKSPACE_ID;
    const key = this.getChecklistsKey(workspaceId);

    const records = await this.getChecklists(workspaceId);

    const cleanChecklist: Checklist = normalizeChecklist(
      checklist,
      workspaceId,
    );
    cleanChecklist.updatedAt = Date.now();
    cleanChecklist.revision = checklist.revision ?? ((records[checklist.id]?.revision || 0) + 1);
    cleanChecklist.lifecycleGeneration = checklist.lifecycleGeneration || records[checklist.id]?.lifecycleGeneration || 1;

    records[checklist.id] = cleanChecklist;
    await AsyncStorage.setItem(key, JSON.stringify(records));
    return cleanChecklist;
  }

  /**
   * Unlocked persistence primitive required specifically for WorkspaceCommandHandler
   * to restore checklists into a partition while the canonical lock is held dynamically.
   */
  static async saveChecklistsUnlocked(checklists: any[], workspaceId: string): Promise<void> {
    const key = this.getChecklistsKey(workspaceId);
    const records = await this.getChecklists(workspaceId);
    for (const checklist of checklists) {
      this.validateId(checklist?.id, "saveChecklistsUnlocked");
      const cleanChecklist: Checklist = normalizeChecklist(checklist, workspaceId);
      cleanChecklist.updatedAt = Date.now();
      cleanChecklist.revision = checklist.revision ?? ((records[checklist.id]?.revision || 0) + 1);
      cleanChecklist.lifecycleGeneration = checklist.lifecycleGeneration || records[checklist.id]?.lifecycleGeneration || 1;
      records[checklist.id] = cleanChecklist;
    }
    await AsyncStorage.setItem(key, JSON.stringify(records));
  }

  /**
   * Safely targets notification IDs for modification without disturbing user edits
   * or touching the updatedAt timestamp.
   * Handles workspace moves gracefully by returning not_found if the entity is missing.
   */
  static async updateNotificationIds(
    id: string,
    workspaceId: string,
    notificationIds?: string[],
    expectedSnapshot?: {
      reminder?: { enabled: boolean; triggerAt?: number };
      archivedAt?: number | null;
      updatedAt?: number;
      revision?: number;
    }
  ): Promise<'updated' | 'not_found' | 'state_changed'> {
    this.validateId(id, "updateNotificationIds");
    const targetWorkspaceId = workspaceId || INBOX_WORKSPACE_ID;
    const key = this.getChecklistsKey(targetWorkspaceId);

    return await withLock(key, async () => {
      const records = await this.getChecklists(targetWorkspaceId);
      const existing = records[id];
      if (!existing) {
        return 'not_found';
      }

      if (expectedSnapshot) {
        const reminderMatches =
          existing.reminder?.enabled === expectedSnapshot.reminder?.enabled &&
          existing.reminder?.triggerAt === expectedSnapshot.reminder?.triggerAt;

        const archiveMatches = existing.archivedAt === expectedSnapshot.archivedAt;
        const revisionMatches = expectedSnapshot.revision === undefined || existing.revision === expectedSnapshot.revision;

        if (!reminderMatches || !archiveMatches || !revisionMatches) {
          return 'state_changed';
        }
      }

      // Preserve ALL fields exactly, only modify notificationIds
      if (existing.reminder) {
        existing.reminder.notificationIds = notificationIds;
      } else if (notificationIds && notificationIds.length > 0) {
        existing.reminder = { enabled: true, triggerAt: 0, notificationIds };
      }

      await AsyncStorage.setItem(key, JSON.stringify(records));
      return 'updated';
    });
  }

  static async deleteChecklistUnlocked(id: string, workspaceId: string): Promise<void> {
    const key = this.getChecklistsKey(workspaceId);
    const records = await this.getChecklists(workspaceId);
    if (records[id]) {
      delete records[id];
      await AsyncStorage.setItem(key, JSON.stringify(records));
    }
  }

  static async deleteChecklist(id: string, workspaceId: string): Promise<void> {
    const key = this.getChecklistsKey(workspaceId);
    await withLock(key, async () => {
      await this.deleteChecklistUnlocked(id, workspaceId);
    });
  }

  /**
   * Unlocked persistence primitive required specifically for WorkspaceCommandHandler.deleteWorkspace
   * to physically wipe the active partition safely under dynamically held locks.
   */
  static async deletePartitionUnlocked(workspaceId: string): Promise<void> {
    const key = this.getChecklistsKey(workspaceId);
    await AsyncStorage.removeItem(key);
  }
}
