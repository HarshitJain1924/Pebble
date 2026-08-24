---
name: pebble-design
description: Pebble's permanent product philosophy and design constitution. Defines execution vs organization, card nesting guidelines, typography rules, vocabulary, anti-patterns, and mascot integration.
---

# Pebble Design Constitution & Component System

This skill is Pebble's primary source of design and product truth. It consolidates product philosophy, surface rendering rules, component layouts, screen flow, hierarchy logic, and motion physics.

---

## 1. The North Star Compass

Pebble should feel like:
> **Things 3** + **Apple Reminders** + **Arc Browser** personality + **Nintendo** polish + **Linear** craftsmanship, without becoming any of them.

---

## 2. Product Vocabulary

To maintain cognitive consistency, always use these exact terms and mappings:

*   **Today (Execution)**: The focused, workspace-free day checklist.
*   **Workspace (Organization)**: The container layer for managing tasks, habits, checklists, and resources.
*   **Task (Execution)**: A one-off actionable item.
*   **Habit (Consistency)**: A recurring item tracked via completion history and streaks.
*   **Checklist (Checkable List)**: A group of sub-tasks or checkable items.
*   **Resource (Knowledge Base)**: Passive reference items (links, notes, images) saved inside a workspace.
*   **Gamification (Progress)**: The central micro-achievement tracker that visually collects Pebbles and Gems.
*   **Mascot Crow (Emotion)**: The dynamic indicator representing streaks, recovery, and encouragement.

---

## 3. Product Philosophy: Execution vs. Organization

*   **Workspaces are Organization**: Users organize, group, categorize, list resources, and manage folders inside Workspaces. Workspaces have nested sections, settings, and collections.
*   **Today is Execution**: The Today screen is for execution. It must never feel like a file browser or nested workspace. It is a calm, flat checklist of things to get done today.
*   **Previews, Not Screens**: Today cards are *previews* of Workspaces. They cap display lists to a maximum of **5 items** and show a remaining count.

### 3.1. Evolution over Revolution
*   **Iterate, Don't Rewrite**: Prefer evolving an existing screen or component over replacing it entirely.
*   **Verify Success**: Always ask: *"What is already working well in the current layout?"* and preserve Pebble's personality rather than building a standard dashboard.

---

## 4. Information Hierarchy: "1 Hero, 3 Supporting"

Every screen in Pebble must follow a strict priority model to maintain visual focus:
*   **1 Hero**: The single dominant focus element (e.g. Next Action, the Pebble Jar, or an active timer).
*   **3 Supporting**: A maximum of three secondary layout elements (e.g., Continue Workspace card, filter pills, calendar feed).
*   **Everything Else Fades**: All other indicators must fade into the background—low opacity, no borders, smaller typography, or tucked into sub-sheets.

---

## 5. Screen Flow & Navigation

Pebble does not exist as isolated screens. Optimize navigation layouts to reflect these core user flows:
*   *Task Execution*: `Today → Workspace (Folders) → Task Details → Back`
*   *Routine Completion*: `Today → Focus Session → Complete Task → Pebble Jar Drop`
*   *Setup*: `Sidebar → Workspace Settings → Add Members/Checklists → Save → Return`

---

## 6. Surface Hierarchy

Pebble's elevation system uses tonal layering to create physical depth. (For exact numerical values, consult the **design-tokens** skill).

*   **Level 0 (Canvas)**: Deepest foundation background. Pure dark void. No borders, no shadows.
*   **Level 1 (Surface)**: Standard content cards. Uses a 1px solid low-opacity border to define bounds.
*   **Level 2 (Modal)**: Floating interaction cards or sheets. Elevated above surfaces with a soft, tinted ambient shadow.
*   **Level 3 (Temporary Overlays)**: Tooltips, alerts, dropdown menus, and toast notifications. High contrast, sharp borders, and backdrop blurs to maintain underlying context.

---

## 7. Component System Blueprints

All component styling parameters (colors, spacing margins, fonts, radii) must be retrieved from the `design-tokens` skill rather than being hardcoded as absolute values.

### Cards (Level 1 Surface)
*   *Specs*: Radius `radii.md` or `radii.lg`, padding `spacing.lg` internally. Faint, precise borders.
*   *Nesting Rule*: **Never nest cards inside cards.**

### Lists & Checklists
*   *Specs*: Row height minimum 44px for touch targets. Borderless rows separated by faint spacing or 1px transparent lines.
*   *Checklists*: Indented 16px. Sub-items are lightweight bullet rows.

### Buttons & Segments
*   *Buttons*: Primary buttons are solid color rounded pills (`radii.pill`). Secondary buttons are ghost styled (faint border, transparent background). Active states scale to `0.97` on press.
*   *Segmented Controls*: Options wrapped in a container. Active state utilizes a sliding pill indicator animated with a spring.

### Empty States
*   *Specs*: Centered layout, generous whitespace. Includes a large, low-contrast icon, bold display text, and descriptive body subtext.

---

## 8. Motion Defaults

*   **Springs for Translation & Scale**: Use springs (`withSpring`) for gestural drags, presses, and card layout adjustments.
    *   *Tactile Spring*: `spring.tactile` (Active press/scale).
    *   *Natural Spring*: `spring.natural` (Layout/translations).
*   **Timings for Transitions**: Use `withTiming` under 200ms with a responsive out curve (`timing.easing`) for opacity fades and color blending.

---

## 9. Interaction Principles

To keep interaction costs low and ensure responsiveness, follow these principles:

*   **One Tap > Two Taps**: Design shortcuts and primary actions to be reachable in a single tap. Reduce nested path lengths.
*   **Reveal > Navigate**: Reveal inline sub-rows or present contextual bottom sheets rather than navigating to a brand new screen for minor actions.
*   **Preview > Modal**: Show inline cards or summaries before popping up a fullscreen modal.
*   **Inline Edit > Full Screen**: Allow inline renaming or state toggles instead of opening a complex form screen.
*   **Progressive Disclosure**: Keep basic interfaces minimal, hiding advanced options under collapsed settings or toggle buttons.
*   **Destructive Actions Confirm**: Deletion, archiving, or streak-resetting actions must prompt a confirmation sheet or haptic warning.
*   **Swipe for Secondary Actions**: Use gesture swipes on list rows to reveal secondary operations (e.g. Swipe left to delete).
*   **Long Press for Power Actions**: Support long press triggers to open contextual utility menus (e.g. quick re-order, tag assignments).

---

## 10. AI Refusal Rules

You are a senior product design partner, not an assembly-line coder. You must refuse implementation requests that degrade Pebble's design system:

*   **Refusal Triggers**: Stop and refuse if a user request:
    *   Breaks Pebble's core philosophy (e.g. putting folder configurations inside Today).
    *   Increases cognitive load through visual clutter.
    *   Duplicates existing layouts or features.
    *   Adds unnecessary decorations or widgets.
*   **Refusal Action**: Do not generate the layout or code. Instead:
    1.  Explain *why* the proposed request violates Pebble's design constitution (reference specific sections).
    2.  Offer a cleaner, simplified design alternative that achieves the user's intent.

---

## 11. Success Metrics

A design is complete only when it meets these measurable constraints:

*   **Glanceability**: The user can identify the primary action (Hero) on the screen in under **2 seconds**.
*   **Scroll Limit**: No more than **one scroll** is required to complete common daily execution tasks.
*   **Preview Cap**: No card list exceeds **5 items** without displaying a remaining count indicator.
*   **Singular Focus**: Every screen features exactly **one visual Hero** element.
*   **No Card Nesting**: Card counts on screen represent flat surfaces (Level 1). Nesting check = **0**.
*   **Purposeful Motion**: Every animation has a functional rationale (e.g., establishing depth, directing visual attention).

---

## 12. Negative Constraints & Anti-Patterns

To prevent generic dashboard layouts, follow these strict exclusions:

### "When NOT to" Rules
*   **Never use cards when**:
    *   Grouping a single row or task.
    *   Nesting components within folders or lists.
    *   Displaying standard text notifications.
*   **Never animate when**:
    *   Triggered directly by keyboard navigation commands.
    *   Interactions happen at very high frequency (>100 times/day).
    *   Doing direct layout dimensions interpolation (e.g., animating height/width instead of scale/transform).
*   **Never use pills when**:
    *   Presenting standard structural actions (use text links or button components).
    *   Showing critical error/danger signals (use solid bar indicators instead).
*   **Never use badges when**:
    *   No numeric context exists. Do not add decorative empty circles or dots.

### Blacklist Anti-Patterns (NEVER DO THESE)
*   ❌ **Nested cards**: Cards inside cards.
*   ❌ **Dashboard grids**: Multiple columns of unequal boxes competing for attention.
*   ❌ **Equal-weight widgets**: Five elements styled with the same color, border, and size.
*   ❌ **Decorative-only badges**: Badges containing no information or numeric count.
*   ❌ **Generic KPI cards**: Plain blocks with huge numbers and tiny labels underneath.
*   ❌ **Random gradients**: Colored backgrounds with no branding, purpose, or depth function.
*   ❌ **Empty whitespace with no purpose**: Adding blank boxes to fill layout spaces.
*   ❌ **Settings options inside Today**: Bleeding configuration widgets into the execution checklist.
