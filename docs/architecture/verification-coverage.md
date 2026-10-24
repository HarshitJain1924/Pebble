# Verification Coverage (Audit)

> **Audited commit:** `dd5e785770456964a28862aec7e25f4dc4adc447` · **Branch:** `migration/runtime-parity` · **Tree:** clean · **Date:** 2026-10-24
>
> This file records only checks that were actually executed in this audit, plus the coverage that already exists in the repository and what it does and does not prove. No tests were added or modified.

## 1. Checks executed

| Command | Result | Notes |
|---|---|---|
| `npx tsc --noEmit` | **exit 0** (no diagnostics) | TypeScript check over the current checkout. |
| `npx jest --runInBand --forceExit` | **exit 0** — `Test Suites: 245 passed, 245 total`; `Tests: 2801 passed, 2801 total`; `Time: 155.518 s` | This is equivalent to the repository's `npm test` script. Output captured to a local log; the run printed the expected `Force exiting Jest` notice. |
| Static repository scan (grep/find/read) | n/a | Direct AsyncStorage call sites, repository writes from `app/`/`features/`, `withLock`/`withLocks` usage, event emissions, `*Unlocked` call sites, lock-order sites, storage-key registry, backup/restore policy. |
| `git status` / `git log` / `git rev-parse` | clean tree; HEAD `dd5e785770456964a28862aec7e25f4dc4adc447`; branch in sync with `origin/migration/runtime-parity` | Starting state for this audit. |

**Not run:** `npm run lint` / `expo lint` (not requested by the audit's verification step and would surface pre-existing style noise rather than integrity evidence); any device/simulator build; any E2E/Detox run; any fault-injection script against the working tree (the audit forbids modifying tests/code, so the new findings in `architecture-violations.md` are static call-path proofs, not reproduced failures).

## 2. Existing coverage mapped to architectural invariants

| Invariant | Suites / tests that genuinely exercise it | What it proves | What it does not prove |
|---|---|---|---|
| Reward durability for Task/Habit (intent → entity → award) | `services/command/__tests__/rewardDurability.test.ts` (18) | Fail-closed intent write; award failure keeps an intent; replay settles it; validator rejects uncompleted/deleted/stale-day intents; exactly-once under concurrency; entity-write failure discards an orphan intent; unreadable ledger does not break replay | The uncomplete/recomplete interleaving around reward **reversal** (F5) is not covered |
| Checklist one-time reward | `services/command/__tests__/checklistFocusRewardDurability.test.ts` (7 checklist) | Latch + intent ordering; award failure repaired on next toggle/startup; no award when persistence fails or the checklist is incomplete; recurring occurrence latch; daily cap terminal | Reversal is intentionally absent (documented); no interaction with checklist permanent delete in the same window |
| Focus completion idempotency | `services/command/__tests__/focusSessionCompletion.test.ts` (8); `checklistFocusRewardDurability.test.ts` (6 focus); `features/focus/hooks/__tests__/useFocusSessionDurability.test.tsx` (2) | Session/stats/reward/edge exactly-once at three crash boundaries; concurrent completion; retry convergence; timer marker retained on command failure; marker released after commit; repeated recovery no-op | Stopwatch reset path (F1); incremental minute crediting (P2) |
| Conversion journal roll-forward/rollback | `services/command/__tests__/conversionHostileVerification.test.ts`; `services/storage/__tests__/ConversionReconcilerHostileVerification.test.ts`; `ConversionReconcilerStateVerification.test.ts` | Crash at PREPARED / DESTINATION_WRITTEN / source deletion / journal deletion; repeated recovery; edge retarget both directions; no duplicate destination | Cross-device concurrent conversion (out of scope by design) |
| Move journal + reconciler | `services/storage/__tests__/MoveJournalRemovalDurability.test.ts`, `MoveReconciler*.test.ts` (4 hostile files), `recycleRestoreTransactionRecovery.test.ts` | Journal removal durability, coalescing, partial commit, chained moves, tombstone protection, ghost pruning, workspace deletion race | Second-runtime writes (in-memory mutex limitation) |
| Recycle bin concurrency/purge/restore | `recycleBinConcurrency.test.ts`, `recycleBinHostileVerification.test.ts`, `recycleBinPurge.test.ts`, `recycleDeleteRestoreReferentialIntegrity.test.ts`, `restoreJournalIntegrity.test.ts` | Bin RMW serialization, strict snapshot-before-delete, per-item purge reporting, tombstone barriers, referential integrity after recycle/restore | The second restore orchestrator's batch semantics and child-event policy (V6) |
| Workspace delete/restore integrity | `workspaceDeletion.test.ts`, `workspaceDeletionHostileVerification.test.ts`, `workspaceRestore.test.ts`, `workspaceRestoreRecovery.test.ts`, `workspaceArchive.test.ts`, `workspaceHostileVerification.test.ts` | Package snapshot incl. graph edges; retry idempotency; live-children preservation; bin retention on partial failure; archived children; generation guards | Archive/unarchive locking and write-failure behavior (V2); pre-lock reads in permanent delete (V8) |
| Lifecycle generation / tombstones / CAS | `lifecycleGenerationRevisionTombstones.test.ts`, `lifecycleGenerationAllocationSafety.test.ts`, `universalLifecycleStaleOperationBarrier.test.ts`, `staleLifecycleOperationsVersionedIdentity.test.ts`, `revisionCASVerification.test.ts`, `permanentDeleteCrashBoundary.test.ts`, `hostileCrashBoundaryLifecycleTombstones.test.ts` | Generation barriers, stale-operation rejection, revision checks, permanent-delete crash boundaries | Nothing identified |
| Notification scheduling/reconciliation | 14 suites in `services/notifications/__tests__` incl. `SingleAuthoritativeReminderMutationPath.test.ts`, `NotificationIdentityHardening`, `NotificationReconciliationCompleteness`, `ReconciliationSnapshotFreshness`, `settingsDrivenReconciliation`, `notificationPermissionLifecycle` | Identity/signature rules, duplicate collapse, stale cancellation, settings policy, permission gating, repair of missing ids, single scheduling path through commands | The web load-time re-arm write path (V1); real OS delivery |
| Scheduling/recurrence/quiet hours | 15 suites in `services/scheduling/__tests__` incl. `calendarSchedulingSeparation.test.ts`, `calendarHabitScheduling.test.ts`, `recurrence.test.ts`, `webReminderLifecycle.test.ts` | Schedule-vs-reminder separation, recurrence math, web loops, snooze, quiet-hour precision, escalation | Habit drag writing Reminder instead of Schedule (F3); habit completion date semantics (F2) |
| Backup/restore policy | `storageKeyRegistry.test.ts`, `BackupService.test.ts` (1071 lines), `backup.test.ts`, `backupRestore.phase0.test.ts` | Every owned key classified; set disjointness; malformed payload/bin rejection before mutation; preserved vs reset behavior; rollback; interrupted-restore replay | No test of `clearRepositoryStorage`'s divergent predicate (V5); restore on a real device |
| Command handler concurrency | `TaskCommandHandler.test.ts`, `HabitCommandHandler.test.ts`, `ChecklistCommandHandler.test.ts`, `ResourceCommandHandler.test.ts`, `toggleChecklistItemConcurrency.test.ts`, `permanentlyDeleteResourceConcurrency.test.ts`, `completeHabitsConcurrency.test.ts`, `clearCompleted.test.ts`, `multiKeyFailure.test.ts`, `notificationPersistenceCrashSafety.test.ts` | Locked RMW, lifecycle guards, per-item habit isolation, reminder persistence around failures | Task bulk isolation (F4); uncomplete reward reversal ordering (F5) |
| Cross-domain graph/resource references | `RelationshipGraphIntegrity.test.ts`, `CrossDomainIntegrity.test.ts`, `GraphReconcilerResourceIdsRace.test.ts`, `LifecycleReconciliation.test.ts` | Dangling/stale edges pruned, resourceIds preserved under concurrent linking, no ghost resurrection | Graph cache coherency across runtimes (P3) |
| Startup recovery | `services/startup/__tests__/startupRecovery.test.ts` (4) | Step order, graph placement, no permission request, notification-failure tolerance | Failure isolation of steps 1–6 and routing impact (P1) |
| Onboarding | `services/onboarding/__tests__` | Completion flag last, idempotency, bootstrap writes | Nothing identified |
| UI/state behaviour | `app/__tests__` (10), `features/*/components/__tests__`, `features/*/hooks/__tests__`, `features/today/__tests__` | Screen data wiring, event propagation, optimistic flows, theme/dark overlay, calendar hooks (21 suites) | Real gestures/drag geometry; silent-failure UX (F6) |

## 3. Coverage gaps exposed by this audit

These are the flows with **no** existing test that would fail if the current defect were introduced:

1. Task/Habit `uncomplete*` reward reversal interleaving with `complete*` (F5).
2. Task bulk `completeTasks`/`archiveTasks` mid-batch failure isolation and hook-level rejection (F4).
3. Stopwatch reset persistence failure (F1).
4. Habit completion from a non-today calendar date (F2).
5. Habit drag/planner placement write (F3).
6. Workspace `archiveWorkspace`/`restoreWorkspaceArchive` concurrent update and write failure (V2).
7. `reorderWorkspaces` write failure (V3).
8. `permanentlyDeleteWorkspace` with a concurrent restore committing before the lock (V8).
9. Startup step 1–6 failure isolation and onboarding routing after a recovery throw (P1).
10. Batch restore from the Recycle Bin (partial failure, child events) (V6).
11. `clearRepositoryStorage` ownership predicate (V5).
12. Web load-time reminder re-arm overwriting a concurrent mutation (V1).

## 4. Device / end-to-end work still required

- OS notification delivery, scheduled-trigger accuracy, quiet-hours suppression, permission denial/re-enable, and background timers on a physical iOS and Android device.
- Reanimated/gesture behavior of calendar drag-and-drop and the task swipe actions (the command calls were verified statically, not the gestures).
- Backup export through the real share sheet and restore from a file on-device, including a restore with a live timer/stopwatch marker.
- App-kill scenarios during focus expiry and during a move/conversion, on-device, to confirm the startup reconcilers run before the UI is usable.
- Large-dataset performance (charts/list virtualization) — not an integrity concern and not measured here.
