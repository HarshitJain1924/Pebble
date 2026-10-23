/**
 * RecycleBinCommandHandler.ts
 * ───────────────────────────
 * Canonical bulk commands for Recycle Bin lifecycle transitions that operate on
 * more than one entity at a time.
 *
 * Permanent deletion is NOT a storage operation: it must go through each domain
 * handler so tombstones, relationship cleanup, reminder cancellation and
 * partition cleanup all happen with the same guarantees as a single-entity
 * delete. The UI therefore calls this handler instead of writing tombstones or
 * rewriting the bin contents itself.
 */
import type { RecycleBinItem } from "@/shared/types/domain.types";

import type { CreateEntityOptions } from "../types/command.types";

export interface RecycleBinPurgeFailure {
  /** Recycle Bin item id (stable across retries). */
  id: string;
  entityType: RecycleBinItem["entityType"];
  entityId: string;
  message: string;
}

export interface RecycleBinPurgeResult {
  /** Bin item ids whose durable deletion completed. */
  deletedIds: string[];
  /**
   * Items still present in the bin after the attempt. The caller must keep
   * these visible so the user can retry; they are never silently dropped.
   */
  failed: RecycleBinPurgeFailure[];
}

/** Minimal shape this handler needs from an entity snapshot. */
interface PurgeTarget {
  entityId: string;
  workspaceId: string;
  binItemId: string;
}

export class RecycleBinCommandHandler {
  /**
   * Resolve the workspace that owns a bin item from its snapshot, falling back
   * to the Inbox (the domain default for orphaned legacy snapshots).
   */
  private static resolveTarget(
    item: RecycleBinItem,
    inboxWorkspaceId: string,
  ): PurgeTarget {
    let snapshot: any = {};
    try {
      snapshot = JSON.parse(item.snapshot);
    } catch {
      snapshot = {};
    }

    const entityId = item.entityId || snapshot?.id || item.id;
    const workspaceId =
      item.entityType === "workspace"
        ? entityId
        : snapshot?.workspaceId || inboxWorkspaceId;

    return { entityId, workspaceId, binItemId: item.id };
  }

  /**
   * Permanently delete one or more Recycle Bin items through their domain
   * command handlers.
   *
   * Semantics:
   * - Sequential, one entity at a time, so a failure cannot corrupt the
   *   remaining items' lifecycle state.
   * - Partial failure is reported explicitly per item; successful items stay
   *   deleted and failed items stay in the bin.
   * - Safe to retry: an item that another trigger already purged (it is no
   *   longer in the bin) counts as deleted instead of failing.
   */
  static async permanentlyDeleteItems(
    items: RecycleBinItem[],
    options?: CreateEntityOptions,
  ): Promise<RecycleBinPurgeResult> {
    const result: RecycleBinPurgeResult = { deletedIds: [], failed: [] };
    if (items.length === 0) return result;

    const touchedTypes = new Set<RecycleBinItem["entityType"]>();

    const { EntityCommandService } = await import("../EntityCommandService");
    const { RecycleBinRepository } = await import(
      "@/repositories/RecycleBinRepository"
    );
    const { INBOX_WORKSPACE_ID } = await import(
      "@/shared/types/domain.types"
    );

    // Per-type child options: the caller decides about events/analytics for the
    // whole batch so we do not emit one event burst per entity.
    const childOptions: CreateEntityOptions = {
      ...options,
      skipEvents: true,
      skipAnalytics: true,
    };

    for (const item of items) {
      const target = this.resolveTarget(item, INBOX_WORKSPACE_ID);

      try {
        switch (item.entityType) {
          case "workspace":
            await EntityCommandService.permanentlyDeleteWorkspace(
              target.entityId,
              childOptions,
            );
            break;
          case "task":
            await EntityCommandService.permanentlyDeleteTask(
              target.entityId,
              target.workspaceId,
              childOptions,
            );
            break;
          case "habit":
            await EntityCommandService.permanentlyDeleteHabit(
              target.entityId,
              target.workspaceId,
              childOptions,
            );
            break;
          case "checklist":
            await EntityCommandService.permanentlyDeleteChecklist(
              target.entityId,
              target.workspaceId,
              childOptions,
            );
            break;
          case "resource":
            await EntityCommandService.permanentlyDeleteResource(
              target.entityId,
              target.workspaceId,
              childOptions,
            );
            break;
          default:
            throw new Error(
              `Unsupported recycle bin entity type: ${String(item.entityType)}`,
            );
        }

        result.deletedIds.push(target.binItemId);
        touchedTypes.add(item.entityType);
      } catch (error) {
        // A concurrent purge may have completed this item between our read and
        // the handler call. Verify against durable state before reporting a
        // failure: if the bin entry is gone, the delete happened.
        let stillPending = true;
        try {
          const remaining = await RecycleBinRepository.getRecycleBinItems();
          stillPending = remaining.some(
            (binItem) =>
              binItem.id === target.binItemId ||
              (binItem.entityId === target.entityId &&
                binItem.entityType === item.entityType),
          );
        } catch {
          stillPending = true;
        }

        if (!stillPending) {
          result.deletedIds.push(target.binItemId);
          touchedTypes.add(item.entityType);
          continue;
        }

        result.failed.push({
          id: target.binItemId,
          entityType: item.entityType,
          entityId: target.entityId,
          message:
            error instanceof Error ? error.message : String(error),
        });
      }
    }

    await this.emitBatchEffects(touchedTypes, options);

    return result;
  }

  /**
   * One consolidated event/analytics pass for the whole batch, emitted only
   * after the loop so a partially failed batch still refreshes the domains
   * that did change.
   */
  private static async emitBatchEffects(
    touchedTypes: Set<RecycleBinItem["entityType"]>,
    options?: CreateEntityOptions,
  ): Promise<void> {
    if (touchedTypes.size === 0) return;

    if (!options?.skipEvents) {
      const { emitStateChange } = await import(
        "@/services/events/state-events"
      );
      if (touchedTypes.has("task")) {
        emitStateChange("tasks_changed", options?.source);
      }
      if (touchedTypes.has("habit")) {
        emitStateChange("habits_changed", options?.source);
      }
      if (touchedTypes.has("checklist")) {
        emitStateChange("checklists_changed", options?.source);
      }
      if (touchedTypes.has("resource")) {
        emitStateChange("resources_changed", options?.source);
      }
      if (touchedTypes.has("workspace")) {
        emitStateChange("workspace_changed", options?.source);
        emitStateChange("workspace_mode_changed", options?.source);
      }
    }

    if (!options?.skipAnalytics) {
      const { recordDailyHistorySnapshot } = await import(
        "@/services/analytics/productivity-history.service"
      );
      void recordDailyHistorySnapshot().catch(() => {});
    }
  }
}
