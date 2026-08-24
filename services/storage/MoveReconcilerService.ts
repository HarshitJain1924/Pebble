import AsyncStorage from "@react-native-async-storage/async-storage";
import { MoveJournalRepository } from "@/repositories/MoveJournalRepository";
import { withLock, withLocks } from "@/shared/utils/mutex";
import { cancelReminderIds } from "@/services/scheduling/reminders.service";
import type { MoveJournalEntry, Task, Habit, Checklist, Resource } from "@/shared/types/domain.types";

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
        
        // Remove older superseded operations safely
        const superseded = opList.slice(0, opList.length - 1);
        for (const oldOp of superseded) {
          try {
            await MoveJournalRepository.removeOperation(oldOp.operationId);
            console.log(`[MoveReconciler] Removed superseded operation ${oldOp.operationId} for entity ${entityId}`);
          } catch (e) {
            console.warn(`[MoveReconciler] Failed to remove superseded op ${oldOp.operationId}`, e);
          }
        }

        const latestOp = opList[opList.length - 1];
        try {
          await this.reconcileOperation(latestOp);
        } catch (e) {
          console.error(`[MoveReconciler] Failed to reconcile operation ${latestOp.operationId}`, e);
          // We throw so that if called during Backup, the backup crashes rather than serializing duplicates.
          throw e;
        }
      }
    });
  }

  private static getPartitionKey(entityType: string, workspaceId: string): string {
    return `pebble:v1:${entityType}s:${workspaceId}`;
  }

  private static async reconcileOperation(op: MoveJournalEntry): Promise<void> {
    if (op.operationType === "recycle") {
      return this.reconcileRecycle(op);
    } else if (op.operationType === "restore") {
      return this.reconcileRestore(op);
    } else {
      return this.reconcileMove(op);
    }
  }

  private static async reconcileMove(op: MoveJournalEntry): Promise<void> {
    const sourceKey = this.getPartitionKey(op.entityType, op.sourceWorkspaceId);
    const targetKey = this.getPartitionKey(op.entityType, op.targetWorkspaceId);

    // Alphabetical sort to prevent deadlocks between opposite moves
    const sortedKeys = [sourceKey, targetKey].sort();

    await withLock(sortedKeys[0], async () => {
      await withLock(sortedKeys[1], async () => {
        const [sourceRaw, targetRaw] = await AsyncStorage.multiGet([sourceKey, targetKey]);
        
        let sourceMap: Record<string, any> = sourceRaw[1] ? JSON.parse(sourceRaw[1]) : {};
        let targetMap: Record<string, any> = targetRaw[1] ? JSON.parse(targetRaw[1]) : {};

        // In multiGet, the results are [ [key1, val1], [key2, val2] ] but their order matches the input array
        // So sourceRaw corresponds to sourceKey and targetRaw corresponds to targetKey.
        // Wait, multiGet returns array of arrays in the order of requested keys.
        const results = await AsyncStorage.multiGet([sourceKey, targetKey]);
        sourceMap = results[0][1] ? JSON.parse(results[0][1]) : {};
        targetMap = results[1][1] ? JSON.parse(results[1][1]) : {};

        const targetData = targetMap[op.entityId];
        const sourceData = sourceMap[op.entityId];

        if (!sourceData && !targetData) {
          // Both missing, nothing to do
        } else if (sourceData && !targetData) {
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
                // Must cancel native OS notifications to prevent zombies.
                // We use throwOnError: false because the Native layer could be unavailable, 
                // but if it completely crashes, the Promise will reject, reverting the entire multiSet.
                await cancelReminderIds(fork.reminder.notificationIds, { throwOnError: false });
              } catch (e) {
                console.warn(`[MoveReconciler] Failed to cancel notifications for fork ${forkId}`, e);
                // We intentionally rethrow to abort the transaction if cancellation hard-crashes.
                // This ensures the move journal entry is preserved for safe retry.
                throw e;
              }
              // Strip IDs so NotificationReconciler generates fresh ones for the fork.
              delete fork.reminder.notificationIds;
            }

            targetMap[forkId] = fork;
          }
        }

        // Step 2: Delete from Source
        if (sourceMap[op.entityId]) {
          delete sourceMap[op.entityId];
        }

        // Step 3: Write back to storage atomically
        await AsyncStorage.multiSet([
          [sourceKey, JSON.stringify(sourceMap)],
          [targetKey, JSON.stringify(targetMap)],
        ]);

        // Step 4: Remove the completed operation from the journal
        await MoveJournalRepository.removeOperation(op.operationId);
        console.log(`[MoveReconciler] Successfully reconciled operation ${op.operationId}`);
      });
    });
  }

  private static async reconcileRecycle(op: MoveJournalEntry): Promise<void> {
    const sourceKey = this.getPartitionKey(op.entityType, op.sourceWorkspaceId);
    const recycleBinKey = "pebble:v1:recycle_bin";

    // Enforce strict lock hierarchy: Partition Lock -> Recycle Bin Lock
    // Do NOT sort alphabetically, as it inverts the hierarchy and causes deadlocks.
    const orderedKeys = [sourceKey, recycleBinKey];

    await withLock(orderedKeys[0], async () => {
      await withLock(orderedKeys[1], async () => {
        const results = await AsyncStorage.multiGet([sourceKey, recycleBinKey]);
        const sourceRaw = results.find(r => r[0] === sourceKey)?.[1];
        const binRaw = results.find(r => r[0] === recycleBinKey)?.[1];

        let sourceMap: Record<string, any> = sourceRaw ? JSON.parse(sourceRaw) : {};
        let binArray: any[] = binRaw ? JSON.parse(binRaw) : [];

        const sourceData = sourceMap[op.entityId];
        const binItemIndex = binArray.findIndex(i => i.entityId === op.entityId || i.id === `rb-${op.entityId}`);
        const isInBin = binItemIndex !== -1;

        if (sourceData && !isInBin) {
          // Add to recycle bin, remove from active
          const newItem = {
            id: `rb-${op.entityId}`,
            entityType: op.entityType,
            entityId: op.entityId,
            snapshot: JSON.stringify(sourceData),
            deletedAt: op.timestamp || Date.now(),
          };
          binArray.unshift(newItem);
          delete sourceMap[op.entityId];

          await AsyncStorage.multiSet([
            [sourceKey, JSON.stringify(sourceMap)],
            [recycleBinKey, JSON.stringify(binArray)]
          ]);
        } else if (sourceData && isInBin) {
          // Ghost duplicate! Remove from active
          delete sourceMap[op.entityId];
          await AsyncStorage.setItem(sourceKey, JSON.stringify(sourceMap));
        } else if (!sourceData && !isInBin) {
          // In neither. Nothing to do.
        } else if (!sourceData && isInBin) {
          // Already successful.
        }

        await MoveJournalRepository.removeOperation(op.operationId);
        console.log(`[MoveReconciler] Successfully reconciled recycle operation ${op.operationId}`);
      });
    });
  }

  private static async reconcileRestore(op: MoveJournalEntry): Promise<void> {
    const targetKey = this.getPartitionKey(op.entityType, op.targetWorkspaceId);
    const recycleBinKey = "pebble:v1:recycle_bin";

    // Enforce strict lock hierarchy: Partition Lock -> Recycle Bin Lock
    // Do NOT sort alphabetically, as it inverts the hierarchy and causes deadlocks.
    const orderedKeys = [targetKey, recycleBinKey];

    await withLock(orderedKeys[0], async () => {
      await withLock(orderedKeys[1], async () => {
        const results = await AsyncStorage.multiGet([targetKey, recycleBinKey]);
        const targetRaw = results.find(r => r[0] === targetKey)?.[1];
        const binRaw = results.find(r => r[0] === recycleBinKey)?.[1];

        let targetMap: Record<string, any> = targetRaw ? JSON.parse(targetRaw) : {};
        let binArray: any[] = binRaw ? JSON.parse(binRaw) : [];

        const targetData = targetMap[op.entityId];
        const binItemIndex = binArray.findIndex(i => i.entityId === op.entityId || i.id === `rb-${op.entityId}`);
        const isInBin = binItemIndex !== -1;

        if (!targetData && isInBin) {
          // Add to active, remove from recycle bin
          const binItem = binArray[binItemIndex];
          const restoredEntity = JSON.parse(binItem.snapshot);
          if (restoredEntity.workspaceId) restoredEntity.workspaceId = op.targetWorkspaceId;
          
          targetMap[op.entityId] = restoredEntity;
          binArray.splice(binItemIndex, 1);

          await AsyncStorage.multiSet([
            [targetKey, JSON.stringify(targetMap)],
            [recycleBinKey, JSON.stringify(binArray)]
          ]);
        } else if (targetData && isInBin) {
          // Ghost duplicate! Remove from recycle bin
          binArray.splice(binItemIndex, 1);
          await AsyncStorage.setItem(recycleBinKey, JSON.stringify(binArray));
        } else if (!targetData && !isInBin) {
          // In neither.
        } else if (targetData && !isInBin) {
          // Already successful.
        }

        await MoveJournalRepository.removeOperation(op.operationId);
        console.log(`[MoveReconciler] Successfully reconciled restore operation ${op.operationId}`);
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
              await AsyncStorage.multiSet(writes);
            }
          });
        }
      }
    });
  }
}
