import {
  ChecklistRepository,
  HabitRepository,
  ResourceRepository,
  TaskRepository,
} from "@/repositories";
import type {
  Checklist,
  Habit,
  Resource,
  Task,
  Workspace,
} from "@/shared/types/domain.types";
import { deduplicateEntities, deduplicateEntityMap } from "@/shared/utils/deduplication";

export interface WorkspaceData {
  todosMap: Record<string, Task[]>;
  habits: Habit[];
  checklistsMap: Record<string, Checklist[]>;
  resourcesMap: Record<string, Resource[]>;
}

/**
 * Assemble all workspace-scoped entity data required by the Tasks screen.
 *
 * Reads tasks, habits, checklists, and resources from the repositories for
 * every workspace and returns them in the shape `useTasksState` commits to
 * React state. This is a pure data-assembly operation — no React state, no
 * lifecycle — so it lives outside the hook.
 *
 * Repository read order is preserved per workspace (tasks → habits →
 * checklists → resources) so the resulting load ordering matches the
 * pre-extraction behavior exactly.
 */
export async function loadWorkspaceData(
  workspaces: Workspace[],
): Promise<WorkspaceData> {
  const todosMap: Record<string, Task[]> = {};
  const habits: Habit[] = [];
  const checklistsMap: Record<string, Checklist[]> = {};
  const resourcesMap: Record<string, Resource[]> = {};

  const workspaceResults = await Promise.all(
    workspaces.map(async (folder) => {
      const folderId = folder.id;
      const [folderTasksMap, folderHabitsMap, checklists, resourcesMapForFolder] =
        await Promise.all([
          TaskRepository.getTasks(folderId),
          HabitRepository.getHabits(folderId),
          ChecklistRepository.getChecklists(folderId),
          ResourceRepository.getResources(folderId),
        ]);

      return {
        folderId,
        tasks: Object.values(folderTasksMap),
        habits: Object.values(folderHabitsMap),
        checklists: Object.values(checklists),
        resources: Object.values(resourcesMapForFolder).map((r: any) => ({
          id: r.id,
          workspaceId: r.workspaceId || folderId,
          type: (r.resourceType || r.type || "note") as any,
          kind:
            r.kind ||
            (r.resourceType === "idea" || r.type === "idea"
              ? "idea"
              : undefined),
          title: r.title,
          content:
            r.content !== undefined
              ? r.content
              : r.payload?.content || r.body?.content,
          url: r.url !== undefined ? r.url : r.payload?.url || r.body?.url,
          mediaUri: r.mediaUri,
          previewImageUrl: r.previewImageUrl,
          archived: r.archived || false,
          pinned: r.pinned || false,
          linkedItemIds: r.linkedItemIds || [],
          tags: r.tags || [],
          createdAt: r.createdAt || Date.now(),
          updatedAt: r.updatedAt || Date.now(),
          revision: r.revision || 1,
          lifecycleGeneration: r.lifecycleGeneration || 1,
          fileName: r.fileName || r.payload?.fileName || r.body?.fileName,
          fileSize: r.fileSize || r.payload?.fileSize || r.body?.fileSize,
          mimeType: r.mimeType || r.payload?.mimeType || r.body?.mimeType,
          localUri: r.localUri || r.payload?.localUri || r.body?.localUri,
        })),
      };
    }),
  );

  for (const res of workspaceResults) {
    todosMap[res.folderId] = res.tasks;
    habits.push(...res.habits);
    checklistsMap[res.folderId] = res.checklists;
    resourcesMap[res.folderId] = res.resources;
  }

  return {
    todosMap: deduplicateEntityMap(todosMap),
    habits: deduplicateEntities(habits),
    checklistsMap: deduplicateEntityMap(checklistsMap),
    resourcesMap: deduplicateEntityMap(resourcesMap),
  };
}
