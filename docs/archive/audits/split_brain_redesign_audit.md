> [!WARNING]
> HISTORICAL AUDIT � NOT CURRENT ARCHITECTURE SOURCE OF TRUTH

# Split-Brain Redesign Audit

## Current Merge Model
The current `resolveMoveConflict()` model relies on unsafe generic merging. It destroys semantic domain intent by stringifying conflicting primitives (`status`, `priority`) into the `description`, and uses naive `Set` unions for arrays which fundamentally resurrects items/tags that were intentionally deleted by the user.

## Domain Field Classification
| Entity | Field | Classification | Conflict Strategy |
|--------|-------|----------------|-------------------|
| *All* | `id` | B (Immutable identity) | Enforce |
| *All* | `workspaceId` | A (Move metadata) | Target Wins |
| *All* | `title`, `description` | C (User-editable scalar) | Cannot auto-merge |
| *All* | `categoryId` | C (User-editable scalar) | Cannot auto-merge |
| Task/Habit | `status`, `priority`, `schedule`, `recurrence` | C (User-editable scalar) | Cannot auto-merge |
| Task/Habit | `reminder` | F (Notification state) | Target Wins + Cancel Source OS IDs |
| Checklist | `items` | D (User-editable collection) | Cannot auto-merge without BASE |
| *All* | `tags`, `resourceIds` | D (User-editable collection) | Cannot auto-merge without BASE |
| Habit | `completionHistory` | E (Derived state collection) | Safe to union by date |
| *All* | `createdAt`, `updatedAt`, `archivedAt` | H (System metadata) | Max timestamp |

## Existing Version / Revision Metadata
Pebble entities currently store only `createdAt` and `updatedAt`. There are no revision counters, vector clocks, or per-field mutation history logs.

## Can Deletions Be Detected?
**NO**. Without a baseline snapshot of the entity at the time of the move, it is mathematically impossible to distinguish an intentional deletion on one side from an addition on the other. Naive Set unions will invariably resurrect deleted arrays elements.

## Strategy A — Target Authoritative (Fork on Conflict)
If a split-brain (Case D) is detected, Target remains authoritative. The Source edits are preserved by **forking** the Source entity (generating a new UUID, appending "[Conflict]" to the title) and moving it to the target workspace alongside the Target. 
- **Pros**: 100% guarantees zero data loss without complex merge algorithms. No schema migrations needed.

## Strategy B — Explicit Conflict
Preserve both versions within a single entity using a wrapper or `conflictState` field, requiring UI updates to prompt the user for resolution.
- **Pros**: Cleanest user experience.
- **Cons**: Requires massive architectural changes to `domain.types.ts` and UI layers across the entire application to handle "conflicted" states.

## Strategy C — Three-Way Merge
Capture a `baseSnapshot` (stringified JSON) in the `MoveJournalEntry` at the time of the move. During reconciliation, perform a field-level 3-way merge by diffing Source and Target against the Base.
- **Pros**: Truly silent, correct resolution for most fields (additions vs deletions are distinguishable).
- **Cons**: Storage overhead in the journal. Implementing a robust deep 3-way merge is complex and error-prone for nested objects. Does not solve Same-Field conflicts (e.g. if BOTH edit the title to different values, we still must fork or drop one).

## Strategy D — Last Write Wins
Simply compare `source.updatedAt` vs `target.updatedAt` and overwrite the older one.
- **Pros**: Easiest to implement.
- **Cons**: Violates the core invariant. Silently destroys legitimate user edits if they happened to occur earlier than the other side.

## Recommended Strategy
**Strategy A — Target Authoritative (Fork on Conflict)**
It is the absolute smallest architecture that guarantees zero silent data loss. Instead of attempting a flawed programmatic merge, if both copies are independently edited, we preserve both in the target workspace (with the losing copy duplicated via a new ID). The user can manually reconcile them. 

## Move Journal Changes Required
None required for Strategy A. The journal already contains `entityId`, `targetWorkspaceId`, and `timestamp`.

## Notification Strategy
If we fork (Strategy A): 
- The Target retains its native `notificationIds`. 
- The Source (Conflict Fork) must have its `notificationIds` explicitly stripped so the `NotificationReconciler` generates fresh OS triggers for the new entity ID. 
- *Crucially*, the old Source OS notifications must be cancelled using the native API *before* the IDs are stripped, or handed to a durable cancellation queue if the API is unavailable during reconciliation.

## Crash State Machine
1. **Crash before target write**: Idempotent. Re-runs safely.
2. **Crash after target write (but before source delete)**: Idempotent. Re-runs safely.
3. **Crash after source delete (but before journal removal)**: The target is already updated, source is gone. Safe.
4. **Crash after conflict preservation (Forking)**: Handled by ensuring the fork generation is deterministic or part of the `multiSet` atomic block. 
5. **Crash before journal removal**: Next run finds no source data, acts as a no-op, and removes the journal.

## Migration Risk
Low. Strategy A does not require altering existing persisted schemas or existing journal entries.

## Storage Cost
Very low. Only incurs storage cost in the rare event of a split-brain conflict, at which point an extra entity is temporarily stored.

## Backup Compatibility
Fully compatible. The forked entity is just a standard entity.

## Required Tests
1. Source-only edit survives (Case B)
2. Target-only edit survives (Case C)
3. Both-side edit results in Entity Forking (Case D)
4. Forked entity receives new ID and stripped notificationIds
5. Native OS notification cancellation is explicitly called for replaced/forked entities
6. Crash before journal removal (idempotency)
7. Array addition/deletion semantics (ensuring forking circumvents the need for blind unions)

## Confirmed P0 Risks
None.

## Confirmed P1 Risks
1. **Semantic Data Loss**: Current logic corrupts primitives into strings.
2. **Zombie Notifications**: Current logic strips IDs without cancelling native notifications.
3. **Resurrected Deletions**: Naive array unions ignore deletion intent.

## Confirmed P2 Risks
1. **Un-atomic Journal Removal**: `multiSet` and `removeOperation` are not a single transaction.

## Final Recommendation
**Implement Strategy A (Conflict Forking).**
It is the only strategy that absolutely guarantees no legitimate user edits are silently destroyed, requires no schema migrations, and avoids the mathematical impossibility of merging arrays without a base snapshot. It also simplifies notification management by treating the conflict as a distinct entity.


