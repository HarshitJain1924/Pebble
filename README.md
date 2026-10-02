# Pebble

Pebble is a local-first productivity app built with Expo SDK 54, React Native, Expo Router, and TypeScript.

It brings together:
- task planning
- habit tracking
- checklists
- resources
- scheduling and reminders
- focus workflows
- local-first capture

Pebble's philosophy is based on small actions accumulating into meaningful progress.

## Where to Look

This README is orientation only. It is **not** implementation truth.

For engineering work:
1. Read the active code.
2. Read `docs/current_state.md` and `docs/integrity_status.md` when architecture/integrity matters.
3. Read active decisions/ADRs under `docs/architecture/`.
4. Read the relevant `.agents/skills/` skill for specialized guidance.
5. Treat `docs/archive/` as historical only.

For AI sessions, see `AI_CONTEXT.md`.

## Product Domains

### Today
Day-focused execution.

### Workspaces
Organization of tasks, habits, checklists, and resources.

### Tasks
One-off actionable items with the behavior implemented by the current code.

### Habits
Recurring activities with completion history and streak behavior.

### Checklists
Independent checkable-list entities.

### Resources
Passive reference material such as links, notes, images, or files.

### Calendar / Schedule
Calendar placement is driven by an item's schedule. Reminder behavior is separate and drives notifications.

### Focus
Focus/timer workflows connected to productivity progress.

### Capture
Local-first natural-language capture. The active implementation is authoritative for parser behavior and capture UI.

### Cairn
Pebble's companion/mascot. See `docs/cairn_voice_guide.md`.

## Architecture

The repository is organized broadly as:

- `/app/` — Expo Router screens/routes
- `/features/` — vertical feature slices
- `/services/command/` — mutation orchestration and command handlers
- `/repositories/` — persistence/data-access boundaries
- `/shared/` — shared types, theme, UI, and utilities
- `/docs/` — architecture, decisions, integrity records, and historical material

Pebble is local-first and uses AsyncStorage. Exact storage keys are defined by the active storage implementation.

## Development

```bash
npm install
npx expo start
npx tsc --noEmit
npm test
```

## Legacy Documentation

Some historical documents and compatibility code may contain older terms. Do not treat those terms as current product requirements.

Historical material should live under `docs/archive/` where possible.
