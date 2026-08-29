import { CreateEntityOptions } from "@/services/command/types/command.types";
import { type RecycleBinItem } from "@/shared/types/domain.types";

/**
 * Restore a snapshot-only (non-task, non-habit) entity from the Recycle Bin.
 *
 * Shared by restoreChecklist / restoreResource, which both follow the
 * identical sequence: resolve the bin item by ID, validate its entity type,
 * parse the snapshot, persist the entity, remove the bin entry, then emit the
 * entity's change event.
 *
 * Tasks and Habits are deliberately NOT routed through here: restoring them
 * additionally requires reminder rescheduling and fresh notification IDs, so
 * they keep their own restore commands (restoreTask / restoreHabit).
 * Workspaces are also excluded: their bin snapshot is a `{ list, todos,
 * habits }` package that must be unwrapped (see restoreWorkspace).
 */
export async function restoreEntityFromBin<T>(
  recycleBinItemId: string,
  entityType: RecycleBinItem["entityType"],
  eventName: "checklists_changed" | "resources_changed" | "workspace_mode_changed",
  options: CreateEntityOptions | undefined,
  persist: (entity: T) => Promise<void>,
  rollback: (entity: T) => Promise<void>,
): Promise<T> {
  const { getRecycleBinItems, removeRecycleBinItems } = await import("@/services/storage/storage.service");
  const { emitStateChange } = await import("@/services/events/state-events");

  const binItems = await getRecycleBinItems();
  const item = binItems.find((i) => i.id === recycleBinItemId);
  if (!item || item.entityType !== entityType) {
    throw new Error(`RecycleBin item not found or not ${entityType}`);
  }

  const parsedData = JSON.parse(item.snapshot) as T & { id?: string; workspaceId?: string; lifecycleGeneration?: number; revision?: number };
  const targetWorkspaceId = parsedData.workspaceId || "inbox";
  const entityId = item.entityId || (parsedData as any).id || item.id;
  const gen = item.lifecycleGeneration || parsedData.lifecycleGeneration || 1;

  const { TombstoneRepository } = await import("@/repositories/TombstoneRepository");
  const highestTombstone = await TombstoneRepository.getHighestTombstonedGeneration(entityType, entityId);
  const isDead = gen <= highestTombstone || (await TombstoneRepository.isTombstoned(entityType, entityId, gen));
  if (isDead) {
    try {
      await removeRecycleBinItems([recycleBinItemId], { throwOnError: true });
    } catch {}
    throw new Error(`[EntityCommandService] ${entityType} ${entityId} was permanently deleted.`);
  }

  const { generateId } = await import("@/shared/utils/id");
  const { MoveJournalRepository } = await import("@/repositories/MoveJournalRepository");
  const operationId = `restore-${generateId()}`;
  
  await MoveJournalRepository.addOperation({
    operationId,
    operationType: "restore",
    entityId: item.entityId,
    entityType,
    sourceWorkspaceId: targetWorkspaceId,
    targetWorkspaceId,
    timestamp: Date.now(),
    lifecycleGeneration: item.lifecycleGeneration || parsedData.lifecycleGeneration || 1,
    expectedRevision: parsedData.revision || 1,
  });

  await persist(parsedData);

  try {
    await removeRecycleBinItems([recycleBinItemId], { throwOnError: true });
  } catch (e) {
    console.warn(`[CommandRecovery] Failed to remove entity from Recycle Bin after restore. Recycle Bin contains a ghost.`, e);
  }

  await MoveJournalRepository.removeOperation(operationId);

  if (!options?.skipEvents) emitStateChange(eventName, options?.source);
  return parsedData;
}
