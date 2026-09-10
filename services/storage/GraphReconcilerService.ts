/**
 * GraphReconcilerService.ts
 * ──────────────────────────────────────────
 * Idempotent, deterministic graph reconciliation service.
 *
 * Repairs invalid relationship graph state:
 * 1. Prunes dangling edges where source or target entity no longer exists.
 * 2. Prunes stale edges where source or target lifecycleGeneration mismatches the active entity.
 * 3. Normalizes and deduplicates duplicate edges (both directed and undirected).
 * 4. Cleans dangling resourceIds on active tasks, habits, and checklists via targeted repository writes.
 * 5. Emits "graph_changed" event only when changes are committed.
 *
 * Consistency Model:
 * 1. Read-phase: Active entities and current graph edges are loaded.
 * 2. Relationship Cleanup & Persistence:
 *    - Validated and normalized graph edges are committed via GraphRepository.replaceRelationshipsUnlocked().
 *    - In-memory repository cache is kept coherent and rolled back if persistence throws.
 *    - Events ("graph_changed") are emitted ONLY after successful relationship commit.
 * 3. Entity Resource Link Cleanup:
 *    - Invalid resource references on tasks, habits, and checklists are cleaned via targeted repository writes
 *      (updateResourceIds), preserving updatedAt, revision, and lifecycleGeneration.
 *    - Concurrent user edits are protected using expectedSnapshot matching; if state changed, fresh state
 *      is retrieved before reapplying the filter.
 * 4. Idempotent Convergence:
 *    - Operations are not distributed ACID transactions. If interrupted or failed midway, subsequent
 *      reconciliation runs converge to the same clean graph and entity state without data loss or corruption.
 */

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
  private static readonly RECONCILER_LOCK = "pebble:v1:graph_reconciler_running";

  /**
   * Reconciles all relationship edges against active domain storage.
   */
  static async reconcileAll(): Promise<GraphReconciliationReport> {
    return withLock(this.RECONCILER_LOCK, async () => {
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
    const activeResourceIdsByWorkspace = new Map<string, Set<string>>();

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

      const wsResSet = new Set<string>();
      for (const r of Object.values(resourcesMap)) {
        wsResSet.add(r.id);
        activeEntities.set(r.id, {
          type: "resource",
          lifecycleGeneration: r.lifecycleGeneration ?? 1,
          workspaceId: ws.id,
        });
      }
      activeResourceIdsByWorkspace.set(ws.id, wsResSet);
    }

    // Add FocusSessions
    const focusSessions = await GraphRepository.getFocusSessions();
    const activeFocusIds = new Set(focusSessions.map((s) => s.id));

    // Phase 1: Relationship graph reconciliation under RELATIONSHIPS_KEY
    await withLock(this.RELATIONSHIPS_KEY, async () => {
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
        let sourceWs: string | undefined;

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
              sourceWs = entity.workspaceId;
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
        let targetWs: string | undefined;

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
              targetWs = entity.workspaceId;
            }
          }
        }

        if (!targetValid) {
          report.prunedDangling++;
          graphChanged = true;
          continue;
        }

        // Cross-workspace edge rejection: if both endpoints belong to workspaces and workspaces differ, prune
        if (sourceWs && targetWs && sourceWs !== targetWs) {
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

      // Persist cleaned graph via canonical GraphRepository boundary
      if (graphChanged) {
        await GraphRepository.replaceRelationshipsUnlocked(validEdges);
        emitStateChange("graph_changed", "graph_reconciler");
      }
    });

    // Phase 2: Clean dangling & cross-workspace resourceIds via targeted repository writes,
    // executed OUTSIDE the relationships lock to prevent ABBA deadlocks with workspace/entity locks.
    for (const t of allTasks) {
      if (t.resourceIds && t.resourceIds.length > 0) {
        const validResources =
          activeResourceIdsByWorkspace.get(t.workspaceId) || new Set<string>();
        const filtered = t.resourceIds.filter((rid) =>
          validResources.has(rid),
        );
        if (filtered.length !== t.resourceIds.length) {
          let res = await TaskRepository.updateResourceIds(
            t.id,
            t.workspaceId,
            filtered,
            {
              updatedAt: t.updatedAt,
              revision: t.revision,
              lifecycleGeneration: t.lifecycleGeneration,
            }
          );
          if (res === "state_changed") {
            const fresh = await TaskRepository.getTask(t.id, t.workspaceId);
            if (fresh && fresh.resourceIds && fresh.resourceIds.length > 0) {
              const freshFiltered = fresh.resourceIds.filter((rid) =>
                validResources.has(rid),
              );
              if (freshFiltered.length !== fresh.resourceIds.length) {
                res = await TaskRepository.updateResourceIds(
                  fresh.id,
                  fresh.workspaceId,
                  freshFiltered,
                  {
                    updatedAt: fresh.updatedAt,
                    revision: fresh.revision,
                    lifecycleGeneration: fresh.lifecycleGeneration,
                  }
                );
              }
            }
          }
          if (res === "updated") {
            report.cleanedResourceIds +=
              t.resourceIds.length - filtered.length;
          }
        }
      }
    }

    for (const h of allHabits) {
      if (h.resourceIds && h.resourceIds.length > 0) {
        const validResources =
          activeResourceIdsByWorkspace.get(h.workspaceId) || new Set<string>();
        const filtered = h.resourceIds.filter((rid) =>
          validResources.has(rid),
        );
        if (filtered.length !== h.resourceIds.length) {
          let res = await HabitRepository.updateResourceIds(
            h.id,
            h.workspaceId,
            filtered,
            {
              updatedAt: h.updatedAt,
              revision: h.revision,
              lifecycleGeneration: h.lifecycleGeneration,
            }
          );
          if (res === "state_changed") {
            const fresh = await HabitRepository.getHabit(h.id, h.workspaceId);
            if (fresh && fresh.resourceIds && fresh.resourceIds.length > 0) {
              const freshFiltered = fresh.resourceIds.filter((rid) =>
                validResources.has(rid),
              );
              if (freshFiltered.length !== fresh.resourceIds.length) {
                res = await HabitRepository.updateResourceIds(
                  fresh.id,
                  fresh.workspaceId,
                  freshFiltered,
                  {
                    updatedAt: fresh.updatedAt,
                    revision: fresh.revision,
                    lifecycleGeneration: fresh.lifecycleGeneration,
                  }
                );
              }
            }
          }
          if (res === "updated") {
            report.cleanedResourceIds +=
              h.resourceIds.length - filtered.length;
          }
        }
      }
    }

    for (const c of allChecklists) {
      if (c.resourceIds && c.resourceIds.length > 0) {
        const validResources =
          activeResourceIdsByWorkspace.get(c.workspaceId) || new Set<string>();
        const filtered = c.resourceIds.filter((rid) =>
          validResources.has(rid),
        );
        if (filtered.length !== c.resourceIds.length) {
          let res = await ChecklistRepository.updateResourceIds(
            c.id,
            c.workspaceId,
            filtered,
            {
              updatedAt: c.updatedAt,
              revision: c.revision,
              lifecycleGeneration: c.lifecycleGeneration,
            }
          );
          if (res === "state_changed") {
            const fresh = await ChecklistRepository.getChecklist(c.id, c.workspaceId);
            if (fresh && fresh.resourceIds && fresh.resourceIds.length > 0) {
              const freshFiltered = fresh.resourceIds.filter((rid) =>
                validResources.has(rid),
              );
              if (freshFiltered.length !== fresh.resourceIds.length) {
                res = await ChecklistRepository.updateResourceIds(
                  fresh.id,
                  fresh.workspaceId,
                  freshFiltered,
                  {
                    updatedAt: fresh.updatedAt,
                    revision: fresh.revision,
                    lifecycleGeneration: fresh.lifecycleGeneration,
                  }
                );
              }
            }
          }
          if (res === "updated") {
            report.cleanedResourceIds +=
              c.resourceIds.length - filtered.length;
          }
        }
      }
    }

      return report;
    });
  }
}
