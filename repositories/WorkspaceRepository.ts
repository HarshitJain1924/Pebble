/**
 * WorkspaceRepository.ts
 * ────────────────────────
 * Workspace persistence — CRUD for Workspaces.
 */
import { type Workspace } from "@/shared/types/domain.types";
import AsyncStorage from "@react-native-async-storage/async-storage";

const WORKSPACES_KEY = "pebble:v1:workspaces";
const LEGACY_WORKSPACES_KEY = "pebble:core:folders";

export class WorkspaceRepository {
  static async getWorkspaces(): Promise<Workspace[]> {
    try {
      let raw = await AsyncStorage.getItem(WORKSPACES_KEY);
      if (!raw) {
        raw = await AsyncStorage.getItem(LEGACY_WORKSPACES_KEY);
      }
      if (!raw) return [];
      const workspaces: Workspace[] = JSON.parse(raw);
      return workspaces.sort(
        (a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0),
      );
    } catch (e) {
      console.warn("Failed to get workspaces", e);
      return [];
    }
  }

  static async saveWorkspace(workspace: Workspace): Promise<void> {
    try {
      const workspaces = await this.getWorkspaces();
      const idx = workspaces.findIndex((w) => w.id === workspace.id);
      if (idx >= 0) {
        workspaces[idx] = { ...workspace, updatedAt: Date.now() };
      } else {
        workspaces.push({ ...workspace, updatedAt: Date.now() });
      }
      await AsyncStorage.setItem(WORKSPACES_KEY, JSON.stringify(workspaces));
    } catch (e) {
      console.warn("Failed to save workspace", e);
    }
  }

  static async saveWorkspaces(workspaces: Workspace[]): Promise<void> {
    try {
      await AsyncStorage.setItem(WORKSPACES_KEY, JSON.stringify(workspaces));
    } catch (e) {
      console.warn("Failed to save workspaces batch", e);
    }
  }

  static async deleteWorkspace(id: string): Promise<void> {
    try {
      let workspaces = await this.getWorkspaces();
      workspaces = workspaces.filter((w) => w.id !== id);
      await AsyncStorage.setItem(WORKSPACES_KEY, JSON.stringify(workspaces));
    } catch (e) {
      console.warn("Failed to delete workspace", e);
    }
  }
}
