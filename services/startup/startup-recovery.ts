/**
 * startup-recovery.ts
 * ───────────────────
 * The single, testable startup recovery sequence for Pebble.
 *
 * Every persisted domain with a reconciler/recovery pass is invoked here, in
 * dependency order, so the app converges onto its intended state before UI
 * mounts. Ordering rationale:
 *
 * 1. `recoverInterruptedRestore`       — finish any crashed backup restore
 *    first so every downstream reconciler reads a settled storage surface.
 * 2. `MoveReconcilerService.reconcileAll` — replay cross-workspace move intents.
 * 3. `ConversionReconcilerService.reconcileAll` — roll forward/back conversions.
 * 4. `MoveReconcilerService.reconcileHistoricalGhosts` — prune journal intents
 *    whose entities no longer exist.
 * 5. `cleanupRecycleBin`               — drop expired recycle-bin snapshots.
 * 6. `GraphReconcilerService.reconcileAll` — prune dangling/stale relationship
 *    edges against the now-settled entity registry (after restore/moves/
 *    conversions/recycle-bin cleanup). Graph state is RECONCILED integrity:
 *    self-healing, idempotent, internally locked.
 * 7. `NotificationReconcilerService.reconcileAll` — rebuild missing OS
 *    notifications. Tolerant of failure so startup never crashes on
 *    notification errors; it never requests OS permission.
 *
 * Each step is idempotent and internally locked. This function intentionally
 * performs NO cross-step transaction — AsyncStorage cannot provide one, and
 * every step is designed to converge on repeated runs (RECONCILED model).
 */
import { BackupService } from "@/services/storage/backup.service";
import { ConversionReconcilerService } from "@/services/storage/ConversionReconcilerService";
import { GraphReconcilerService } from "@/services/storage/GraphReconcilerService";
import { MoveReconcilerService } from "@/services/storage/MoveReconcilerService";
import { NotificationReconcilerService } from "@/services/notifications/NotificationReconcilerService";
import { cleanupRecycleBin } from "@/services/storage/storage.service";

export async function runStartupRecovery(): Promise<void> {
  await BackupService.recoverInterruptedRestore();
  await MoveReconcilerService.reconcileAll();
  await ConversionReconcilerService.reconcileAll();
  await MoveReconcilerService.reconcileHistoricalGhosts();
  await cleanupRecycleBin();
  await GraphReconcilerService.reconcileAll();

  // Notification reconciliation must finish before the UI mounts to prevent
  // races with user mutations, but failure must not crash startup.
  try {
    await NotificationReconcilerService.reconcileAll();
  } catch (e) {
    console.warn("[Startup] Failed to run NotificationReconcilerService", e);
  }
}