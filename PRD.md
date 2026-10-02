# Product Requirements Document — Pebble

> **Status:** Active product intent. This document is not implementation truth.
>
> For exact current behavior, read the active source code first. For architecture/integrity, use `docs/current_state.md`, `docs/integrity_status.md`, and active decisions under `docs/architecture/`.

## 1. Product

**Product:** Pebble  
**Platform:** React Native / Expo SDK 54

Pebble is a local-first productivity app for tasks, habits, checklists, resources, scheduling, reminders, focus, and lightweight capture.

The product philosophy is based on small actions accumulating into meaningful progress.

## 2. Product Principles

- **Local-first:** core user data remains usable offline.
- **Execution over administration:** organization should support action rather than become work itself.
- **Progress without pressure:** Pebbles/Cairn should encourage without becoming noisy or judgmental.
- **Clear separation of concerns:** scheduling and reminders are different concepts.
- **Progressive disclosure:** keep common actions obvious and secondary complexity contextual.
- **Accessibility:** preserve semantic states and adequate touch targets.
- **Consistency:** use existing Pebble components, theme, and domain vocabulary.
- **Evolution over reinvention:** improve established flows before replacing their information architecture.

## 3. Core Domains

### Tasks
One-off actionable items. Exact fields and behavior are defined by the active task/domain implementation.

### Habits
Recurring activities with completion history and streak behavior.

### Checklists
Independent checkable-list entities. They are not a Task-subtask architecture.

### Resources
Passive reference material associated with workspaces/entities where supported.

### Workspaces
The organizational boundary for tasks, habits, checklists, and resources.

### Today
A day-focused execution surface.

### Calendar / Schedule
Scheduled placement of entities. A schedule determines calendar placement; a reminder determines notification behavior.

### Focus
A focused timer/workflow connected to productivity progress.

### Capture
Pebble supports local-first capture. The active capture implementation is authoritative for parsing behavior, UI, supported syntax, and interaction details.

### Cairn
Pebble's companion/mascot. See `docs/cairn_voice_guide.md` for personality and behavior guidance.

## 4. Design Direction

Pebble should feel calm, personal, modern, tactile, lightweight, and intentionally crafted.

Do **not** treat glassmorphism, gradients, a FAB, a capture pill, a particular card treatment, or any other visual trend as a mandatory product-wide rule.

When redesigning UI:
1. Inspect the actual screen/component.
2. Preserve established information architecture unless explicitly asked to change it.
3. Use the current shared theme/components.
4. Avoid inventing product concepts merely to fill a layout.

## 5. Technical Direction

The application uses Expo SDK 54, React Native, Expo Router, TypeScript, AsyncStorage, Reanimated, Gesture Handler, and feature-specific libraries.

Architecture, storage keys, locking, recovery, and integrity details belong in the active code and architecture documentation rather than being duplicated here.

## 6. Agent Boundary

Agents must not use this PRD to:
- invent screens or navigation absent from the current code,
- resurrect obsolete terminology,
- override active architecture decisions,
- infer exact spacing, colors, components, or interaction behavior.

When exact behavior matters, inspect the code.
