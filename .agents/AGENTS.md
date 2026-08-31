# Pebble Development and Engineering Guidelines

This document establishes the project rules, workflow, and engineering guardrails for Pebble.

---

## 1. Development Workflow

Keep the workflow direct and focused:

1. **Inspect Relevant Context**: Read `AI_CONTEXT.md` and authoritative docs (`docs/current_state.md`, `docs/integrity_status.md`).
2. **Consult Skills on Demand**: Inspect only the skill relevant to the task (e.g. `pebble-design` / `design-tokens` for UI styling, `emil-design-eng` for animation craft, `react-native-performance` for list/thread optimization). Do not require every skill for every task.
3. **Reason**: Understand existing patterns and architecture before modifying code.
4. **Implement Surgically**: Make the minimal production-ready change needed.
5. **Verify**: Run `npx tsc --noEmit` and relevant tests.

---

## 2. Core Engineering Invariants

* **CaptureService is the Single Entry Point**: All entity creation must flow through `CaptureService`. No screen, hook, or component creates tasks/habits/resources directly.
* **EntityFactory Remains Pure**: `EntityFactory` must remain pure—no side-effects, no storage writes, no notification scheduling.
* **Repository Boundaries & Locking**:
  * Repositories are pure data-access objects.
  * Mutex-protected Read-Modify-Write (RMW) operations must call `*Unlocked` repository primitives within command handlers to prevent re-entrant deadlocks.
  * Follow established lock ordering (`withLocks` / canonical lifecycle sequences in `docs/current_state.md`).
* **Expo SDK Versioning**: Read versioned docs at https://docs.expo.dev/versions/v54.0.0/ when working with Expo APIs.

---

## 3. UI & Design Guardrails

* **Execution vs. Organization**: Today is strictly for execution; keep Workspace preview cards on Today capped at 5 items with a clear "Continue" gateway.
* **No Card Nesting**: Never nest cards inside cards (keep surfaces flat at Level 1).
* **Touch Targets & Feedback**: Maintain 44x44pt minimum hit targets; use `PressableScale` (`scale(0.97)` with light haptics) for pressables.

---

## 4. Code Change Protocol

* Make the smallest possible production-ready change.
* Do not touch unrelated files or perform unrequested refactors.
* Verify TypeScript compilation (`npx tsc --noEmit`) and relevant unit tests.
* Ensure regression checklist passes:
  - Existing public APIs unchanged
  - No new entity creation paths bypassing `CaptureService`
  - `EntityFactory` remains pure
  - Repository boundaries unchanged
  - No debug logging or dead code introduced