# Pebble

Pebble is a local-first productivity app for turning daily intentions into action without making planning feel like administration.

Built with **Expo SDK 54, React Native 0.81, React 19, Expo Router, and TypeScript**.

## Current product

Pebble is organized around four primary app surfaces:

### Today
The execution surface for the current day.

Today currently brings together:
- a circadian-style header and current-focus area
- a workspace-grouped stream of today's work
- task, habit, and checklist activity
- filters and search
- overdue/carry-over context
- Zen Mode
- end-of-day review
- Pebble/Cairn progress and reward interactions

Today is about **doing**, not managing the underlying structure.

### Workspaces
The organization surface.

A workspace contains four domain areas:

- **Tasks** — one-off actionable work
- **Habits** — recurring activities and streak history
- **Checklists** — independent checkable lists
- **Resources** — passive reference material

The current workspace screen also provides date navigation, domain tabs, search, bulk selection, workspace rename/settings, archive, and moving items between workspaces.

Do not interpret internal legacy variable names such as `folder` as a separate product concept. The product concept is **Workspace**.

### Schedule
The calendar/scheduling surface.

The current calendar supports:
- day/timeline planning
- week horizon
- month overview
- scheduled all-day and timed items
- current-time indication
- filters
- drag-to-reschedule interaction
- quick planning actions for pending work
- free-time/planned-time context

**Schedule placement and reminders are separate concepts.**

An item's schedule determines where it appears on the calendar. A reminder determines notification behavior.

### Focus
The dedicated focus-session workspace.

Focus currently supports:
- focus and break modes
- Pomodoro sessions
- a timer cockpit
- linking a task or habit to the active session
- ambient sound
- music controls
- optional atmospheric/glow treatment

## Global capture

Pebble has a global **Unified Capture** entry point available from the main tab layout.

Capture is local-first and can target a workspace. The active capture implementation is the authority for parsing, creation behavior, and UI details.

Do not reintroduce the old "Quick Add", rotating-placeholder, detection-badge, or capture-pill designs unless the active code and product decisions explicitly bring them back.

## Core domain model

Pebble's active domain vocabulary is:

| Concept | Meaning |
| --- | --- |
| **Workspace** | Organizational container for related work |
| **Task** | One-off actionable item |
| **Habit** | Recurring activity with completion history |
| **Checklist** | Independent collection of checkable items |
| **Resource** | Passive reference material such as notes, links, images, or files |
| **Schedule** | Calendar placement for an item |
| **Reminder** | Notification timing; not calendar placement |
| **Today** | Execution-oriented view of current work |
| **Focus** | Active timed work/break session |
| **Cairn** | Pebble's companion/mascot and product voice |

A **Checklist is not a Task with subtasks**. Do not introduce a nested-subtask model unless the active domain model explicitly changes.

## Product principles

- **Local-first:** core productivity data works without requiring a remote backend.
- **Action over administration:** surfaces should help the user start or continue work.
- **Progress without pressure:** completion should feel visible and rewarding without adding unnecessary gamification.
- **Flat, scannable hierarchy:** avoid deep nested cards and duplicated containers.
- **Progressive disclosure:** keep secondary controls out of the primary path until needed.
- **Respect the current domain model:** do not revive retired concepts because they appear in historical code or documents.
- **Implementation beats memory:** when documentation and code disagree, inspect the active implementation before changing product behavior.

## Architecture at a glance

The repository is broadly organized as:

- `/app/` — Expo Router screens and routes
- `/features/` — feature-specific UI, hooks, and domain-facing logic
- `/services/command/` — command orchestration and domain command handlers
- `/repositories/` — persistence and data-access boundaries
- `/shared/` — domain types, theme, shared UI, hooks, and utilities
- `/docs/` — decisions, architecture/integrity records, product guidance, and historical material

Pebble is local-first and currently persists through AsyncStorage-backed repositories/services. Runtime storage keys and persistence details are defined by the active implementation.

### Important engineering boundaries

- UI should not bypass repository/service boundaries to manipulate persistence directly.
- Domain mutations go through the command/service layer.
- Scheduling and reminder behavior must remain distinct.
- Workspace terminology is canonical even where legacy source names remain.
- Active source code is the authority for behavior.

## Documentation hierarchy for AI/code work

Use these sources in this order:

1. **Active source code** — actual behavior and current UI
2. `docs/current_state.md` and `docs/integrity_status.md` — current architecture/integrity context
3. Active decisions/ADRs under `docs/architecture/`
4. Relevant `.agents/skills/` guidance
5. `AI_CONTEXT.md` — compact navigation/context map
6. `PRD.md` and this README — product orientation
7. `docs/archive/` — historical only

If two sources conflict, **do not average them or invent a compromise**. Inspect the active implementation and the relevant decision record.

## Development

Install dependencies:

```bash
npm install
```

Start Expo:

```npx expo start
```

Type-check:

```npx tsc --noEmit
```

Run tests:

```npm test
```

## Historical documentation

Pebble has gone through multiple product and architecture iterations. Older documents may mention concepts such as folders, collections, subtasks, glassmorphism-first UI, old capture flows, XP systems, or other retired designs.

Those documents are useful for history and migration context only. They are **not current product requirements** unless the active code or a current decision explicitly restores the concept.
