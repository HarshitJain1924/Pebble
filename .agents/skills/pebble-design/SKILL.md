---
name: pebble-design
description: Pebble's permanent product philosophy and design constitution. Defines execution vs organization, card nesting guidelines, typography rules, vocabulary, anti-patterns, and mascot integration.
---

# Pebble Design Constitution & Component System

> **Truth as of 2026-10-02.** Verified against the active UI code (`app/`, `features/`, `shared/components/`) on this date. If the code has changed since, the code wins.

This skill encodes Pebble's product philosophy and surface rules. It consolidates product philosophy, surface rendering rules, component layouts, screen flow, hierarchy logic, and motion physics.

> **Authority note:** active code and the token constants outrank this document. When this skill and the implementation disagree, inspect `app/`, `features/`, and `shared/constants/*`, then update this skill. Do not treat prose — here or in the README/PRD — as more authoritative than the code.

---

## 1. The Pebble Identity (Not a Derivative Collage)

Pebble is not a visual collage or hybrid of other products. While products like Things 3, Linear, or Apple Reminders may serve as historical quality references for craft and execution discipline, **Pebble has its own distinct visual identity**.

Define Pebble's identity through:
*   **Pine Accent**: Grounded botanical green brand primary (`Colors[scheme].primary`: dark `#358366`, light `#2C6C54`; `Colors[scheme].primaryLight`: `#44A782` / `#358366`). It provides calm organic energy without loud neon saturation.
*   **Outfit Typography**: Editorial, modern typography via `AppText` (`shared/components/ui/AppText.tsx`) mapping cleanly to `Typography` scale and weight steps (`shared/constants/typography.ts`).
*   **Spacing Rhythm**: Disciplined 4px baseline scale (`Spacing.xs` through `Spacing.ux` in `shared/constants/spacing.ts`) creating predictable breathing room.
*   **Tactile Interaction**: Physical, responsive touch states via `PressableScale` (`scale(0.97)` on press, light haptics, minimum 44×44pt touch targets).
*   **Calm Tonal Surfaces**: Depth achieved through tonal layering (`Colors[scheme].background`, `Colors[scheme].card`, `Colors[scheme].cardLight`) and subtle borders, rather than arbitrary dropshadows or gratuitous glassmorphism.
*   **Workspace/Category Color**: Purposeful semantic accents anchored in `shared/constants/categoryColors.ts` to identify workspaces and domain areas.
*   **Cairn Personality**: A calm, curious crow companion docked beside the navigation dial (`docs/cairn_voice_guide.md`). Cairn observes progress and celebrates at the natural edges of activity without judging, nagging, or creating high-pressure gamification.
*   **Purposeful Motion**: Inline Reanimated physics—springs for physical gestures/presses/translations, snappy timings (<200ms) for opacity fades, and strict adherence to `useReducedMotion()`.
*   **Clear Information Hierarchy**: Content-first, uncluttered layouts where the primary focus is unmistakable and secondary details disclose progressively.

---

## 2. Product Vocabulary

To maintain cognitive consistency, always use these exact terms and mappings:

*   **Today (Execution)**: The day's execution surface — a workspace-grouped stream of today's work, not an organizational browser.
*   **Workspace (Organization)**: The primary organizational container for managing tasks, habits, checklists, and resources. Each workspace exposes these four domains as peer tabs.
*   **Task (Execution)**: A one-off actionable item (status: `todo` or `completed`).
*   **Habit (Consistency)**: A recurring item tracked via completion history and streaks.
*   **Checklist (Independent Checkable List)**: An independent collection of checkable items. It is not a task with subtasks.
*   **Resource (Knowledge Base)**: Passive reference items (notes, links, ideas, attachments) saved inside a workspace.
*   **Schedule (Calendar Placement)**: Calendar placement and time planning (day/week/month planner with drag-to-reschedule).
*   **Reminder (Notification Only)**: Local notification trigger only (`triggerAt` epoch timestamp in ms), not a separate domain entity or execution task.
*   **Focus (Focused Work/Timer)**: Focused work session cockpit (Pomodoro and stopwatch) with ambient sound and linked task/habit.
*   **Gamification (Progress)**: The central micro-achievement tracker that visually collects Pebbles (capped at 15/day globally) and Gems (45:1 spendable currency for streak recovery).
*   **Cairn (Companion / Mascot)**: Pebble's mascot crow—a warm, curious peer who notices progress and celebrates alongside you without pressure or judgment. Authoritative specification: [docs/cairn_voice_guide.md](file:///docs/cairn_voice_guide.md).

---

## 3. Product Philosophy: Execution vs. Organization & Domain Boundaries

*   **Workspaces are Organization**: Users organize, group, categorize, and store items inside Workspaces. A Workspace owns four domains — Tasks, Habits, Checklists, Resources — not nested folders or "collections".
*   **Today is Execution**: The Today screen is for execution. It renders one drawer per workspace (a grouped stream), never a file browser or nested workspace browser. Each workspace previews at most 5 items before a "+N more" gateway.
*   **Schedule is Calendar Placement**: Dedicated temporal view for placing and adjusting items across time blocks.
*   **Reminder is Notification Only**: A scheduled OS notification trigger, never an independent productivity container.
*   **Focus is Focused Work/Timer**: A dedicated session cockpit for timed deep work.
*   **Previews, Not Screens**: Today cards are *previews* of Workspaces. They cap display lists to a maximum of **5 items** and show a remaining count.

### 3.1. Terminology Hierarchy: Current vs. Compatibility vs. Archived

Agents must strictly respect this three-tier terminology boundary:

1.  **Current Product Concepts (Always use in UI and product discussions)**:
    *   `Workspace`, `Task`, `Habit`, `Checklist`, `Resource`, `Schedule`, `Reminder`, `Focus`, `Pebble`, `Gem`, `Cairn`.
2.  **Compatibility / Internal Legacy Names (Permitted in code where required, never surface as product concepts)**:
    *   `folderId` / `activeFolderId` (storage/code compatibility alias for `workspaceId`).
    *   `collections` (internal prop/key name in legacy components).
    *   `stateTodos` (internal hook variable naming).
    *   *Rule*: Keep these strictly encapsulated within internal implementation code. Never expose them to users, UI copy, or architectural proposals.
3.  **Archived / Obsolete Concepts (Strictly forbidden — NEVER reintroduce)**:
    *   ❌ `Vault`, `Collections` as a product concept, `TodoList` / `TaskList`, `subtasks`, `nested folders`, `sidebar navigation`, `mandatory glassmorphism`, `XP`.

### 3.2. Evolution over Revolution
*   **Iterate, Don't Rewrite**: Prefer evolving an existing screen or component over replacing it entirely.
*   **Verify Success**: Always ask: *"What is already working well in the current layout?"* and preserve Pebble's personality rather than building a standard dashboard.

---

## 4. Information Hierarchy: Hero Rule & Surface Appropriateness

The **"1 Hero, 3 Supporting"** guideline is an **optional heuristic strictly for overview and summary surfaces** (such as the Today screen):
*   **1 Hero (Optional for Overview)**: The single dominant focus element (e.g., Next Action, the Pebble Jar, or an active timer).
*   **Up to 3 Supporting**: Secondary layout elements (e.g., Continue Workspace preview card, filter pills, calendar feed).
*   **Everything Else Fades**: Background indicators keep low contrast, smaller typography, or tuck into contextual sub-sheets.

### Functional Surface Rule (CRITICAL)
*   **Never force a hero component onto functional screens.**
*   Workspace views, task lists, calendar timelines, forms, detail screens, settings, and planners should use the layout and hierarchy appropriate to their specific task.
*   **Do not turn every screen into a dashboard.** Functional screens prioritize efficiency, scannability, and direct manipulation over large decorative cards.

---

## 5. Screen Flow & Navigation

Pebble does not exist as isolated screens. Optimize navigation layouts to reflect these core user flows:
*   *Task Execution*: `Today → open workspace (or see-all) → Task Details → Back`
*   *Routine Completion*: `Today → Focus Session → Complete Task → Pebble Jar Drop`
*   *Setup*: `Workspaces → open/create a workspace → add Tasks/Habits/Checklists/Resources → Return`
*   *Navigation*: The radial Pebble dial (Today · Workspaces · Quick Capture · Schedule · Focus) is the only top-level surface switcher. There is no bottom tab bar, no floating action button (FAB), and no sidebar.

---

## 6. Surface Hierarchy & Depth

Pebble's elevation system uses tonal layering to create physical depth without visual clutter. (For exact values, consult the **design-tokens** skill and `shared/constants/*`).

*   **Level 0 (Canvas)**: Deepest foundation background (`Colors[scheme].background`). Clean, calm void.
*   **Level 1 (Surface)**: Standard content surfaces (`Colors[scheme].card`). Uses a 1px solid low-opacity border to define bounds.
*   **Level 2 (Modal / Sheet)**: Floating interaction cards or bottom sheets (`@gorhom/bottom-sheet`). Elevated above surfaces with a soft, tinted ambient shadow (`Shadows.soft`).
*   **Level 3 (Temporary Overlays)**: Tooltips, alerts, dropdown menus, and toast notifications. High contrast, sharp borders, and subtle contextual backdrops.

---

## 7. Component System Blueprints & Surface Primitives

All component styling parameters (colors, spacing margins, fonts, radii) must be retrieved from `shared/constants/*` rather than being hardcoded or invented.

### Cards (Surface Primitive, NOT Default Layout Primitive)
*   **Cards are a surface primitive, not the default layout primitive.**
*   Prefer flat lists, rows, sections, whitespace, dividers, tabs, and tonal grouping when they communicate hierarchy better.
*   **Never nest cards inside cards.** Surfaces remain flat at Level 1.
*   **Never wrap every individual piece of information in its own card.** Do not create "card soup."
*   *Specs*: Standard cards use `Radius.lg` (16) or `Radius.xl` (20 for `AppCard`), padding `Spacing.lg` (16) internally, and hairline borders (`borderWidth: 1`).

### Lists & Checklists
*   *Row Specs*: Follow `ROW_SPEC` (`shared/constants/rowSpec.ts`). Minimum 44pt touch targets (`ROW_SPEC.listRow.minHeight`). Borderless rows separated by faint spacing or hairline dividers (`ROW_SPEC.dividerInset: 52`).
*   *Checklists*: **Checklist is an independent collection of checkable items. It is not a task with subtasks.** Checkboxes feature a 24pt visual ring with an effective 44pt hit area. Rows show clear visual hierarchy and state changes upon completion.

### Buttons & Segments
*   *Buttons*: Primary buttons are solid color rounded pills (`Radius.pill: 9999`). Secondary buttons are ghost styled (faint border, transparent background). Active states scale to `0.97` on press with light haptics via `PressableScale`.
*   *Segmented Controls*: Options wrapped in a container. Active state utilizes a sliding indicator animated with a spring.

### Empty, Loading & Error States
*   *Empty States*: Every list, tab, and stream must have a designed zero-state using `EmptyState` (`shared/components/ui/EmptyState.tsx`). Centered layout, generous whitespace, appropriate Cairn mascot variant (`idle`, `sleeping`, `focus`, `peek`), concise explanatory messaging, and an immediate action trigger.
*   *Loading & Error States*: Avoid jarring full-screen spinners; use localized skeletons or subtle progress rings. Present clear, actionable error recovery prompts.

---

## 8. Motion Defaults & Physics

**There are NO central `Motion` or `spring.tactile` token objects in Pebble.** Do not invent motion token imports. Motion is authored inline using React Native Reanimated:

*   **Springs for Translation, Scale & Gestures**: Use `withSpring` for gestural drags, presses, sheet snapping, and scale changes:
    *   *Press feedback*: Use `PressableScale` (defaults to `{ damping: 12, stiffness: 200 }` scaling to `0.97`).
    *   *Layout/Navigation springs*: E.g., dial open uses `withSpring(1, { damping: 17, stiffness: 220, mass: 0.65 })`.
*   **Timings for Opacity & Color**: Use `withTiming` under **200ms** with responsive out-easing for opacity fades, cross-fades, and color transitions.
*   **Reduced Motion**: Always honor `useReducedMotion()` (`shared/hooks/useReducedMotion.ts`) for ambient loops or non-essential animation.
*   **Thread Safety**: Route JS state mutations and callbacks out of worklets using `runOnJS()`.

---

## 9. Interaction Principles

*   **One Tap > Two Taps**: Design shortcuts and primary actions to be reachable in a single tap. Reduce nested path lengths.
*   **Reveal > Navigate**: Reveal inline sub-rows or present contextual bottom sheets rather than navigating to a brand new screen for minor actions.
*   **Preview > Modal**: Show inline summaries or previews before popping up a fullscreen modal.
*   **Inline Edit > Full Screen**: Allow inline renaming or state toggles instead of opening a complex form screen.
*   **Progressive Disclosure**: Keep basic interfaces minimal, hiding advanced options under collapsed sections or toggle chips.
*   **Destructive Actions Confirm**: Deletion, archiving, or streak-resetting actions must prompt a confirmation sheet or haptic warning.
*   **Swipe for Secondary Actions**: Use gesture swipes on list rows to reveal secondary operations (e.g., swipe left to delete/archive).
*   **Touch Targets**: Minimum 44×44pt hit target for every interactive element.

---

## 10. Modern 2026 Design Direction

Pebble reads as a calm, tactile, modern 2026 mobile product — not an AI trend collage.

### What Modern 2026 Design IS:
*   **Calm, intentional hierarchy**: One clear focal action or logical reading order per surface; supporting content fades in weight, not in clarity.
*   **Content-first interfaces**: Typography, spacing, and workspace hues carry identity; unnecessary decoration is stripped.
*   **Strong typography and spacing**: Rigorous adherence to Outfit weights and the 4px spacing scale.
*   **Restrained visual effects**: Tonal shifts and soft shadows; blur/translucency (`expo-blur`) is used **only** when it measurably improves depth/contrast and stays performant.
*   **Tactile interaction**: Crisp press states (`PressableScale`), responsive haptics (`expo-haptics`), and physical spring mechanics.
*   **Meaningful motion**: Animation explains spatial relationships or confirms user action; never animates just for decoration.
*   **Progressive disclosure**: Keep secondary attributes behind a tap or sheet; never dump every field into the primary view.
*   **Native mobile ergonomics**: Bottom-reachable controls, thumb-zone alignment, safe area compliance, and gesture-driven interaction.
*   **Accessibility**: Legible WCAG AA contrast, 44×44pt hit targets, proper `accessibilityRole` and `accessibilityState`.
*   **Excellent empty/loading/error states**: First-class zero-states that guide and encourage the user.
*   **Responsive/adaptive layouts**: Graceful handling of compact screens, font scaling, and light/dark modes.

### What Modern 2026 Design IS NOT:
*   ❌ **Glassmorphism everywhere**: Never make frosted glass the default background or card style.
*   ❌ **Gradients everywhere**: Avoid rainbow, aurora, or high-saturation gradient meshes that distract from text.
*   ❌ **Giant hero cards on functional screens**: Do not force a massive hero card onto task lists, calendars, or detail views.
*   ❌ **Excessive rounded cards & card soup**: Cards inside cards, cards wrapping every individual row, or border radii exceeding `Radius.xl`.
*   ❌ **Bento / SaaS dashboard grids**: Competing grids of unequal metric boxes designed for desktop monitors, not mobile phones.
*   ❌ **Floating action buttons (FABs) everywhere**: Pebble captures via the central radial dial sector; do not add ad-hoc FABs.
*   ❌ **Excessive pills & decorative badges**: Avoid floating pills for standard actions or empty decorative dots with no counts.
*   ❌ **Excessive or sluggish animation**: Avoid animations over 300ms, ease-in curves, or animations on frequent actions.
*   ❌ **Generic corporate SaaS aesthetics**: Stiff, corporate dashboard widgets with tiny labels and oversized numbers.

---

## 11. Negative Constraints & Anti-Patterns

### "When NOT to" Rules
*   **Never use cards when**:
    *   Grouping a single row or task (use a flat row).
    *   Presenting items inside an already grouped list or section.
    *   Displaying standard text notifications.
*   **Never animate when**:
    *   Triggered directly by keyboard typing or high-frequency toggles.
    *   Doing direct layout dimension interpolation (animating height/width instead of scale/transform).
*   **Never use pills when**:
    *   Presenting primary structural navigation (use tabs or dial).
    *   Showing critical error/danger signals (use solid bar indicators).
*   **Never use badges when**:
    *   No numeric context exists. Do not add decorative empty circles or dots.

### Blacklist Anti-Patterns (NEVER DO THESE)
*   ❌ **Nested cards**: Cards inside cards.
*   ❌ **Dashboard grids**: Multiple columns of unequal boxes competing for attention.
*   ❌ **Equal-weight widgets**: Multiple elements styled with identical heavy weight and color on overview screens.
*   ❌ **Decorative-only badges**: Badges containing no information or numeric count.
*   ❌ **Generic KPI cards**: Plain blocks with huge numbers and tiny labels underneath.
*   ❌ **Random gradients**: Colored backgrounds with no branding, purpose, or depth function.
*   ❌ **Settings options inside Today**: Bleeding configuration or workspace management widgets into the daily execution stream (settings belong in Workspaces or Profile).

---

## 12. Agent Behavior Protocol

When working on Pebble's design or user interface, future agents MUST adhere to this protocol:

1.  **Inspect Before Redesigning**: Read the existing screen and component implementation before proposing or writing changes.
2.  **Preserve Working Interaction Patterns**: Maintain working gestures, hooks, state listeners, and accessible structures.
3.  **Identify the Actual Problem**: Pinpoint the specific layout, contrast, or hierarchy flaw before proposing structural alterations.
4.  **Propose the Smallest Coherent Change**: Deliver surgical, production-ready improvements rather than broad speculative rewrites.
5.  **Avoid Inventing Product Concepts**: Stick strictly to current domain concepts (`Workspace`, `Task`, `Habit`, `Checklist`, `Resource`, `Schedule`, `Reminder`, `Focus`).
6.  **Avoid Redesigning Unrelated Areas**: Confine modifications strictly to the components and views requested.
7.  **Use Existing Components & Tokens**: Reference `shared/constants/*` for all tokens and reuse established primitives (`AppCard`, `AppText`, `PressableScale`, `EmptyState`, `AppHeader`).
8.  **Verify Implementation**: Always verify changes via `npx tsc --noEmit` and relevant tests.

