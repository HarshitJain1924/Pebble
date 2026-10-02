---
name: world-class-product-review
description: Critique framework simulating the design standards of Alan Dye (Apple), Dieter Rams, Linear, Things 3, and Arc Browser to filter out generic layout generations.
---

# World-Class Product Review Guide

This skill operates as a high-quality product review overlay. Before implementing *any* design, review the proposed layout through the craft lenses of history's and today's design pioneers:

> **Pebble Scope & Identity Note:** These design figures serve as **craft quality standards**, NOT an instruction to create a derivative visual collage of other apps. Pebble has its own distinct identity:
> - **Pine Accent & Outfit Typography**: Distinctive botanical green primary (`#358366`) and clean editorial type.
> - **Calm Tonal Surfaces & Tactility**: Level 0 canvas, Level 1 cards, Level 2 sheets; `PressableScale` (0.97) with light haptics.
> - **Hero Rule**: The "1 Hero, 3 Supporting" rule is an **optional heuristic for overview surfaces (Today) only**. Never force a hero card onto functional screens (workspaces, task lists, calendar timeline, forms, detail screens). Do not turn every screen into a dashboard.
> - **Card Usage**: Cards are a surface primitive, not the default layout primitive. Prefer flat lists, rows, sections, whitespace, dividers, tabs, and tonal grouping. Never nest cards.
> - **Checklist Definition**: Checklist is an independent collection of checkable items. It is not a task with subtasks.
> - **Cairn Mascot**: Calm companion at edges of activity; never nag, pressure, or introduce intrusive gamification/streak flames.

*   **Alan Dye (Apple)**: Fluidity, physicality, tactile feedback, Safe Area harmony, and visual premiumness.
*   **Dieter Rams (Braun)**: "Less, but better." Functional honesty. No decorative lines or meaningless buttons.
*   **Linear**: Hyper-efficient keyboard pathways, clean grid boundaries, micro-contrast, and technical focus.
*   **Things 3**: Extreme whitespace, smooth entry animations, and elegant list rhythm.
*   **Arc Browser**: Expressive personality, focused workspace organization, and spatial clarity without clutter.

---

## Modern 2026 Stance

Before running the filter, hold Pebble's target stance (`.agents/skills/pebble-design` §10): calm and intentional, content-first, purposeful whitespace, progressive disclosure, meaningful motion, subtle depth, excellent empty/loading/error states, accessible touch ergonomics.

**Anti-Pattern Exclusions:** Do NOT equate "modern" with glassmorphism everywhere, gradients everywhere, giant hero cards, excessive rounded cards, bento/dashboard grids, floating action buttons everywhere, excessive pills, decorative badges, or generic SaaS dashboard aesthetics.

---

## The Critique Filter

Critically analyze the UI proposal to catch these specific AI mistakes:

### 1. Unnecessary Elements (Rams' Principle)
*   Is there a divider line separating things that could be separated by whitespace?
*   Are there extra tags, icons, or badges that do not add value?
*   Are rows wrapped in individual cards instead of using clean flat list rows?

### 2. Inconsistent Spacing (Linear's Principle)
*   Are we mixing different padding offsets (e.g. 10px, 12px, 15px) inside the same screen?
*   Is vertical rhythm broken? (Keep elements strictly aligned to Pebble's 4px baseline scale in `Spacing.*`).

### 3. Surface Appropriateness & Hierarchy (Alan Dye's Principle)
*   Does an overview surface (Today) have a clear anchor?
*   Did someone artificially force a giant hero component onto a functional screen (e.g. task list, calendar, settings)?
*   Are headers too small or body texts too bright, creating a flat visual landscape?

### 4. Generic Interactions (Things 3 Principle)
*   Is the interaction clunky or desktop-like? Does it use tactile spring feedback (`PressableScale`)?
*   Does it look like a Bootstrap template, bento box, or Material design grid?

### 5. Platform Violations (Apple HIG Principle)
*   Does the screen resemble a desktop dashboard scaled down?
*   Are touch targets smaller than 44×44 points?

### 6. Tone & Mascot Boundaries (Arc Browser / Cairn Principle)
*   Is the design sterile and cold, or conversely, overly gamified and noisy?
*   Does Cairn appear appropriately at natural edge moments (empty states, milestone celebrations) without intrusive nagging or synthetic pressure?

---

## Review Output Format

Generate a **World-Class Critique Report** structured exactly as follows:

```markdown
# World-Class Design Review

### 1. The Design Lens Critiques
*   **Dieter Rams (Braun)**: *"Less but better"* - Critique of visual bloat and card usage...
*   **Alan Dye (Apple)**: *"Physicality & Tactility"* - Critique of safe areas, hierarchy, and touch feedback...
*   **Pebble Identity**: *"Calm, Modern 2026 Mobile"* - Alignment with Pine accent, Outfit type, and tonal surfaces...

### 2. Defects Identified
*   [ ] **Visual Bloat / Card Soup**: [Description of element or unnecessary card wrapper to remove]
*   [ ] **Spacing Alignment**: [Description of alignment issue relative to Spacing.*]
*   [ ] **Hierarchy Appropriateness**: [Description of typography contrast or inappropriate hero widget]
```

