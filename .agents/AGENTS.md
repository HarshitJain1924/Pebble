# Pebble Development and Engineering Guidelines

> **Truth as of 2026-10-02.** Verified against the active codebase on this date. If the code has changed since, the code wins — update this document instead of trusting the date.

This document establishes the project rules, workflow, and engineering guardrails for Pebble.

---

## 0. Source of Truth

When documentation conflicts with active code, **code wins**. Inspect the
implementation and update the documentation; never invent a compromise. Evidence
order (strongest first):

1. Active source code and runtime/tests
2. Actual design tokens/components (`shared/constants/*`, `shared/components/*`)
3. Active architecture decisions (`docs/architecture/*.md`)
4. Current-state docs (`docs/current_state.md`, `docs/integrity_status.md`, `AI_CONTEXT.md`)
5. AI context (`AGENTS.md`, `.agents/AGENTS.md`, `.agents/skills/*`)
6. README / PRD
7. Historical/archive (`docs/archive/**`) — context only, never current state

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
* **Expo SDK Versioning**: This project runs Expo SDK 57 (React Native 0.86, React 19.2). Read versioned docs at https://docs.expo.dev/versions/v57.0.0/ when working with Expo APIs.

---

## 3. UI & Design Guardrails

* **Execution vs. Organization**: Today is for execution, not organization. It renders a workspace-grouped stream (one drawer per workspace) where each workspace previews at most 5 items (`PREVIEW_LIMIT`) with a "+N more" gateway, plus a capped resource strip. Keep it flat: never turn Today into a nested workspace/file browser.
* **No Card Nesting**: Never nest cards inside cards (keep surfaces flat at Level 1).
* **Touch Targets & Feedback**: Maintain 44x44pt minimum hit targets; use `PressableScale` (`scale(0.97)` with light haptics) for pressables.
* **Mascot Guardrail (Cairn)**: Refer to [docs/cairn_voice_guide.md](file:///docs/cairn_voice_guide.md). Treat as a product behavior specification, not merely a copywriting document. Keep Cairn strictly isolated from core domain logic (presentation/experience layer only); do not introduce Cairn into existing screens arbitrarily or modify domain/persistence logic for mascot presentation.

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