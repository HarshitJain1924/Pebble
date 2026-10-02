---
name: mobile-product-critique
description: Mobile product design critique. Reviews information hierarchy, visual rhythm, cognitive load, interaction cost, and checks for generic design patterns without generating code.
---

# Mobile Product Critique Guide

This skill is designed strictly for critique. It is prohibited from generating code or building UI. Its purpose is to evaluate existing or proposed screens and explain *why* they do or do not feel premium, indicating areas of design debt, cognitive load, and generic patterns.

> **Pebble Scope & Authority Note:** These are critique heuristics. They do **not** override Pebble-specific implementation truth in `shared/constants/*`, `.agents/skills/pebble-design`, or `.agents/skills/design-tokens`.
> - **Pebble Identity**: Pebble is defined by its Pine accent (`#358366`), Outfit typography, 4px spacing scale, tactile `PressableScale` (0.97 + haptics), calm tonal surfaces, and Cairn mascot companion. Do not instruct combining Things, Linear, Apple Reminders, Arc, Nintendo into a derivative collage.
> - **Hero Rule**: The "1 Hero, 3 Supporting" rule is strictly an **optional heuristic for overview surfaces** (such as Today). **Never force a hero component onto functional screens** (workspaces, task lists, calendar timeline, forms, detail screens, planners). Do not turn every screen into a dashboard.
> - **Card Usage**: Cards are a surface primitive, not the default layout primitive. Prefer flat lists, rows, sections, whitespace, dividers, tabs, and tonal grouping. Never nest cards. Never wrap every piece of information in its own card.
> - **Checklist Definition**: Checklist is an independent collection of checkable items. It is not a task with subtasks.

---

## Evaluation Criteria

> **2026 Modern Mobile Lens:** Judge against Pebble's target stance in `.agents/skills/pebble-design` §10: calm intentional hierarchy, content-first surfaces, purposeful whitespace, progressive disclosure, meaningful motion, restraint with blur/gradients, and excellent empty/loading/error states.
> **Anti-Pattern Warning:** Do NOT equate "modern" with glassmorphism everywhere, gradients everywhere, giant hero cards, excessive rounded cards, bento/dashboard grids, floating action buttons everywhere, excessive pills, decorative badges, or generic SaaS dashboard aesthetics.

Evaluate screens against these 9 dimensions:

### 1. Information Hierarchy & Surface Appropriateness
*   *Check*: Is the primary intent or reading order immediately clear? If an overview surface (Today), does it have a clear anchor? If a functional screen (workspace, task list, calendar, form), does it avoid forcing unnecessary hero cards or dashboard widgets?
*   *Critique Pattern*: Point out when multiple elements compete for dominant attention, when a functional list is crowded by an artificial hero card, or when headings, sub-headings, and body copy share similar weights causing visual flatness.

### 2. Spacing and Visual Rhythm
*   *Check*: Do elements group together naturally? Is there an established grid/spacing system (4px/8px baseline using `Spacing.*`)?
*   *Critique Pattern*: Highlight when spacing is uniform across unrelated elements, which destroys spatial hierarchy, or when containers have insufficient internal padding.

### 3. Typography Hierarchy
*   *Check*: Are fonts sized and weighted with clear contrast using Outfit scale steps (`Typography.sizes`, `Typography.weights`)? Is text rendered via `AppText` with high readability on dark/light surfaces?
*   *Critique Pattern*: Critique the use of plain sans-serif fonts without weight contrast, or when labels are too large and compete with core headers.

### 4. Interaction Cost
*   *Check*: How many taps, swipes, or scrolls does it take to perform common actions? 
*   *Critique Pattern*: Call out designs that require unnecessary navigation steps, complex gestures, or multiple sub-menus. Favor inline actions, contextual bottom sheets, and the radial Pebble dial.

### 5. Cognitive Load & Surface Primitives
*   *Check*: Is the user overwhelmed by too many elements or cards on screen?
*   *Critique Pattern*: Flag nested cards, card-wrapping of individual list rows ("card soup"), repeating sections, cluttered borders, and crowded widgets. Explain how flat rows, dividers, and whitespace communicate hierarchy with lower cognitive load.

### 6. Accessibility (A11y) & Touch Ergonomics
*   *Check*: Is color contrast sufficient (WCAG AA)? Are touch targets large enough (minimum 44×44 points)?
*   *Critique Pattern*: Flag low-contrast text on translucent overlays or tiny tap targets without proper `hitSlop`.

### 7. Platform Consistency & Mobile Ergonomics
*   *Check*: Does the design feel like a native mobile app (iOS/Android) rather than a desktop website scaled down? Are primary controls reachable in the thumb zone?
*   *Critique Pattern*: Point out heavy browser-like scrollbars, non-native select dropdown lists, or desktop-centric hover card states.

### 8. Design Debt & Token Authority
*   *Check*: Does the screen reuse existing design patterns and theme tokens from `shared/constants/*`, or does it introduce ad-hoc styles or invented tokens?
*   *Critique Pattern*: Critique layouts that introduce custom hex colors, invented spacing, arbitrary border radii, or button shapes that break consistency with Pebble's design system.

### 9. The "Generic Dashboard" Trap
*   *Check*: Does the screen look like a generic corporate template, bento box, or bootstrap theme?
*   *Critique Pattern*: Explain *why* the layout looks generic (e.g., "It relies on standard borders, uniform padding, and a bento grid of boxes, lacking Pebble's calm tonal surfaces, Pine accents, and tactile interaction").

---

## Critique Output Format

Your critique must be structured as follows:

1.  **Overview**: A 2-sentence summary of the screen's main usability and design challenges.
2.  **Structural Breakdown**: Evaluation of surface structure (cards vs. flat rows, hierarchy, nesting check).
3.  **Detailed Assessment Table**:
    | Dimension | Critique | Severity (High/Med/Low) |
    | :--- | :--- | :--- |
    | *Hierarchy* | Description of issue and why it fails... | High |
    | *Spacing* | Description... | Med |
4.  **Pebble Identity Alignment**: Specific recommendations to align with Pebble's calm, tactile 2026 identity (Pine accent, Outfit typography, tonal layering, tactile feedback).

