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
  const isIcon = raw.iconType === "icon" || (!raw.emoji && Boolean(raw.icon) && raw.iconType !== "emoji");
  return {
    id: raw.id,
    name: raw.name || "Untitled Workspace",
    emoji: isIcon ? undefined : (raw.emoji || (raw.iconType === "emoji" ? raw.icon : undefined)),
    icon: isIcon ? (raw.icon || "briefcase") : undefined,
    iconType: isIcon ? "icon" : (raw.iconType === "emoji" || raw.emoji ? "emoji" : undefined),
    color: raw.color || undefined,
    description: raw.description || undefined,
    revision: raw.revision ?? 1,
    lifecycleGeneration: raw.lifecycleGeneration ?? 1,
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
      console.error("Failed to get workspaces", e);
      throw e;
    }
  }

  /**
   * Persist one Workspace.
   *
   * STRICT BY DEFAULT: a failed `setItem` propagates, so a caller can never
   * emit a success event for a write that did not commit. Best-effort callers
   * must opt in explicitly with `{ tolerateFailure: true }` (kept for callers
   * that treat persistence as advisory); `{ throwOnError: false }` is honoured
   * for backward compatibility.
   */
  static async saveWorkspace(
    workspace: Workspace,
    options?: { throwOnError?: boolean; tolerateFailure?: boolean },
  ): Promise<void> {
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
      if (options?.tolerateFailure === true || options?.throwOnError === false) {
        console.warn("Failed to save workspace", e);
        return;
      }
      throw e;
    }
  }

  /** Persist the whole collection. STRICT BY DEFAULT (see `saveWorkspace`). */
  static async saveWorkspaces(
    workspaces: Workspace[],
    options?: { throwOnError?: boolean; tolerateFailure?: boolean },
  ): Promise<void> {
    try {
      await withLock(WORKSPACES_KEY, async () => {
        const normalized = workspaces.map(normalizeWorkspace);
        await AsyncStorage.setItem(WORKSPACES_KEY, JSON.stringify(normalized));
      });
    } catch (e) {
      if (options?.tolerateFailure === true || options?.throwOnError === false) {
        console.warn("Failed to save workspaces batch", e);
        return;
      }
      throw e;
    }
  }

  /**
   * Apply a caller-supplied ORDER to the persisted workspaces without letting a
   * stale snapshot overwrite concurrent changes.
   *
   * `saveWorkspaces` replaces the whole collection, so a list captured before a
   * concurrent create/rename/delete silently reverts it (a created workspace
   * disappears entirely). Ordering is the only intent a reorder snapshot
   * carries, so this method:
   *   - keeps every persisted record's own fields (a concurrent rename wins),
   *   - keeps workspaces the snapshot does not know about (concurrent create)
   *     and appends them after the ordered ones,
   *   - never resurrects an id that is no longer persisted (concurrent delete),
   *   - writes the snapshot as-is only when nothing is persisted yet (bootstrap),
   *   - and touches no `revision`/`updatedAt` because order is not an edit.
   */
  static async applyWorkspaceOrder(
    orderedWorkspaces: Workspace[],
    options?: { throwOnError?: boolean; tolerateFailure?: boolean },
  ): Promise<void> {
    try {
      await withLock(WORKSPACES_KEY, async () => {
        const current = await this.getWorkspaces();
        if (current.length === 0) {
          // First run: there is nothing to merge with, so the snapshot is truth.
          const normalized = (Array.isArray(orderedWorkspaces) ? orderedWorkspaces : []).map(
            normalizeWorkspace,
          );
          await AsyncStorage.setItem(WORKSPACES_KEY, JSON.stringify(normalized));
          return;
        }

        const byId = new Map(current.map((workspace) => [workspace.id, workspace]));
        const ordered: Workspace[] = [];
        const placed = new Set<string>();

        for (const entry of Array.isArray(orderedWorkspaces) ? orderedWorkspaces : []) {
          const existing = entry?.id ? byId.get(entry.id) : undefined;
          if (!existing || placed.has(existing.id)) continue;
          placed.add(existing.id);
          ordered.push(existing);
        }

        for (const existing of current) {
          if (placed.has(existing.id)) continue;
          ordered.push(existing);
        }

        await AsyncStorage.setItem(WORKSPACES_KEY, JSON.stringify(ordered));
      });
    } catch (e) {
      if (options?.tolerateFailure === true || options?.throwOnError === false) {
        console.warn("Failed to apply workspace order", e);
        return;
      }
      throw e;
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
