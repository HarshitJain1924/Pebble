> [!WARNING]
> HISTORICAL AUDIT — NOT CURRENT ARCHITECTURE SOURCE OF TRUTH

# Final Split-Brain Hostile Audit

## Domain-Level Conflict Policy
FAIL
- **Why**: Appending primitive values like `status`, `priority`, or `title` into the `description` string preserves bytes but destroys semantic domain intent. For example, if Source changes status to "completed" and Target remains "todo", appending `Status: completed` to the description leaves the actual entity status as "todo". This silently alters the user's domain intent. It also completely drops unhandled fields like `categoryId`, `schedule`, and `recurrence` during conflicts.

## Source-Only Edit
PASS
- **Why**: Explicitly handles `sourceEdited && !targetEdited` by forwarding the source data to the target partition.

## Target-Only Edit
PASS
- **Why**: Explicitly handles `!sourceEdited && targetEdited` by preserving target data and discarding the source ghost.

## Both-Sides Edit
FAIL
- **Why**: Relies on the flawed `resolveMoveConflict` policy which destroys semantic intent of primitive fields and drops unhandled fields.

## Same-Field Conflict
FAIL
- **Why**: Converts conflicting primitives to text notes in the description.

## Different-Field Conflict
PARTIAL
- **Why**: Handles isolated array modifications well (unions), but still falls victim to the primitive stringification policy for other fields.

## Array Conflict
PARTIAL
- **Why**: Unioning arrays prevents data loss of additions, but fails to handle deletions.

## Clear/Delete Conflict
FAIL
- **Why**: If one side deletes a tag, clears a description, or removes a checklist item, the union logic blindly restores it from the other side. The deletion intent is permanently lost.

## Reminder Conflict
FAIL
- **Why**: The code strips `notificationIds` when reminders conflict. While this forces the Reconciler to generate new IDs, it leaves the old OS notifications permanently orphaned. They are never cancelled, resulting in duplicate zombie notifications.

## Timestamp Authority
PARTIAL
- **Why**: Relies on `updatedAt > op.timestamp`. This assumes clocks are perfectly synchronized between the move intent and subsequent edits, and that `updatedAt` is only ever bumped by legitimate user intent (not background normalization).

## Atomicity
FAIL
- **Why**: Reconciliation is NOT atomic. `AsyncStorage.multiSet` (target write + source delete) and `MoveJournalRepository.removeOperation` are completely separate I/O boundaries. The workflow relies on idempotency, not true atomicity. 

## Crash Safety
PASS
- **Why**: If a crash occurs after `multiSet` but before journal removal, the next execution will find `sourceData` missing and `targetData` present. It will redundantly but safely rewrite the target and then successfully remove the journal entry.

## Retry Safety
PASS
- **Why**: The idempotency mechanism (checking if source/target exist) safely handles retries.

## Notification Compatibility
FAIL
- **Why**: Orphaned OS notification IDs will cause duplicate push notifications.

## Relationship Integrity
PASS
- **Why**: The canonical `id` is strictly preserved, keeping external foreign keys intact.

## Test Quality
WEAK
- **Why**: The tests only assert the "happy path" of the conflict resolver. There are zero tests asserting that deletion intents survive, zero tests asserting that orphaned OS notifications are actually cancelled, and zero tests proving safety across simulated crash boundaries.

## Confirmed P0 Bugs
None

## Confirmed P1 Bugs
1. **Semantic Data Loss via Stringification**: Conflicting primitives (`status`, `priority`) lose their domain meaning when shoved into `description`.
2. **Notification Leak**: Stripping `notificationIds` without cancelling them creates permanent zombie OS notifications.
3. **Deletion Intent Loss**: Array unions (`tags`, `items`) silently resurrect deleted items.

## Confirmed P2 Bugs
1. **Un-atomic Journal Removal**: Crash between storage write and journal removal requires a redundant I/O loop on next boot.

## False Positives
- The previous report claimed the conflict resolution was "safe" because bytes weren't lost, ignoring semantic domain rules.

## Exact Problematic Code Paths
- `MoveReconcilerService.ts:182` (`delete resolved.reminder.notificationIds;`)
- `MoveReconcilerService.ts:209` (Stringifying conflicts into `description`)
- `MoveReconcilerService.ts:149` (Naive array unions)

## Exact Changed Files
None. Read-only audit performed.

## Test Results
Tests were not run, as the fundamental domain semantics and implementation logic were proven unsafe through static code inspection.

## Final Verdict
REQUIRES FIXES


