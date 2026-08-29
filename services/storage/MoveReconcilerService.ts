import AsyncStorage from "@react-native-async-storage/async-storage";
import { MoveJournalRepository } from "@/repositories/MoveJournalRepository";
import { withLock, withLocks } from "@/shared/utils/mutex";
import { cancelReminderIds } from "@/services/scheduling/reminders.service";
import type { MoveJournalEntry, Task, Habit, Checklist, Resource } from "@/shared/types/domain.types";

export type ReconciliationStatus = "RESOLVED" | "OBSOLETE" | "PRESERVED";

export class MoveReconcilerService {
  private static readonly RECONCILER_LOCK = "pebble:v1:reconciler_running";

  /**
   * Idempotently replay all pending move operations in the journal.
   * Guarantees eventual consistency for cross-partition moves.
   */
  static async reconcileAll(): Promise<void> {
    await withLock(this.RECONCILER_LOCK, async () => {
      const operations = await MoveJournalRepository.getOperations();
      if (operations.length === 0) return;

      console.log(`[MoveReconciler] Found ${operations.length} pending move operations.`);

      // Coalesce pending move intents by entityId
      const opsByEntity = new Map<string, MoveJournalEntry[]>();
      for (const op of operations) {
        const list = opsByEntity.get(op.entityId) || [];
        list.push(op);
        opsByEntity.set(op.entityId, list);
      }

      for (const [entityId, opList] of opsByEntity.entries()) {
        opList.sort((a, b) => a.timestamp - b.timestamp);
        
        const superseded = opList.slice(0, opList.length - 1);
        const latestOp = opList[opList.length - 1];
        
        let status: ReconciliationStatus;
        try {
          status = await this.reconcileOperation(latestOp);
        } catch (e) {
          console.error(`[MoveReconciler] Failed to reconcile operation ${latestOp.operationId}`, e);
          // We throw so that if called during Backup, the backup crashes rather than serializing duplicates.
          throw e;
        }

        // Only remove older superseded operations safely AFTER the latest operation 
        // reaches a proven terminal state.
        if (status === "RESOLVED" || status === "OBSOLETE") {
          if (superseded.length > 0) {
            const supersededIds = superseded.map(op => op.operationId);
            try {
              // Since we are outside the move_journal lock here, we use the locked bulk remove primitive.
              await MoveJournalRepository.removeOperations(supersededIds);
              console.log(`[MoveReconciler] Removed ${superseded.length} superseded operations for entity ${entityId}`);
            } catch (e) {
              console.warn(`[MoveReconciler] Failed to remove superseded operations for entity ${entityId}`, e);
            }
          }
        }
      }
    });
  }

  private static getPartitionKey(entityType: string, workspaceId: string): string {
    return `pebble:v1:${entityType}s:${workspaceId}`;
  }

  private static async reconcileOperation(op: MoveJournalEntry): Promise<ReconciliationStatus> {
    const { TombstoneRepository } = await import("@/repositories/TombstoneRepository");
    const highestTombstone = await TombstoneRepository.getHighestTombstonedGeneration(op.entityType, op.entityId);
    const isTombstoned = (op.lifecycleGeneration || 1) <= highestTombstone || await TombstoneRepository.isTombstoned(op.entityType, op.entityId, op.lifecycleGeneration);
    if (isTombstoned) {
      console.warn(`[MoveReconciler] Entity ${op.entityId} (${op.entityType}) is tombstoned. Aborting obsolete operation ${op.operationId}.`);
      await MoveJournalRepository.removeOperationsUnlocked([op.operationId]);
      return "OBSOLETE";
    }

    if (op.operationType === "recycle") {
      return this.reconcileRecycle(op);
    } else if (op.operationType === "restore") {
      return this.reconcileRestore(op);
    } else {
      return this.reconcileMove(op);
    }
  }

  private static async reconcileMove(op: MoveJournalEntry): Promise<ReconciliationStatus> {
    const sourceKey = this.getPartitionKey(op.entityType, op.sourceWorkspaceId);
    const targetKey = this.getPartitionKey(op.entityType, op.targetWorkspaceId);

    // Alphabetical sort to prevent deadlocks between opposite moves
    const sortedKeys = [sourceKey, targetKey].sort();
    const moveJournalKey = "pebble:v1:move_journal";

    return await withLock(sortedKeys[0], async () => {
      return await withLock(sortedKeys[1], async () => {
        return await withLock(moveJournalKey, async () => {
          const results = await AsyncStorage.multiGet([sourceKey, targetKey]);
          let sourceMap: Record<string, any> = results[0][1] ? JSON.parse(results[0][1]) : {};
          let targetMap: Record<string, any> = results[1][1] ? JSON.parse(results[1][1]) : {};

          const targetData = targetMap[op.entityId];
          const sourceData = sourceMap[op.entityId];

          // ----------------------------------------------------------------------
          // BUG FIX: Validate target workspace existence before continuing.
          // If the target workspace was deleted after the intent was created, 
          // we MUST NOT write into an orphaned partition. We abort the move and leave 
          // it in the source workspace. 
          // ----------------------------------------------------------------------
          const { WorkspaceRepository } = await import("@/repositories/WorkspaceRepository");
          const workspaces = await WorkspaceRepository.getWorkspaces();
          const { INBOX_WORKSPACE_ID, MY_PEBBLES_WORKSPACE_ID } = await import("@/shared/types/domain.types");
          
          const targetExists = op.targetWorkspaceId === INBOX_WORKSPACE_ID || 
                               op.targetWorkspaceId === MY_PEBBLES_WORKSPACE_ID || 
                               workspaces.some(w => w.id === op.targetWorkspaceId);

          if (!targetExists) {
            console.warn(`[MoveReconciler] Target workspace ${op.targetWorkspaceId} no longer exists. Aborting move for ${op.entityId}.`);
            // We just remove the operation and do not execute the move. The entity remains in its source workspace.
            await MoveJournalRepository.removeOperationsUnlocked([op.operationId]);
            return "OBSOLETE";
          }

          if (!sourceData && !targetData) {
            console.warn(`[MoveReconciler] UNCERTAIN STATE: Entity ${op.entityId} (${op.entityType}) missing from both source (${op.sourceWorkspaceId}) and target (${op.targetWorkspaceId}) for operation ${op.operationId}. Preserving journal.`);
            return "PRESERVED";
          } else if (sourceData && !targetData) {
            const isNewerGen = (sourceData.lifecycleGeneration || 1) > (op.lifecycleGeneration || 1);
            if (isNewerGen) {
              console.warn(`[MoveReconciler] Source ${op.entityId} is a newer generation (${sourceData.lifecycleGeneration} vs ${op.lifecycleGeneration}). Aborting obsolete move.`);
              await MoveJournalRepository.removeOperationsUnlocked([op.operationId]);
              return "OBSOLETE";
            }
            // Case A variant: Target write failed entirely, or was deleted. Source is only copy.
            sourceData.workspaceId = op.targetWorkspaceId;
            sourceData.updatedAt = Date.now();
            targetMap[op.entityId] = sourceData;
          } else if (!sourceData && targetData) {
            // Case A variant: Source already deleted successfully. Target is fine.
          } else if (sourceData && targetData) {
            const sourceEdited = (sourceData.updatedAt || 0) > op.timestamp;
            const targetEdited = (targetData.updatedAt || 0) > op.timestamp;

            if (!sourceEdited && !targetEdited) {
              // Case A: Neither edited post-intent. Target is authoritative.
              targetData.workspaceId = op.targetWorkspaceId;
            } else if (sourceEdited && !targetEdited) {
              // Case B: Source edited, Target unchanged. Source wins.
              console.warn(`[MoveReconciler] Case B: Source ${op.entityId} edited after move intent. Forwarding edits to target.`);
              sourceData.workspaceId = op.targetWorkspaceId;
              sourceData.updatedAt = Date.now();
              targetMap[op.entityId] = sourceData;
            } else if (!sourceEdited && targetEdited) {
              // Case C: Target edited, Source unchanged. Target wins.
              console.warn(`[MoveReconciler] Case C: Target ${op.entityId} edited after move intent. Preserving target.`);
              targetData.workspaceId = op.targetWorkspaceId;
            } else {
              // Case D: BOTH edited. Split-brain!
              console.warn(`[MoveReconciler] Case D: Split-brain conflict detected for ${op.entityId}. Forking source.`);
              
              // 1. Target retains original identity.
              targetData.workspaceId = op.targetWorkspaceId;

              // 2. Source is transformed into a deterministic conflict fork.
              const forkId = `fork-${op.operationId}-${op.entityId}`;
              const fork = { ...sourceData };
              fork.id = forkId;
              fork.workspaceId = op.targetWorkspaceId;
              fork.title = `[Conflict] ${sourceData.title}`;

              // 3. Cancel and strip stale OS notifications from the source fork
              if (fork.reminder?.notificationIds?.length) {
                try {
                  const { cancelReminderIds } = await import("@/services/scheduling/reminders.service");
                  cancelReminderIds(fork.reminder.notificationIds, { throwOnError: false }).catch(() => {});
                } catch (e) {
                  console.warn(`[MoveReconciler] Failed to cancel notifications for conflict fork ${forkId}`, e);
                }
                fork.reminder = { ...fork.reminder, notificationIds: undefined };
              }

              targetMap[forkId] = fork;
            }
          }

          // Step 1: Write Target First (Commit Point)
          await AsyncStorage.setItem(targetKey, JSON.stringify(targetMap));
          
          // Verify Target Write (Durable Post-Condition)
          const verifyTargetRaw = await AsyncStorage.getItem(targetKey);
          if (verifyTargetRaw !== JSON.stringify(targetMap)) {
            throw new Error(`[MoveReconciler] Durable write verification failed for target partition ${targetKey}`);
          }

          // Step 2: Delete Source Second
          if (sourceMap[op.entityId]) {
            delete sourceMap[op.entityId];
            await AsyncStorage.setItem(sourceKey, JSON.stringify(sourceMap));
            
            // Verify Source Write (Durable Post-Condition)
            const verifySourceRaw = await AsyncStorage.getItem(sourceKey);
            if (verifySourceRaw !== JSON.stringify(sourceMap)) {
              throw new Error(`[MoveReconciler] Durable write verification failed for source partition ${sourceKey}`);
            }
          }

          // Step 3: Delete MoveJournal Entry Last
          await MoveJournalRepository.removeOperationsUnlocked([op.operationId]);
          console.log(`[MoveReconciler] Successfully reconciled operation ${op.operationId}`);
          return "RESOLVED";
        });
      });
    });
  }

  private static async reconcileRecycle(op: MoveJournalEntry): Promise<ReconciliationStatus> {
    const sourceKey = this.getPartitionKey(op.entityType, op.sourceWorkspaceId);
    const recycleBinKey = "pebble:v1:recycle_bin";
    const moveJournalKey = "pebble:v1:move_journal";

    // Enforce strict lock hierarchy: Partition Lock -> MoveJournal Lock -> Recycle Bin Lock
    // Do NOT sort alphabetically, as it inverts the hierarchy and causes deadlocks.
    const orderedKeys = [sourceKey, recycleBinKey];

    return await withLock(orderedKeys[0], async () => {
      return await withLock(moveJournalKey, async () => {
        return await withLock(orderedKeys[1], async () => {
          const results = await AsyncStorage.multiGet([sourceKey, recycleBinKey]);
          const sourceRaw = results.find(r => r[0] === sourceKey)?.[1];
          const binRaw = results.find(r => r[0] === recycleBinKey)?.[1];

          let sourceMap: Record<string, any> = sourceRaw ? JSON.parse(sourceRaw) : {};
          let binArray: any[] = binRaw ? JSON.parse(binRaw) : [];

          const sourceData = sourceMap[op.entityId];
          const binItemIndex = binArray.findIndex(i => i.entityId === op.entityId || i.id === `rb-${op.entityId}`);
          const isInBin = binItemIndex !== -1;

          if (sourceData && !isInBin) {
            const isNewerGen = (sourceData.lifecycleGeneration || 1) > (op.lifecycleGeneration || 1);
            const isNewerRev = (sourceData.revision || 1) > (op.expectedRevision || 1);

            if (isNewerGen || isNewerRev) {
              console.warn(`[MoveReconciler] Active source ${op.entityId} is newer than recycle intent (gen: ${sourceData.lifecycleGeneration} vs ${op.lifecycleGeneration}, rev: ${sourceData.revision} vs ${op.expectedRevision}). Dropping stale recycle.`);
              await MoveJournalRepository.removeOperationsUnlocked([op.operationId]);
              return "OBSOLETE";
            }

            // Add to recycle bin, remove from active
            const lifecycleGeneration = sourceData.lifecycleGeneration || 1;
            const newItem = {
              id: `rb-${op.entityId}-g${lifecycleGeneration}`,
              entityType: op.entityType,
              entityId: op.entityId,
              lifecycleGeneration,
              snapshot: JSON.stringify(sourceData),
              deletedAt: op.timestamp || Date.now(),
            };
            binArray.unshift(newItem);
            // We MUST write RecycleBin FIRST to prevent data loss on crash.
            await AsyncStorage.setItem(recycleBinKey, JSON.stringify(binArray));
            
            const vBinRaw = await AsyncStorage.getItem(recycleBinKey);
            if (vBinRaw !== JSON.stringify(binArray)) {
              throw new Error(`[MoveReconciler] Durable write verification failed for Recycle Bin`);
            }

            delete sourceMap[op.entityId];
            await AsyncStorage.setItem(sourceKey, JSON.stringify(sourceMap));
            
            const vSourceRaw = await AsyncStorage.getItem(sourceKey);
            if (vSourceRaw !== JSON.stringify(sourceMap)) {
               throw new Error(`[MoveReconciler] Durable write verification failed for source partition ${sourceKey}`);
            }
          } else if (sourceData && isInBin) {
            // Check if source is a newer generation or was updated AFTER the recycle intent
            const isNewerGen = (sourceData.lifecycleGeneration || 1) > (op.lifecycleGeneration || 1);
            const isNewerRev = (sourceData.revision || 1) > (op.expectedRevision || 1);
            const sourceEdited = isNewerGen || isNewerRev || (sourceData.updatedAt || 0) > (op.timestamp || 0);
            if (sourceEdited) {
              console.warn(`[MoveReconciler] Source ${op.entityId} was updated after recycle intent (gen: ${sourceData.lifecycleGeneration}, rev: ${sourceData.revision}). Preserving newer active version and removing stale bin snapshot.`);
              binArray.splice(binItemIndex, 1);
              await AsyncStorage.setItem(recycleBinKey, JSON.stringify(binArray));
            } else {
              // Ghost duplicate! Remove from active
              delete sourceMap[op.entityId];
              await AsyncStorage.setItem(sourceKey, JSON.stringify(sourceMap));
              
              // Verify Source Write (Durable Post-Condition)
              const vSourceRaw = await AsyncStorage.getItem(sourceKey);
              if (vSourceRaw !== JSON.stringify(sourceMap)) {
                 throw new Error(`[MoveReconciler] Durable write verification failed for source partition ${sourceKey}`);
              }
            }
          } else if (!sourceData && !isInBin) {
            console.warn(`[MoveReconciler] UNCERTAIN STATE: Entity ${op.entityId} (${op.entityType}) missing from both active (${op.sourceWorkspaceId}) and recycle bin for operation ${op.operationId}. Preserving journal.`);
            return "PRESERVED";
          } else if (!sourceData && isInBin) {
            // Already successful.
          }

          await MoveJournalRepository.removeOperationsUnlocked([op.operationId]);
          console.log(`[MoveReconciler] Successfully reconciled recycle operation ${op.operationId}`);
          return "RESOLVED";
        });
      });
    });
  }

  private static async reconcileRestore(op: MoveJournalEntry): Promise<ReconciliationStatus> {
    const { WorkspaceRepository } = await import("@/repositories/WorkspaceRepository");
    const workspaces = await WorkspaceRepository.getWorkspaces();
    const { INBOX_WORKSPACE_ID, MY_PEBBLES_WORKSPACE_ID } = await import("@/shared/types/domain.types");
    
    let targetWorkspaceId = op.targetWorkspaceId || INBOX_WORKSPACE_ID;
    const targetExists = targetWorkspaceId === INBOX_WORKSPACE_ID ||
                         targetWorkspaceId === MY_PEBBLES_WORKSPACE_ID ||
                         workspaces.some(w => w.id === targetWorkspaceId);

    if (!targetExists) {
      targetWorkspaceId = INBOX_WORKSPACE_ID;
    }

    const targetKey = this.getPartitionKey(op.entityType, targetWorkspaceId);
    const recycleBinKey = "pebble:v1:recycle_bin";
    const moveJournalKey = "pebble:v1:move_journal";

    // Enforce strict lock hierarchy: Partition Lock -> MoveJournal Lock -> Recycle Bin Lock
    const orderedKeys = [targetKey, recycleBinKey];

    return await withLock(orderedKeys[0], async () => {
      return await withLock(moveJournalKey, async () => {
        return await withLock(orderedKeys[1], async () => {
          const results = await AsyncStorage.multiGet([targetKey, recycleBinKey]);
          const targetRaw = results.find(r => r[0] === targetKey)?.[1];
          const binRaw = results.find(r => r[0] === recycleBinKey)?.[1];

          let targetMap: Record<string, any> = targetRaw ? JSON.parse(targetRaw) : {};
          let binArray: any[] = binRaw ? JSON.parse(binRaw) : [];

          const binItemIndex = binArray.findIndex(i => 
            (i.entityId === op.entityId || i.id === `rb-${op.entityId}` || i.id.startsWith(`rb-${op.entityId}-g`)) &&
            ((i.lifecycleGeneration ?? 1) === (op.lifecycleGeneration ?? 1))
          );
          const targetData = targetMap[op.entityId];

          if (targetData && (targetData.lifecycleGeneration || 1) > (op.lifecycleGeneration || 1)) {
            console.warn(`[MoveReconciler] Target entity ${op.entityId} has newer generation (${targetData.lifecycleGeneration} vs ${op.lifecycleGeneration}). Aborting stale restore.`);
            if (binItemIndex !== -1) {
              binArray.splice(binItemIndex, 1);
              await AsyncStorage.setItem(recycleBinKey, JSON.stringify(binArray));
            }
            await MoveJournalRepository.removeOperationsUnlocked([op.operationId]);
            return "OBSOLETE";
          }

          if (binItemIndex !== -1 && !targetData) {
            // Restore it
            const binItem = binArray[binItemIndex];
            const restoredItem = {
              ...JSON.parse(binItem.snapshot),
              workspaceId: targetWorkspaceId,
            };

            targetMap[op.entityId] = restoredItem;
            binArray.splice(binItemIndex, 1);

            // We MUST write target FIRST to prevent data loss on crash.
            await AsyncStorage.setItem(targetKey, JSON.stringify(targetMap));
            
            // Verify Target Write (Durable Post-Condition)
            const vTargetRaw = await AsyncStorage.getItem(targetKey);
            if (vTargetRaw !== JSON.stringify(targetMap)) {
              throw new Error(`[MoveReconciler] Durable write verification failed for target partition ${targetKey}`);
            }

            // Write RecycleBin
            await AsyncStorage.setItem(recycleBinKey, JSON.stringify(binArray));
            
            // Verify RecycleBin Write (Durable Post-Condition)
            const vBinRaw = await AsyncStorage.getItem(recycleBinKey);
            if (vBinRaw !== JSON.stringify(binArray)) {
               throw new Error(`[MoveReconciler] Durable write verification failed for Recycle Bin`);
            }
          } else if (binItemIndex !== -1 && targetData) {
            // Ghost duplicate! Remove from bin
            binArray.splice(binItemIndex, 1);
            await AsyncStorage.setItem(recycleBinKey, JSON.stringify(binArray));
            
            // Verify RecycleBin Write (Durable Post-Condition)
            const vBinRaw = await AsyncStorage.getItem(recycleBinKey);
            if (vBinRaw !== JSON.stringify(binArray)) {
               throw new Error(`[MoveReconciler] Durable write verification failed for Recycle Bin`);
            }
          } else if (binItemIndex === -1 && !targetData) {
            console.warn(`[MoveReconciler] UNCERTAIN STATE: Entity ${op.entityId} (${op.entityType}) missing from both recycle bin and target (${op.targetWorkspaceId}) for operation ${op.operationId}. Preserving journal.`);
            return "PRESERVED";
          } else if (binItemIndex === -1 && targetData) {
            // Already successful.
          }

          await MoveJournalRepository.removeOperationsUnlocked([op.operationId]);
          console.log(`[MoveReconciler] Successfully reconciled restore operation ${op.operationId}`);
          return "RESOLVED";
        });
      });
    });
  }

  /**
   * One-off scan to resolve ghosts created prior to Batch 2B.
   */
  static async reconcileHistoricalGhosts(): Promise<void> {
    await withLock(this.RECONCILER_LOCK, async () => {
      const entityTypes = ["task", "habit", "checklist", "resource"];
      
      const workspacesRaw = await AsyncStorage.getItem("pebble:v1:workspaces");
      const workspaces = workspacesRaw ? JSON.parse(workspacesRaw) : [];
      // Deduplicate workspace IDs in case of any data anomalies
      const workspaceIds = Array.from(new Set(["inbox", ...workspaces.map((w: any) => w.id)]));

      for (const type of entityTypes) {
        const keysToFetch = workspaceIds.map(wsId => this.getPartitionKey(type, wsId));
        
        // 1. Unlocked read to discover duplicates (fast pass)
        const allPartitions = await AsyncStorage.multiGet(keysToFetch);

        const entityLocations = new Map<string, string[]>();
        
        for (const [key, value] of allPartitions) {
          if (!value) continue;
          const map = JSON.parse(value);
          for (const entityId of Object.keys(map)) {
            const locations = entityLocations.get(entityId) || [];
            locations.push(key);
            entityLocations.set(entityId, locations);
          }
        }

        const duplicateGroups = Array.from(entityLocations.entries())
          .filter(([_, locations]) => locations.length > 1);

        if (duplicateGroups.length === 0) continue;

        console.log(`[MoveReconciler] Found ${duplicateGroups.length} historical duplicate groups for ${type}s.`);

        // 2. For each duplicate group, acquire specific locks, re-read, and resolve
        for (const [entityId, keys] of duplicateGroups) {
          const sortedKeys = Array.from(new Set(keys)).sort();
          
          await withLocks(sortedKeys, async () => {
            // Re-read under lock to ensure consistency
            const lockedPartitions = await AsyncStorage.multiGet(sortedKeys);
            
            let highestUpdatedAt = -1;
            let authoritativeKey: string | null = null;
            let isAmbiguous = false;
            
            const parsedMaps = new Map<string, any>();
            const activeLocations: string[] = [];

            for (const [key, value] of lockedPartitions) {
              if (!value) continue;
              const map = JSON.parse(value);
              parsedMaps.set(key, map);
              
              const entity = map[entityId];
              if (entity) {
                activeLocations.push(key);
                const updatedAt = entity.updatedAt || 0;
                
                if (updatedAt > highestUpdatedAt) {
                  highestUpdatedAt = updatedAt;
                  authoritativeKey = key;
                  isAmbiguous = false;
                } else if (updatedAt === highestUpdatedAt) {
                  isAmbiguous = true;
                }
              }
            }

            // If it's no longer a duplicate, or is completely gone, nothing to do
            if (activeLocations.length <= 1) return;

            // If ambiguous (equal timestamps), DO NOT GUESS. Preserve data and log.
            if (isAmbiguous) {
              console.warn(`[MoveReconciler] Ambiguous historical ghost for ${entityId}. Timestamps are equal. Preserving data.`);
              return;
            }
            
            if (!authoritativeKey) return;

            // Delete from all non-authoritative partitions
            const writes: [string, string][] = [];
            for (const key of activeLocations) {
              if (key !== authoritativeKey) {
                const map = parsedMaps.get(key)!;
                delete map[entityId];
                writes.push([key, JSON.stringify(map)]);
              }
            }

            if (writes.length > 0) {
              for (const [writeKey, writeValue] of writes) {
                await AsyncStorage.setItem(writeKey, writeValue);
                
                const verifyRaw = await AsyncStorage.getItem(writeKey);
                if (verifyRaw !== writeValue) {
                  throw new Error(`[MoveReconciler] Durable write verification failed for historical ghost cleanup at ${writeKey}`);
                }
              }
            }
          });
        }
      }
    });
  }
}
