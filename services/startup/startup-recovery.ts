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
 * 7. `resolveAllRewardIntents` — credit completion rewards that were recorded
 *    but never awarded (interruption between the entity write and the award).
 *    Idempotent by rewardId and gated on the entity still being in the rewarded
 *    state, so it never pays an uncompleted/recycled/deleted entity.
 * 8. `NotificationReconcilerService.reconcileAll` — rebuild missing OS
 *    notifications; it never requests OS permission.
 *
 * Each step is idempotent and internally locked. This function intentionally
 * performs NO cross-step transaction — AsyncStorage cannot provide one, and
 * every step is designed to converge on repeated runs (RECONCILED model).
 *
 * FAILURE ISOLATION: one step's failure must not skip the steps after it. An
 * unreadable store or a transient storage error in step 1 previously propagated
 * out of this function, so move/conversion replay, recycle-bin cleanup, graph
 * pruning and notification repair all never ran — and the caller's onboarding
 * routing was skipped too. Each step is now settled independently: it is
 * awaited (so ordering still holds), its rejection is logged, and the sequence
 * continues. The function itself does not reject.
 */

import { BackupService } from "@/services/storage/backup.service";
import { ConversionReconcilerService } from "@/services/storage/ConversionReconcilerService";
import { GraphReconcilerService } from "@/services/storage/GraphReconcilerService";
import { MoveReconcilerService } from "@/services/storage/MoveReconcilerService";
import { NotificationReconcilerService } from "@/services/notifications/NotificationReconcilerService";
import { cleanupRecycleBin } from "@/services/storage/storage.service";
import { resolveAllRewardIntents } from "@/features/profile/services/reward-intent.service";

/**
 * Run one recovery step, logging (never propagating) its failure.
 *
 * Steps are still awaited one at a time: a later step may depend on an earlier
 * one having run, so they must not execute concurrently. Only the failure is
 * contained.
 */
async function settle(label: string, step: () => Promise<unknown>): Promise<void> {
  try {
    await step();
  } catch (e) {
    console.warn(
      `[Startup] Recovery step "${label}" failed; continuing with the remaining steps`,
      e,
    );
  }
}

export async function runStartupRecovery(): Promise<void> {
  await settle("recoverInterruptedRestore", () =>
    BackupService.recoverInterruptedRestore(),
  );
  await settle("moveReconcileAll", () => MoveReconcilerService.reconcileAll());
  await settle("conversionReconcileAll", () =>
    ConversionReconcilerService.reconcileAll(),
  );
  await settle("reconcileHistoricalGhosts", () =>
    MoveReconcilerService.reconcileHistoricalGhosts(),
  );
  await settle("cleanupRecycleBin", () => cleanupRecycleBin());
  await settle("graphReconcileAll", () =>
    GraphReconcilerService.reconcileAll(),
  );

  // Completion rewards are owed-but-uncredited work, not derived state: resolve
  // them once the entity surface has settled.
  await settle("resolveRewardIntents", () => resolveAllRewardIntents());

  // Notification reconciliation must finish before the UI mounts to prevent
  // races with user mutations.
  await settle("notificationReconcileAll", () =>
    NotificationReconcilerService.reconcileAll(),
  );
}
