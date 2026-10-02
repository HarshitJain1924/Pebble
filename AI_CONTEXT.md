# AI Context: Pebble

This file is a **navigation map for AI sessions**, not a second implementation specification.

## 0. Truth Hierarchy

When information conflicts:

1. Active source code in the checked-out branch.
2. `docs/current_state.md` and `docs/integrity_status.md`.
3. Active ADRs/decisions under `docs/architecture/`.
4. Relevant `.agents/skills/`.
5. This file.
6. `PRD.md` and `README.md` for product intent only.
7. `docs/archive/` for historical context only.

Do not infer current behavior from historical prose when code can answer it.

## 1. Product Model

Pebble is a local-first productivity app using Expo SDK 54, React Native, Expo Router, TypeScript, and AsyncStorage.

Canonical domains:
- **Workspace** — organizational container.
- **Task** — one-off actionable item.
- **Habit** — recurring item with completion history/streaks.
- **Checklist** — independent checkable-list entity.
- **Resource** — passive reference material.
- **Today** — day-focused execution surface.
- **Calendar / Schedule** — scheduled placement.
- **Reminders** — notification behavior separate from schedule.
- **Focus** — focused timer/workflow.
- **Cairn** — Pebble's mascot/companion.

Do not resurrect `Vault`, `Collections`, `TodoList`, `TaskList`, or XP-era terminology in new work.

## 2. Architecture Map

- `/app/` — Expo Router screens/routes.
- `/features/` — vertical feature slices.
- `/services/command/` — mutation orchestration and command handlers.
- `/repositories/` — persistence/data-access boundaries.
- `/shared/` — shared types, theme, UI, and utilities.
- `/docs/` — architecture, decisions, integrity records, and historical material.

Exact persistence ownership/storage keys are defined by the active storage implementation.

Complex mutations belong in command handlers; repositories remain data-access boundaries.

## 3. Important Invariants

- Entity creation flows through `CaptureService`.
- `EntityFactory` remains pure.
- RMW command operations respect the established mutex/`*Unlocked` pattern.
- **Schedule placement and reminder notification semantics are separate.**
- Do not use a reminder timestamp as a substitute for a schedule timestamp.
- Do not introduce direct UI AsyncStorage access where an existing repository/service boundary exists.
- Treat `docs/integrity_status.md` as the current list of open integrity concerns.

## 4. UI Guidance

For UI work:
- Inspect the actual screen/component first.
- Preserve established information architecture unless explicitly asked to change it.
- Use existing Pebble theme/tokens/components.
- `pebble-design` and `design-tokens` are supporting guidance, not authority over code.
- Other skills are specialist lenses, not product truth.
- Do not invent sections, badges, navigation patterns, domain concepts, or product terminology unsupported by current code or an explicit request.

## 5. Verification

For engineering changes:
- Run `npx tsc --noEmit`.
- Run relevant tests.
- For architecture/integrity changes, consult the current integrity documentation.
