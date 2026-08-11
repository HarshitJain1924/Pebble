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



  static async getChecklist(
    id: string,
    workspaceId: string,
  ): Promise<Checklist | null> {
    const key = this.getChecklistsKey(workspaceId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const records: Record<string, any> = JSON.parse(raw);
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
    const parsed = JSON.parse(raw);
    const records: Record<string, Checklist> = {};
    Object.entries(parsed).forEach(([id, rawChecklist]: [string, any]) => {
      records[id] = normalizeChecklist(rawChecklist, workspaceId);
    });
    return records;
  }

  static async saveChecklist(checklist: any): Promise<void> {
    this.validateId(checklist?.id, "saveChecklist");
    const workspaceId = checklist.workspaceId || INBOX_WORKSPACE_ID;
    const key = this.getChecklistsKey(workspaceId);
    
    await withLock(key, async () => {
      const records = await this.getChecklists(workspaceId);

      const cleanChecklist: Checklist = normalizeChecklist(
        checklist,
        workspaceId,
      );
      cleanChecklist.updatedAt = Date.now();

      records[checklist.id] = cleanChecklist;
      await AsyncStorage.setItem(key, JSON.stringify(records));
    });
  }

  static async deleteChecklist(id: string, workspaceId: string): Promise<void> {
    const key = this.getChecklistsKey(workspaceId);
    await withLock(key, async () => {
      const records = await this.getChecklists(workspaceId);
      if (records[id]) {
        delete records[id];
        await AsyncStorage.setItem(key, JSON.stringify(records));
      }
    });
  }
}
