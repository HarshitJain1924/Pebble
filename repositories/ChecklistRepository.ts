/**
 * ChecklistRepository.ts
 * ────────────────────────
 * Checklist persistence — partitioned by workspaceId.
 */
import {
  DEFAULT_WORKSPACE_ID,
  type Checklist,
} from "@/shared/types/repository.types";
import AsyncStorage from "@react-native-async-storage/async-storage";

export class ChecklistRepository {
  private static getChecklistsKey(workspaceId: string) {
    return `pebble:v1:checklists:${workspaceId}`;
  }

  private static getLegacyChecklistsKey(workspaceId: string) {
    return `pebble:core:checklists:${workspaceId}`;
  }

  static async getChecklist(
    id: string,
    workspaceId: string,
  ): Promise<Checklist | null> {
    const key = this.getChecklistsKey(workspaceId);
    let raw = await AsyncStorage.getItem(key);
    if (!raw) {
      raw = await AsyncStorage.getItem(
        this.getLegacyChecklistsKey(workspaceId),
      );
    }
    if (!raw) return null;
    const records: Record<string, Checklist> = JSON.parse(raw);
    const checklist = records[id] || null;
    if (checklist) {
      const resolvedWorkspaceId = checklist.workspaceId || (checklist as any).folderId || workspaceId;
      return {
        ...checklist,
        workspaceId: resolvedWorkspaceId,
        folderId: resolvedWorkspaceId,
      } as any;
    }
    return null;
  }

  static async getChecklists(
    workspaceId: string,
  ): Promise<Record<string, Checklist>> {
    const key = this.getChecklistsKey(workspaceId);
    let raw = await AsyncStorage.getItem(key);
    if (!raw) {
      raw = await AsyncStorage.getItem(
        this.getLegacyChecklistsKey(workspaceId),
      );
    }
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const records: Record<string, any> = {};
    Object.entries(parsed).forEach(([id, checklist]: [string, any]) => {
      const resolvedWorkspaceId = checklist.workspaceId || checklist.folderId || workspaceId;
      records[id] = {
        ...checklist,
        workspaceId: resolvedWorkspaceId,
        folderId: resolvedWorkspaceId,
      };
    });
    return records;
  }

  static async saveChecklist(checklist: any): Promise<void> {
    const workspaceId = checklist.workspaceId || checklist.folderId || DEFAULT_WORKSPACE_ID;
    const key = this.getChecklistsKey(workspaceId);
    const records = await this.getChecklists(workspaceId);

    const cleanChecklist: Checklist = {
      id: checklist.id,
      workspaceId,
      folderId: workspaceId,
      title: checklist.title,
      createdAt: checklist.createdAt || Date.now(),
      updatedAt: Date.now(),
      archived: checklist.archived || false,
      items: checklist.items || [],
    };

    records[checklist.id] = cleanChecklist;
    await AsyncStorage.setItem(key, JSON.stringify(records));
  }

  static async deleteChecklist(id: string, workspaceId: string): Promise<void> {
    const key = this.getChecklistsKey(workspaceId);
    const records = await this.getChecklists(workspaceId);
    if (records[id]) {
      delete records[id];
      await AsyncStorage.setItem(key, JSON.stringify(records));
    }
  }
}
