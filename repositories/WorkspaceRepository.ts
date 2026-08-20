/**
 * WorkspaceRepository.ts
 * ────────────────────────
 * Workspace persistence — CRUD for canonical Workspaces.
 */
import {
  INBOX_WORKSPACE_ID,
  MY_PEBBLES_WORKSPACE_ID,
  type Workspace,
} from "@/shared/types/domain.types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { withLock } from "@/shared/utils/mutex";

const WORKSPACES_KEY = "pebble:v1:workspaces";

export function normalizeWorkspace(raw: any): Workspace {
  return {
    id: raw.id,
    name: raw.name || "Untitled Workspace",
    emoji: raw.emoji || (raw.iconType === "emoji" ? raw.icon : undefined),
    color: raw.color || undefined,
    description: raw.description || undefined,
    createdAt: raw.createdAt || Date.now(),
    updatedAt: raw.updatedAt || Date.now(),
    archivedAt: raw.archivedAt || (raw.archived ? Date.now() : undefined),
  };
}

export class WorkspaceRepository {
  static async getWorkspaces(): Promise<Workspace[]> {
    try {
      const raw = await AsyncStorage.getItem(WORKSPACES_KEY);
      if (!raw) return [];
      const parsed: any[] = JSON.parse(raw);
      return parsed.map(normalizeWorkspace);
    } catch (e) {
      console.warn("Failed to get workspaces", e);
      return [];
    }
  }

  static async saveWorkspace(workspace: Workspace, options?: { throwOnError?: boolean }): Promise<void> {
    try {
      await withLock(WORKSPACES_KEY, async () => {
        const workspaces = await this.getWorkspaces();
        const cleanWs = normalizeWorkspace(workspace);
        cleanWs.updatedAt = Date.now();

        const idx = workspaces.findIndex((w) => w.id === cleanWs.id);
        if (idx >= 0) {
          workspaces[idx] = cleanWs;
        } else {
          workspaces.push(cleanWs);
        }
        await AsyncStorage.setItem(WORKSPACES_KEY, JSON.stringify(workspaces));
      });
    } catch (e) {
      if (options?.throwOnError) throw e;
      console.warn("Failed to save workspace", e);
    }
  }

  static async saveWorkspaces(workspaces: Workspace[], options?: { throwOnError?: boolean }): Promise<void> {
    try {
      await withLock(WORKSPACES_KEY, async () => {
        const normalized = workspaces.map(normalizeWorkspace);
        await AsyncStorage.setItem(WORKSPACES_KEY, JSON.stringify(normalized));
      });
    } catch (e) {
      if (options?.throwOnError) throw e;
      console.warn("Failed to save workspaces batch", e);
    }
  }

  static async deleteWorkspace(id: string, options?: { throwOnError?: boolean }): Promise<void> {
    if (id === INBOX_WORKSPACE_ID || id === MY_PEBBLES_WORKSPACE_ID) {
      console.warn(`Cannot delete protected workspace: ${id}`);
      return;
    }
    try {
      await withLock(WORKSPACES_KEY, async () => {
        let workspaces = await this.getWorkspaces();
        workspaces = workspaces.filter((w) => w.id !== id);
        await AsyncStorage.setItem(WORKSPACES_KEY, JSON.stringify(workspaces));
      });
    } catch (e) {
      if (options?.throwOnError) throw e;
      console.warn("Failed to delete workspace", e);
    }
  }
}
