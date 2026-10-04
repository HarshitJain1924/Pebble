# Pebble AI Agent Instructions

> **Truth as of 2026-10-02.** The facts below were verified against the active codebase on this date. If the code has changed since, the code wins — update this document instead of trusting the date.

Pebble is a local-first React Native app built on **Expo SDK 57** (React Native 0.86, React 19.2, New Architecture + React Compiler).

- **Primary Project Guidelines & Skill Activation**: Refer to [.agents/AGENTS.md](file:///.agents/AGENTS.md) for active engineering guardrails, skill taxonomy, and workflow.
- **Current Product & Architecture Map**: Refer to [AI_CONTEXT.md](file:///AI_CONTEXT.md) first, then [docs/current_state.md](file:///docs/current_state.md) and [docs/integrity_status.md](file:///docs/integrity_status.md). Architecture memory lives in [docs/architecture/decision_log.md](file:///docs/architecture/decision_log.md).
- **Design System Skills**:
  - Visual Language & Constitution: [.agents/skills/pebble-design/SKILL.md](file:///.agents/skills/pebble-design/SKILL.md)
  - Canonical Tokens: [.agents/skills/design-tokens/SKILL.md](file:///.agents/skills/design-tokens/SKILL.md)
  - Interaction & Motion Craft: [.agents/skills/emil-design-eng/SKILL.md](file:///.agents/skills/emil-design-eng/SKILL.md)
  - Design Critique: [.agents/skills/mobile-product-critique/SKILL.md](file:///.agents/skills/mobile-product-critique/SKILL.md)
  - Quality Filter (Major Redesign): [.agents/skills/world-class-product-review/SKILL.md](file:///.agents/skills/world-class-product-review/SKILL.md)
  - List & Render Optimization: [.agents/skills/react-native-performance/SKILL.md](file:///.agents/skills/react-native-performance/SKILL.md)
- **Mascot & Voice System**: Refer to [docs/cairn_voice_guide.md](file:///docs/cairn_voice_guide.md) for Cairn's product behavior specification, presence rules, and voice constraints.
- **Expo SDK 57 Documentation**: Check versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing Expo code.

## Core Design & Architecture Invariants

* **Pebble Identity**: A calm, tactile 2026 productivity app defined by its Pine accent (`#358366`), Outfit typography, 4px spacing rhythm, tactile `PressableScale` (0.97 + haptics), calm tonal surfaces, and Cairn mascot companion. Not a derivative collage of other apps.
* **Domain Model**:
  * **Today is Execution**: Workspace-grouped execution stream.
  * **Workspaces are Organization**: Primary organizational container (peer domain tabs: Tasks, Habits, Checklists, Resources).
  * **Schedule is Calendar Placement**: Time planning with drag-to-reschedule.
  * **Reminder is Notification Only**: Local trigger only (`triggerAt` epoch ms), not a domain entity.
  * **Focus is Focused Work/Timer**: Dedicated deep-work cockpit.
  * **Checklist Canonical Definition**: "Checklist is an independent collection of checkable items. It is not a task with subtasks."
* **Card & Surface Discipline**:
  * Cards are a surface primitive, not the default layout primitive. Prefer flat lists, rows, dividers, and whitespace.
  * **Never nest cards inside cards.** Never wrap every piece of information in its own card.
* **Hero Rule**: "1 Hero, 3 Supporting" is strictly an **optional heuristic for overview surfaces** (Today). Never force a hero card onto functional screens (workspaces, task lists, calendar timeline, forms, detail screens). Do not turn every screen into a dashboard.
* **Token Authority**: `shared/constants/*` is the absolute implementation authority. Never invent tokens.
* **Terminology Boundaries**:
  * Current: Workspace, Task, Habit, Checklist, Resource, Schedule, Reminder, Focus, Pebble, Gem, Cairn.
  * Internal compatibility: `folderId`, `activeFolderId`, `collections`, `stateTodos` (never surface to users).
  * Archived / obsolete: ❌ Vault, Collections as a product concept, TodoList/TaskList, subtasks, nested folders, sidebar navigation, mandatory glassmorphism, XP.
* **Agent Behavior Protocol**:
  * Inspect the existing screen before proposing a redesign.
  * Preserve working interaction patterns and accessibility.
  * Identify the actual problem before changing structure.
  * Propose the smallest coherent design change.
  * Avoid inventing product concepts or redesigning unrelated areas.
  * Use existing components/tokens and verify implementation after changes.

## Source of Truth (read this before trusting any document)

When documentation conflicts with active code, **code wins**. Do not invent a third interpretation. Inspect the implementation and update the documentation instead.

Evidence hierarchy, strongest first:

1. Active source code (`app/`, `features/`, `services/`, `repositories/`, `shared/`)
2. Runtime behavior and tests (`**/__tests__/**`)
3. Actual design tokens / components (`shared/constants/*`, `shared/components/*`)
4. Active architecture decisions (`docs/architecture/decision_log.md`, `docs/architecture/*.md`)
5. Current-state engineering docs (`docs/current_state.md`, `docs/integrity_status.md`, `AI_CONTEXT.md`)
6. AI context / instructions (`AGENTS.md`, `.agents/AGENTS.md`, `.agents/skills/*`)
7. README / PRD
8. Historical / archived material (`docs/archive/**`, old audits)

An old README or archived audit is never more authoritative than the code it describes. `docs/archive/**` is history, not current state.
