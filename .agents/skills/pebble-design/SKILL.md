---
name: pebble-design
description: Pebble's product and design principles. Use alongside current code and architecture docs; it does not override implementation truth.
---

# Pebble Design Constitution

This skill defines stable design principles. It is **not** a substitute for reading the current screen/component. When it conflicts with code or an active decision, follow the source-of-truth hierarchy in `.agents/AGENTS.md`.

## 1. Product Identity

Pebble should feel calm, personal, modern, tactile, lightweight, and intentionally crafted.

External products can be references for individual qualities, but they are not Pebble's information architecture or component specification.

## 2. Canonical Product Vocabulary

Use these current terms:
- **Today** — day-focused execution surface.
- **Workspace** — organizational container for tasks, habits, checklists, and resources.
- **Task** — one-off actionable item.
- **Habit** — recurring item tracked through completion history/streaks.
- **Checklist** — independent checkable-list entity.
- **Resource** — passive reference material.
- **Cairn** — Pebble's mascot/companion.

Do not introduce legacy concepts such as `Vault`, `Collections`, `TodoList`, or `TaskList` into new product/UI work.

A Checklist may contain checkable items, but it is not a Task-subtask architecture.

## 3. Product Structure

- Today is primarily for execution.
- Workspaces are for organization and management of their entities.
- Preserve current navigation and domain structure when redesigning a screen.
- Do not invent folders, nested sections, sidebars, members, or collection layers unless current code or an active decision establishes them.

### Evolution over Revolution

Before changing a screen:
1. Read the current screen implementation.
2. Identify what already works.
3. Preserve established concepts/interactions.
4. Improve hierarchy, rhythm, density, accessibility, and visual clarity before replacing information architecture.

## 4. Information Hierarchy

“1 Hero, supporting elements” is a heuristic for overview surfaces, not a universal layout rule.

Functional screens such as workspaces, planners, calendars, lists, editors, and forms may expose multiple controls and sections when necessary.

## 5. Surface & Component Principles

- Prefer flat hierarchy.
- Do not nest cards inside cards.
- Do not turn every row into a card.
- Establish hierarchy through spacing, typography, and tonal surfaces before decoration.
- Avoid generic KPI/dashboard grids on functional productivity surfaces.
- Avoid decorative badges, pills, gradients, or mascots when they communicate no useful information.

## 6. Interaction Principles

- Prefer direct actions over unnecessary navigation.
- Reveal secondary controls contextually.
- Preserve established gestures before introducing new ones.
- Use existing destructive-action confirmation patterns.
- Respect platform touch targets and accessibility semantics.
- Motion should communicate state, hierarchy, or physical response.

## 7. Styling Authority

This skill does not invent implementation tokens.

For colors, typography, spacing, radii, and motion:
1. Inspect actual implementations in `shared/constants/` and existing components.
2. Use existing semantic tokens/components where available.
3. If a needed token does not exist, propose the smallest token addition instead of silently inventing a token name.

## 8. Review Checklist

Before proposing a UI change, verify:
- Is the concept present in the current product?
- What does the current screen already solve?
- Does the proposal preserve Pebble's information architecture?
- Does it use existing Pebble styling/components?
- Does it add unnecessary cards, pills, badges, sections, or navigation?
- Does it reintroduce a legacy concept?
- Does it overlap an existing domain/feature?
