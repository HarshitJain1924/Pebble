import { TombstoneRepository } from "@/repositories/TombstoneRepository";
import { CreateEntityOptions } from "../types/command.types";

export interface LifecycleEntity {
  id: string;
  lifecycleGeneration?: number;
  revision?: number;
}

/**
 * Validates that an existing entity is alive (not tombstoned) and matches
 * the caller's expected lifecycleGeneration and revision (optimistic concurrency).
 */
export async function assertLifecycleMutationAllowed(
  entityType: "task" | "habit" | "checklist" | "resource" | "workspace",
  entity: LifecycleEntity,
  options?: CreateEntityOptions,
  config?: { allowTombstoned?: boolean }
): Promise<void> {
  const currentGen = entity.lifecycleGeneration ?? 1;
  const currentRev = entity.revision ?? 1;

  // 1. Verify generation guard (stale operation across generation boundary)
  if (options?.expectedGeneration !== undefined && currentGen !== options.expectedGeneration) {
    throw new Error(
      `[EntityCommandService] ${entityType} ${entity.id} generation mismatch: expected G${options.expectedGeneration}, got G${currentGen}`
    );
  }

  // 2. Verify revision guard (optimistic concurrency within the same generation)
  if (options?.expectedRevision !== undefined && currentRev !== options.expectedRevision) {
    throw new Error(
      `[EntityCommandService] ${entityType} ${entity.id} revision mismatch: expected R${options.expectedRevision}, got R${currentRev}`
    );
  }

  // 3. Verify durable tombstone barrier
  if (!config?.allowTombstoned) {
    const isDead = await TombstoneRepository.isTombstoned(entityType, entity.id, currentGen);
    if (isDead) {
      throw new Error(
        `[EntityCommandService] ${entityType} ${entity.id} (generation ${currentGen}) is permanently deleted.`
      );
    }
  }
}
