/**
 * ChecklistRepository.ts
 * ────────────────────────
 * Checklist persistence — partitioned by workspaceId / folderId.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_FOLDER_ID, type Checklist } from "@/shared/types/repository.types";

export class ChecklistRepository {
  private static getChecklistsKey(folderId: string) {
    return `pebble:v1:checklists:${folderId}`;
  }

  private static getLegacyChecklistsKey(folderId: string) {
    return `pebble:core:checklists:${folderId}`;
  }

  static async getChecklist(id: string, folderId: string): Promise<Checklist | null> {
    const key = this.getChecklistsKey(folderId);
    let raw = await AsyncStorage.getItem(key);
    if (!raw) {
      raw = await AsyncStorage.getItem(this.getLegacyChecklistsKey(folderId));
    }
    if (!raw) return null;
    const records: Record<string, Checklist> = JSON.parse(raw);
    const checklist = records[id] || null;
    if (checklist) {
      return {
        ...checklist,
        workspaceId: checklist.folderId || folderId,
      } as any;
    }
    return null;
  }

  static async getChecklists(folderId: string): Promise<Record<string, Checklist>> {
    const key = this.getChecklistsKey(folderId);
    let raw = await AsyncStorage.getItem(key);
    if (!raw) {
      raw = await AsyncStorage.getItem(this.getLegacyChecklistsKey(folderId));
    }
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const records: Record<string, any> = {};
    Object.entries(parsed).forEach(([id, checklist]: [string, any]) => {
      records[id] = {
        ...checklist,
        workspaceId: checklist.folderId || folderId,
      };
    });
    return records;
  }

  static async saveChecklist(checklist: any): Promise<void> {
    const folderId = checklist.folderId || checklist.workspaceId || DEFAULT_FOLDER_ID;
    const key = this.getChecklistsKey(folderId);
    const records = await this.getChecklists(folderId);

    const cleanChecklist: Checklist = {
      id: checklist.id,
      folderId,
      title: checklist.title,
      createdAt: checklist.createdAt || Date.now(),
      updatedAt: Date.now(),
      archived: checklist.archived || false,
      items: checklist.items || [],
    };

    records[checklist.id] = cleanChecklist;
    await AsyncStorage.setItem(key, JSON.stringify(records));
  }

  static async deleteChecklist(id: string, folderId: string): Promise<void> {
    const key = this.getChecklistsKey(folderId);
    const records = await this.getChecklists(folderId);
    if (records[id]) {
      delete records[id];
      await AsyncStorage.setItem(key, JSON.stringify(records));
    }
  }
}
