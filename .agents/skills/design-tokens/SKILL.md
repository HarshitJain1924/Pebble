---
name: design-tokens
description: Pebble's design token repository. Defines absolute constraints for spacing, layout, typography, borders, and motion physics.
---

# Pebble Canonical Design Tokens

Use this skill as the absolute source of truth for styling layouts, typography, colors, animations, and spacing inside Pebble. Rather than hardcoding absolute pixel values in screens, map styles to this semantic system.

---

## 1. Semantic Typography Scale

All text in Pebble must map to a semantic tier. Do not specify arbitrary font sizes in layouts:

*   `typography.display`: Prominent numbers or milestone headers (e.g. jar progress milestones, major accomplishments). High weight, maximum impact.
*   `typography.heading`: Primary section titles and screen headers.
*   `typography.title`: Subsection headers, Workspace titles, or modal header cards.
*   `typography.body`: Standard readable text for tasks, checklists, descriptions, and paragraphs.
*   `typography.caption`: Metadata markers, date stamps, and tags. Stylized with medium weight, secondary coloring, and uppercase when appropriate.
*   `typography.micro`: Micro-indicators (e.g., streak fire counts, progress subtext). Minimal size, highly compact line-height.

---

## 2. Spacing Scale

Always align layout margins, paddings, gaps, and heights to Pebble's 4px baseline system. Map margins/paddings semantic names to variables defined in theme / style constants (`shared/constants/dashboardStyles.ts`):

*   `spacing.xs` (Extra Small): Gap for tiny element offsets (like streak fire gaps, text-icon spacing).
*   `spacing.sm` (Small): Spacing for row contents or checkbox-text gaps.
*   `spacing.md` (Medium): Spacing between rows in a list, or minor layout sections.
*   `spacing.lg` (Large): Standard screen side margin, card internal padding, and main section gaps.
*   `spacing.xl` (Extra Large): Padding for prominent modals, deep content sheets, or hero elements.
*   `spacing.xxl` (2x Extra Large): Vertical padding separating distinct section headers.

---

## 3. Surface & Color Mappings

Pebble's palette uses a dark void layout. Map colors semantically to the theme object:

*   `colors.canvas` (Level 0): Base foundation canvas background.
*   `colors.surface` (Level 1): Card background container surface.
*   `colors.modal` (Level 2): Elevated modal containers, sliding drawer cards.
*   `colors.overlay` (Level 3): Toast notifications, alert layers, hovering tooltips.
*   `colors.primary`: Accent color (Indigo/Purple) representing active state, primary buttons, and selected tabs.
*   `colors.success`: Color for complete items, positive milestone indicators.
*   `colors.warning`: Color for streaks, recovery alerts, and warning flags.
*   `colors.border`: Low-opacity hairline border to define surfaces.
*   `colors.textPrimary`: Highest contrast text color for titles and headers.
*   `colors.textMuted`: Secondary text color for description tags and captions.
*   `colors.textMutedLight`: Low contrast text color for subtle placeholder inputs and disabled states.

---

## 4. Radii & Touch Boundaries

*   **Radii Semantic Tiers**:
    *   `radii.sm`: Minor button curves, tag containers, input boxes.
    *   `radii.md`: Standard list items, cards, preview sections.
    *   `radii.lg`: Modals, bottom sheets, canvas layouts.
    *   `radii.pill`: Filter chips, checkboxes, slide togglers.
*   **Touch Targets**:
    *   Every interactive element (button, checkbox, tab) must maintain a minimum hit target size of **44px x 44px**. If the visual size is smaller, utilize transparent padding boundaries.

---

## 5. Motion Durations & Springs

All transitions must use physical springs or fast timings defined in the design system:

*   `spring.tactile`: High stiffness, low bounce (used for button press scale downs).
*   `spring.natural`: Medium stiffness, standard bounce (used for slide transitions, page openings).
*   `timing.duration`: Quick transition durations (max 200ms) with a natural bezier curve for opacity fades.
