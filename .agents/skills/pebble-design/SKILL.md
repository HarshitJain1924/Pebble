---
name: pebble-design
description: Pebble's visual language, composition, hierarchy, and surface philosophy. Defines execution vs organization, card nesting limits, typography hierarchy, screen flow, anti-patterns, and Cairn presentation boundaries.
---

# Pebble Design Constitution & Surface Philosophy

> **Truth as of 2026-10-02.** Verified against active UI code (`app/`, `features/`, `shared/components/`). If the code has changed since, the code wins.

This skill governs Pebble's visual language, screen composition, hierarchy, and surface philosophy. It establishes the design constitution for all user-facing surfaces.

> **Authority note:** Active code and token constants in `shared/constants/*` outrank this document. When this skill and the implementation disagree, inspect `app/`, `features/`, and `shared/constants/*`, then update this document. Code wins over documentation.

---

## 1. Skill Contract & Deterministic Activation

* **Activates When**: Planning, modifying, or evaluating Pebble screens, layouts, component arrangements, visual hierarchy, or surface transitions.
* **Responsible For**:
  - Pebble visual identity and aesthetic stance.
  - Surface elevation model (Levels 0–3) and card usage constraints.
  - Execution vs. organization domain boundaries.
  - Screen-specific hierarchy guidelines (Hero heuristic vs. functional screens).
  - Component selection rules (`AppCard`, `AppText`, `EmptyState`, `PressableScale`).
  - Negative constraints and anti-pattern enforcement.
* **Must NOT Do**:
  - Does NOT define raw token values (defer strictly to `design-tokens` and `shared/constants/*`).
  - Does NOT define motion implementation physics (defer to `emil-design-eng`).
  - Does NOT manage domain mutations, repository locking, or storage keys (defer to `docs/current_state.md`).
  - Does NOT generate design critique reports (defer to `mobile-product-critique`).
* **Authority Hierarchy**:
  1. Active source code & `shared/constants/*` (Absolute truth)
  2. `pebble-design` (Visual constitution)
  3. `design-tokens` (Token definitions)
  4. `emil-design-eng` (Interaction craft)
  5. Critique & review skills (`mobile-product-critique`, `world-class-product-review`)

---

## 2. The Pebble Identity (Not a Derivative Collage)

Pebble is a calm, tactile 2026 mobile app. While products like Things 3, Linear, or Apple Reminders serve as quality benchmarks for craft and execution discipline, **Pebble is not a visual collage of other apps**.

Define Pebble's identity through:
* **Pine Accent**: Grounded botanical green primary (`Colors[scheme].primary`: dark `#358366`, light `#2C6C54`; `Colors[scheme].primaryLight`: `#44A782` / `#358366`). Calm, organic energy without neon saturation.
* **Outfit Typography**: Modern typography via `AppText` (`shared/components/ui/AppText.tsx`) mapped to `Typography.sizes` and `Typography.weights` (`shared/constants/typography.ts`).
* **Spacing Rhythm**: Disciplined 4px baseline scale (`Spacing.xs` through `Spacing.ux` in `shared/constants/spacing.ts`).
* **Tactile Feedback**: Tactile touch acknowledgement via `PressableScale` (`scale(0.97)` on press, light haptics, minimum 44×44pt touch targets).
* **Calm Tonal Surfaces**: Depth achieved through tonal layering (`Colors[scheme].background`, `Colors[scheme].card`, `Colors[scheme].cardLight`) and subtle borders, rather than arbitrary dropshadows or gratuitous glassmorphism.
* **Workspace/Category Hues**: Semantic accents anchored in `shared/constants/categoryColors.ts` to identify workspaces and domain areas.
* **Cairn Personality**: A calm crow companion docked beside the navigation dial (`docs/cairn_voice_guide.md`). Cairn observes progress at natural edges of activity without judging, nagging, or high-pressure gamification.
* **Purposeful Motion**: Physical springs for gestures/presses/sheets, snappy timings (<200ms) for opacity fades, and strict adherence to `useReducedMotion()`.
* **Clear Information Hierarchy**: Content-first, uncluttered layouts where the primary focus is unmistakable and secondary details disclose progressively.

---

## 3. Product Vocabulary & Domain Boundaries

### 3.1 Canonical Terminology
* **Today (Execution)**: The day's execution stream — a workspace-grouped list of today's work, not an organizational browser.
* **Workspace (Organization)**: Primary container for managing tasks, habits, checklists, and resources. Exposes these four domains as peer tabs.
* **Task (Execution)**: A one-off actionable item (`todo` or `completed`).
* **Habit (Consistency)**: A recurring item tracked via completion history and streaks.
* **Checklist (Independent Checkable List)**: An independent collection of checkable items. **It is not a task with subtasks.**
* **Resource (Knowledge Base)**: Passive reference items (notes, links, ideas, attachments) saved inside a workspace.
* **Schedule (Calendar Placement)**: Dedicated temporal view for placing and adjusting items across day/week/month blocks.
* **Reminder (Notification Only)**: Local notification trigger (`triggerAt` epoch ms), not a separate domain entity or execution task.
* **Focus (Focused Work/Timer)**: Session cockpit (Pomodoro and stopwatch) with ambient sound and linked task/habit.
* **Gamification (Progress)**: Collects Pebbles (capped at 15/day globally) and derives Gems (45:1 spendable currency for streak recovery).
* **Cairn (Companion)**: Pebble's mascot crow—warm, quiet observer. Presentation/companion layer only; never intrudes on domain logic.

### 3.2 Terminology Boundaries
* **Current (Use in UI and discussions)**: `Workspace`, `Task`, `Habit`, `Checklist`, `Resource`, `Schedule`, `Reminder`, `Focus`, `Pebble`, `Gem`, `Cairn`.
* **Internal Compatibility Only (Never surface to users)**: `folderId` / `activeFolderId` (storage/code alias for `workspaceId`), `collections`, `stateTodos`.
* **Archived / Obsolete (Strictly forbidden — NEVER reintroduce)**: ❌ `Vault`, `Collections` as a product concept, `TodoList` / `TaskList`, `subtasks`, `nested folders`, `sidebar navigation`, `mandatory glassmorphism`, `XP`.

---

## 4. Surface Discipline: Cards, Lists, and Hierarchy

### 4.1 Card Usage (Surface Primitive, NOT Default Layout Primitive)
* **Cards are a surface primitive, not the default layout primitive.**
* Prefer flat lists, rows, sections, whitespace, dividers, tabs, and tonal grouping when they communicate hierarchy better.
* **Never nest cards inside cards.** Surfaces remain flat at Level 1.
* **Never wrap every individual row in a card.** Do not create "card soup."
* Card styling: Standard cards use `Radius.lg` (16) or `Radius.xl` (20 for `AppCard`), padding `Spacing.lg` (16) internally, and 1px borders (`borderWidth: 1`).

### 4.2 The Hero Rule (Overview Heuristic Only)
The **"1 Hero, 3 Supporting"** guideline is an **optional heuristic strictly for overview surfaces** (such as Today):
* **1 Hero (Optional for Overview)**: Single dominant focus element (e.g., Next Action card or Pebble Jar drop).
* **Up to 3 Supporting**: Secondary layout elements (e.g., Workspace preview drawer, quick filters).
* **Everything Else Fades**: Low contrast, smaller typography, or placed in contextual sub-sheets.

#### Functional Surface Rule (CRITICAL)
* **Never force a hero component onto functional screens.**
* Never force a hero onto:
  1. **Workspace**
  2. **Task lists**
  3. **Habit lists**
  4. **Checklists**
  5. **Resources**
  6. **Calendar/timeline**
  7. **Forms**
  8. **Detail screens**
  9. **Planners**
  10. **Settings**
* **Do not turn every screen into a dashboard.** Functional screens prioritize efficiency, scannability, and direct manipulation over large decorative cards.

### 4.3 Surface Elevation Tiers
* **Level 0 (Canvas)**: Deepest foundation background (`Colors[scheme].background`). Clean, calm void.
* **Level 1 (Surface)**: Standard content containers (`Colors[scheme].card`). 1px solid low-opacity border.
* **Level 2 (Modal / Sheet)**: Floating interaction cards or bottom sheets (`@gorhom/bottom-sheet`). Elevated with `Shadows.soft`.
* **Level 3 (Temporary Overlays)**: Tooltips, alerts, menus, toast notifications. High contrast, sharp borders.

---

## 5. Screen Flows & Navigation Architecture

Pebble uses a **radial navigation dial** (`PebbleRadialTabBar`) with five sectors:
1. **Today** (`app/(tabs)/index.tsx`): Workspace-grouped execution stream. Previews at most 5 items per workspace before a "+N more" gateway.
2. **Workspaces** (`app/(tabs)/tasks.tsx`): Workspace grid and per-workspace peer domain tabs (Tasks, Habits, Checklists, Resources).
3. **Quick Capture** (center sector): Opens the `UnifiedCapture` bottom sheet. No floating action button (FAB).
4. **Schedule** (`app/(tabs)/calendar.tsx`): Day/week/month planner with drag-to-reschedule.
5. **Focus** (`app/(tabs)/focus.tsx`): Pomodoro and stopwatch session cockpit.

Navigation Heuristics:
* **One Tap > Two Taps**: Direct pathways for frequent operations.
* **Reveal > Navigate**: Prefer inline reveals or contextual bottom sheets (`@gorhom/bottom-sheet`) over navigating to a full screen for minor actions.
* **Preview > Modal**: Show inline summaries or previews before popping full modals.
* **Inline Edit > Full Screen**: Allow inline renaming and toggles instead of opening separate forms.

---

## 6. Interaction & Motion Heuristics (Guiding Principles)

*Motion implementation details are governed by `emil-design-eng`. The core product heuristics are:*
* **Intent-Driven Motion**: Animate interaction when motion communicates state, physicality, or spatial continuity. Avoid animation when it adds latency, delay, or noise.
* **Tactile Press Heuristic**: Prefer Pebble's `PressableScale` for tactile press feedback (`scale(0.97)` + light haptics) when the interaction benefits from explicit touch acknowledgement. Do not force it onto every static control.
* **Segmented Controls**: A shared sliding indicator can be used when it improves spatial continuity and matches the existing component; avoid jarring individual tab flashes.
* **Haptic Restraint**: Use restrained haptic feedback (`Haptics.ImpactFeedbackStyle.Light`) for meaningful tactile events (completing tasks, opening dial, sheet snapping); avoid haptics for high-frequency typing or scrolling.
* **Reduced Motion**: Always honor `useReducedMotion()` (`shared/hooks/useReducedMotion.ts`) for non-essential animations.

---

## 7. Modern 2026 Mobile Stance

### What Modern 2026 Design IS:
* **Calm, intentional hierarchy**: Clear focal action per surface; supporting content fades in weight, not in clarity.
* **Content-first interfaces**: Typography, spacing, and workspace hues carry identity; unnecessary decoration is stripped.
* **Strong typography and spacing**: Strict adherence to Outfit weights and the 4px spacing scale.
* **Restrained visual effects**: Tonal layering and soft shadows; blur/translucency (`expo-blur`) is used **only** when it measurably improves depth/contrast and stays performant.
* **Native mobile ergonomics**: Bottom-reachable controls, thumb-zone alignment, safe area compliance, and gesture-driven interaction.
* **Accessibility**: Legible WCAG AA contrast, 44×44pt minimum hit targets.
* **First-class zero-states**: Meaningful empty states via `EmptyState` (`shared/components/ui/EmptyState.tsx`) with contextual Cairn illustrations.

### Anti-Patterns to Avoid (What Modern 2026 is NOT):
* ❌ **Glassmorphism everywhere**: Never make frosted glass the default background or card style.
* ❌ **Gradients everywhere**: Avoid rainbow, aurora, or high-saturation gradient meshes.
* ❌ **Giant hero cards on functional screens**: No hero cards on task lists, calendars, or detail views.
* ❌ **Excessive rounded cards**: Avoid border radii exceeding `Radius.xl`.
* ❌ **Bento / dashboard grids**: Competing grids of unequal metric boxes designed for desktop, not mobile.
* ❌ **Generic corporate SaaS dashboards**: Stiff KPI boxes with tiny labels and giant numbers.
* ❌ **Excessive pills & decorative badges**: Avoid floating pills for standard actions or empty dots with no count.
* ❌ **Floating action buttons (FABs) everywhere**: Capture lives in the central dial sector; do not add ad-hoc FABs.
* ❌ **Card-wrapped-everything ("card soup")**: Wrapping every individual row in its own card.
* ❌ **Derivative collage**: Combining Things, Linear, Apple, Arc into a visual Frankenstein.

---

## 8. Agent Behavior Protocol

When working on Pebble UI or design, future agents MUST follow this protocol:

1. **Inspect the existing screen first**: Read existing components, layout, and props before proposing changes.
2. **Identify the screen's actual job**: Determine if the surface is an execution stream (Today), organizational container (Workspace), temporal planner (Schedule), session cockpit (Focus), or detail view.
3. **Identify what already works**: Preserve working interaction patterns, gestures, hooks, state listeners, and accessible structures.
4. **Identify the real UX/design problem**: Pinpoint the specific layout, contrast, cognitive load, or hierarchy flaw before altering structure.
5. **Reuse existing primitives**: Use established components (`AppCard`, `AppText`, `PressableScale`, `EmptyState`, `AppHeader`) and tokens from `shared/constants/*`.
6. **Propose the smallest coherent change**: Deliver surgical, production-ready changes. Evolution over revolution.
7. **Avoid speculative redesigns**: Do not rebuild working surfaces based on generic AI dashboard tropes.
8. **Avoid inventing product concepts**: Stick strictly to Pebble's current domain concepts.
9. **Avoid changing unrelated screens**: Confine modifications strictly to the requested scope.
10. **Verify the implementation after changes**: Always verify TypeScript compilation (`npx tsc --noEmit`) and relevant tests.
