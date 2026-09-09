/**
 * GraphReconcilerService.ts
 * ──────────────────────────────────────────
 * Idempotent, deterministic graph reconciliation service.
 *
 * Repairs invalid relationship graph state:
 * 1. Prunes dangling edges where source or target entity no longer exists.
 * 2. Prunes stale edges where source or target lifecycleGeneration mismatches the active entity.
 * 3. Normalizes and deduplicates duplicate edges (both directed and undirected).
 * 4. Cleans dangling resourceIds on active tasks, habits, and checklists.
 * 5. Emits "graph_changed" event only when changes are committed.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { GraphRepository } from "@/repositories/GraphRepository";
import {
  TaskRepository,
  HabitRepository,
  ChecklistRepository,
  ResourceRepository,
  WorkspaceRepository,
} from "@/repositories";
import { withLock } from "@/shared/utils/mutex";
import { emitStateChange } from "@/services/events/state-events";
import type { Relationship, Task, Habit, Checklist } from "@/shared/types/domain.types";

export interface GraphReconciliationReport {
  checked: number;
  prunedDangling: number;
  deduplicated: number;
  updated: number;
  cleanedResourceIds: number;
}

export class GraphReconcilerService {
  private static readonly RELATIONSHIPS_KEY = "pebble:v1:relationships";

  /**
   * Reconciles all relationship edges against active domain storage.
   */
  static async reconcileAll(): Promise<GraphReconciliationReport> {
    return withLock(this.RELATIONSHIPS_KEY, async () => {
      const report: GraphReconciliationReport = {
        checked: 0,
        prunedDangling: 0,
        deduplicated: 0,
        updated: 0,
        cleanedResourceIds: 0,
      };

      // 1. Build authoritative registry of active entities
      const workspaces = await WorkspaceRepository.getWorkspaces();
      const activeEntities = new Map<
        string,
        { type: string; lifecycleGeneration: number; workspaceId: string }
      >();
      const activeResourceIds = new Set<string>();

      const allTasks: Task[] = [];
      const allHabits: Habit[] = [];
      const allChecklists: Checklist[] = [];

      for (const ws of workspaces) {
        const [tasksMap, habitsMap, checklistsMap, resourcesMap] =
          await Promise.all([
            TaskRepository.getTasks(ws.id),
            HabitRepository.getHabits(ws.id),
            ChecklistRepository.getChecklists(ws.id),
            ResourceRepository.getResources(ws.id),
          ]);

        for (const t of Object.values(tasksMap)) {
          allTasks.push(t);
          activeEntities.set(t.id, {
            type: "task",
            lifecycleGeneration: t.lifecycleGeneration ?? 1,
            workspaceId: ws.id,
          });
        }
        for (const h of Object.values(habitsMap)) {
          allHabits.push(h);
          activeEntities.set(h.id, {
            type: "habit",
            lifecycleGeneration: h.lifecycleGeneration ?? 1,
            workspaceId: ws.id,
          });
        }
        for (const c of Object.values(checklistsMap)) {
          allChecklists.push(c);
          activeEntities.set(c.id, {
            type: "checklist",
            lifecycleGeneration: c.lifecycleGeneration ?? 1,
            workspaceId: ws.id,
          });
        }
        for (const r of Object.values(resourcesMap)) {
          activeResourceIds.add(r.id);
          activeEntities.set(r.id, {
            type: "resource",
            lifecycleGeneration: r.lifecycleGeneration ?? 1,
            workspaceId: ws.id,
          });
        }
      }

      // Add FocusSessions
      const focusSessions = await GraphRepository.getFocusSessions();
      const activeFocusIds = new Set(focusSessions.map((s) => s.id));

      // 2. Load relationships
      await GraphRepository.ensureLoadedUnlocked();
      const currentRelationships =
        await GraphRepository.getAllRelationshipsUnlocked();
      report.checked = currentRelationships.length;

      const validEdges: Record<string, Relationship> = {};
      const seenSignatures = new Set<string>();
      let graphChanged = false;

      for (const rel of currentRelationships) {
        // Validate source
        let sourceValid = false;
        let sourceGen: number | undefined;

        if (rel.source.type === "focus") {
          sourceValid = activeFocusIds.has(rel.source.id);
        } else {
          const entity = activeEntities.get(rel.source.id);
          if (entity) {
            if (
              rel.source.lifecycleGeneration === undefined ||
              rel.source.lifecycleGeneration === entity.lifecycleGeneration
            ) {
              sourceValid = true;
              sourceGen = entity.lifecycleGeneration;
            }
          }
        }

        if (!sourceValid) {
          report.prunedDangling++;
          graphChanged = true;
          continue;
        }

        // Validate target
        let targetValid = false;
        let targetGen: number | undefined;

        if (rel.target.type === "focus") {
          targetValid = activeFocusIds.has(rel.target.id);
        } else {
          const entity = activeEntities.get(rel.target.id);
          if (entity) {
            if (
              rel.target.lifecycleGeneration === undefined ||
              rel.target.lifecycleGeneration === entity.lifecycleGeneration
            ) {
              targetValid = true;
              targetGen = entity.lifecycleGeneration;
            }
          }
        }

        if (!targetValid) {
          report.prunedDangling++;
          graphChanged = true;
          continue;
        }

        // Canonicalize undirected "related"
        let normSource = rel.source;
        let normTarget = rel.target;
        if (rel.relationType === "related" && rel.source.id > rel.target.id) {
          normSource = rel.target;
          normTarget = rel.source;
        }

        // Deduplication signature
        const signature = `${rel.relationType}:${normSource.id}:${normTarget.id}`;
        if (seenSignatures.has(signature)) {
          report.deduplicated++;
          graphChanged = true;
          continue;
        }
        seenSignatures.add(signature);

        // Normalize generation stamps
        let updatedRel = rel;
        if (
          (sourceGen !== undefined && rel.source.lifecycleGeneration !== sourceGen) ||
          (targetGen !== undefined && rel.target.lifecycleGeneration !== targetGen)
        ) {
          updatedRel = {
            ...rel,
            source: {
              ...normSource,
              lifecycleGeneration: sourceGen ?? normSource.lifecycleGeneration,
            },
            target: {
              ...normTarget,
              lifecycleGeneration: targetGen ?? normTarget.lifecycleGeneration,
            },
          };
          report.updated++;
          graphChanged = true;
        } else if (normSource !== rel.source || normTarget !== rel.target) {
          updatedRel = {
            ...rel,
            source: normSource,
            target: normTarget,
          };
          report.updated++;
          graphChanged = true;
        }

        validEdges[updatedRel.id] = updatedRel;
      }

      // 3. Persist cleaned graph if modifications occurred
      if (graphChanged) {
        await AsyncStorage.setItem(
          this.RELATIONSHIPS_KEY,
          JSON.stringify(validEdges),
        );
        GraphRepository.resetCache();
        await GraphRepository.ensureLoadedUnlocked();
        emitStateChange("graph_changed", "graph_reconciler");
      }

      // 4. Clean dangling resourceIds on active tasks, habits, and checklists
      for (const t of allTasks) {
        if (t.resourceIds && t.resourceIds.length > 0) {
          const filtered = t.resourceIds.filter((rid) =>
            activeResourceIds.has(rid),
          );
          if (filtered.length !== t.resourceIds.length) {
            const cleaned: Task = {
              ...t,
              resourceIds: filtered,
              updatedAt: Date.now(),
            };
            await TaskRepository.saveTaskUnlocked(cleaned);
            report.cleanedResourceIds +=
              t.resourceIds.length - filtered.length;
          }
        }
      }

      for (const h of allHabits) {
        if (h.resourceIds && h.resourceIds.length > 0) {
          const filtered = h.resourceIds.filter((rid) =>
            activeResourceIds.has(rid),
          );
          if (filtered.length !== h.resourceIds.length) {
            const cleaned: Habit = {
              ...h,
              resourceIds: filtered,
              updatedAt: Date.now(),
            };
            await HabitRepository.saveHabitUnlocked(cleaned);
            report.cleanedResourceIds +=
              h.resourceIds.length - filtered.length;
          }
        }
      }

      for (const c of allChecklists) {
        if (c.resourceIds && c.resourceIds.length > 0) {
          const filtered = c.resourceIds.filter((rid) =>
            activeResourceIds.has(rid),
          );
          if (filtered.length !== c.resourceIds.length) {
            const cleaned: Checklist = {
              ...c,
              resourceIds: filtered,
              updatedAt: Date.now(),
            };
            await ChecklistRepository.saveChecklistUnlocked(cleaned);
            report.cleanedResourceIds +=
              c.resourceIds.length - filtered.length;
          }
        }
      }

      return report;
    });
  }
}
