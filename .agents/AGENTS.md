# Pebble Development and Engineering Guidelines

> **Truth as of 2026-10-02.** Verified against the active codebase on this date. If the code has changed since, the code wins — update this document instead of trusting the date.

This document establishes the project rules, workflow, and engineering guardrails for Pebble.

---

## 0. Source of Truth & Design Guidance Hierarchy

When documentation conflicts with active code, **code wins**. Inspect the
implementation and update the documentation; never invent a compromise. Evidence
order (strongest first):

1. Active source code and runtime/tests (`app/`, `features/`, `services/`, `repositories/`, `shared/`)
2. Actual design tokens/components (`shared/constants/*`, `shared/components/*`)
3. Active architecture decisions (`docs/architecture/*.md`)
4. Current-state docs (`docs/current_state.md`, `docs/integrity_status.md`, `AI_CONTEXT.md`)
5. AI context (`AGENTS.md`, `.agents/AGENTS.md`, `.agents/skills/*`)
6. README / PRD
7. Historical/archive (`docs/archive/**`) — context only, never current state

### Design System & Guidance Hierarchy
All skills and agents must respect this strict authority sequence:
1. `shared/constants/*` + active component implementations are the **absolute styling authority**.
2. `pebble-design` defines Pebble's visual and product philosophy.
3. `design-tokens` describes actual available visual primitives.
4. `emil-design-eng` provides interaction, motion, and craft guidance (translated to React Native / Reanimated).
5. Critique and review skills (`mobile-product-critique`, `world-class-product-review`) evaluate against the above.
6. Generic UI/UX references (`ui-ux-pro-max`, `react-native-developer`) must **never** override Pebble-specific rules or leak web/dashboard patterns into Pebble.

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

* **Domain Boundaries (Execution vs. Organization vs. Temporal vs. Notification vs. Timer)**:
  * **Today is Execution**: Renders a workspace-grouped stream (one drawer per workspace) where each workspace previews at most 5 items (`PREVIEW_LIMIT`) with a "+N more" gateway, plus a capped resource strip. Keep it flat: never turn Today into a nested workspace/file browser.
  * **Workspaces are Organization**: The primary organizational container. Each workspace exposes four peer domain tabs: **Tasks, Habits, Checklists, Resources** (never nested folders or "collections").
  * **Schedule is Calendar Placement**: Dedicated time planning (day/week/month planner with drag-to-reschedule).
  * **Reminder is Notification Only**: A scheduled OS notification trigger (`triggerAt` epoch ms), not a separate domain entity or execution task.
  * **Focus is Focused Work/Timer**: A Pomodoro/stopwatch cockpit with linked task/habit and ambient audio.
* **Checklist Canonical Definition**: "Checklist is an independent collection of checkable items. It is not a task with subtasks."
* **Card Usage (Surface Primitive, NOT Default Layout Primitive)**:
  * Cards are a surface primitive, not the default layout primitive.
  * Prefer when appropriate: flat rows, lists, sections, tabs, whitespace, dividers, and tonal grouping.
  * **Never nest cards inside cards** (keep surfaces flat at Level 1).
  * **Never wrap every row in a card** ("card soup").
* **Hero Rule (Overview Heuristic Only)**:
  * "1 Hero, 3 Supporting" is strictly an **optional heuristic for overview surfaces** (Today).
  * **Never force a hero onto**:
    * Workspace
    * Task lists
    * Habit lists
    * Checklists
    * Resources
    * Calendar / timeline
    * Forms
    * Detail screens
    * Planners
    * Settings
  * **Do not turn every screen into a dashboard.**
* **Pebble Identity (Not a Derivative Collage)**:
  * Do not instruct agents to visually combine Things, Linear, Apple Reminders, Arc, Nintendo. Those are quality benchmarks for craft only.
  * Define identity through: **Pine accent** (`Colors[scheme].primary`, dark `#358366`, light `#2C6C54`), **Outfit typography** via `AppText`, **4px spacing scale** (`Spacing.*`), **tactile interaction** (`PressableScale` scale(0.97) with light haptics), **calm tonal surfaces**, **workspace/category color**, **Cairn personality**, **purposeful motion**, and **clear hierarchy**.
* **Modern 2026 Mobile Design Stance**:
  * *Promote*: Calm, intentional hierarchy; content-first interfaces; strong typography and spacing; restrained visual effects; tactile interaction; meaningful motion; progressive disclosure; native mobile ergonomics; accessibility (WCAG AA, 44×44pt targets); excellent empty/loading/error states; responsive/adaptive layouts.
  * *Do NOT equate modern with*: Glassmorphism everywhere, gradients everywhere, giant hero cards, excessive rounded cards, bento/dashboard grids, floating action buttons everywhere, excessive pills, decorative badges, excessive animation, generic SaaS dashboard aesthetics, card-wrapped-everything, or copying another product's visual identity.
* **Design-Token Authority**:
  * `shared/constants/*` is the absolute implementation authority (`theme.ts`, `typography.ts`, `spacing.ts`, `radii.ts`, `shadows.ts`, `rowSpec.ts`, `categoryColors.ts`).
  * **Never invent tokens.** Never invent colors, spacing, typography, radii, or motion tokens (there is no central `Motion` module; use inline Reanimated springs/timings).
  * If documentation conflicts with code, **code wins**.
  * Do not prescribe or import values that do not exist in the implementation.
* **Legacy vs. Compatibility vs. Current Terminology**:
  * *Current product concepts*: `Workspace`, `Task`, `Habit`, `Checklist`, `Resource`, `Schedule`, `Reminder`, `Focus`, `Today`, `Pebble`, `Gem`, `Cairn`.
  * *Compatibility / internal legacy names*: `folderId` / `activeFolderId` (storage/code alias for `workspaceId`), `collections`, `stateTodos`. Keep strictly internal; never surface as product concepts.
  * *Archived / obsolete concepts*: ❌ `Vault`, `Collections` as a product concept, `TodoList` / `TaskList`, `subtasks`, `nested folders`, `sidebar navigation`, `mandatory glassmorphism`, `XP`. Never reintroduce.
* **Touch Targets & Feedback**: Maintain 44×44pt minimum hit targets; use `PressableScale` (`scale(0.97)` with light haptics) for pressables. Follow `ROW_SPEC` for list rows.
* **Mascot Guardrail (Cairn)**: Refer to [docs/cairn_voice_guide.md](file:///docs/cairn_voice_guide.md). Treat as a product behavior specification, not merely a copywriting document. Keep Cairn strictly isolated from core domain logic (presentation/experience layer only); do not introduce Cairn into existing screens arbitrarily or modify domain/persistence logic for mascot presentation.

---

## 4. Code Change Protocol & Agent Behavior

Future agents must adhere to the following 10-step behavior protocol:

1. **Inspect the existing screen first**: Read existing components, layout, and props before proposing changes.
2. **Identify the screen's actual job**: Understand whether the surface is an execution stream (Today), organizational container (Workspace), temporal planner (Schedule), session cockpit (Focus), or functional detail form.
3. **Identify what already works**: Preserve working interaction patterns, gestures, hooks, state listeners, and accessible structures.
4. **Identify the real UX/design problem**: Pinpoint the actual layout, contrast, or cognitive-load issue before altering structure.
5. **Reuse existing primitives**: Use established components (`AppCard`, `AppText`, `PressableScale`, `EmptyState`, `AppHeader`) and tokens from `shared/constants/*`.
6. **Propose the smallest coherent change**: Deliver surgical, production-ready changes.
7. **Avoid speculative redesigns**: Do not rebuild working surfaces based on generic AI dashboard tropes.
8. **Avoid inventing product concepts**: Never invent tokens, domain entities, or reintroduce obsolete concepts.
9. **Avoid changing unrelated screens**: Confine modifications strictly to the requested scope.
10. **Verify the implementation after changes**: Always verify TypeScript compilation (`npx tsc --noEmit`) and relevant tests.

*Regression Checklist*:
- Existing public APIs unchanged
- No new entity creation paths bypassing `CaptureService`
- `EntityFactory` remains pure
- Repository boundaries unchanged
- No debug logging or dead code introduced