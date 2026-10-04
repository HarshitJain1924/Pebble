---
name: design-tokens
description: Pebble's canonical design token reference. Maps visual decisions directly to constants in shared/constants/* (color, typography, spacing, radii, shadows, row specifications).
---

# Pebble Canonical Design Tokens

> **Truth as of 2026-10-02.** Verified against `shared/constants/*`. If those constants change, this document is stale — the constants win.

This skill documents the design tokens that **actually exist in the codebase**. It is subordinate to `shared/constants/*`: if this document and code ever disagree, the code wins.

---

## 1. Skill Contract & Deterministic Activation

* **Activates When**: Writing or styling React Native components, looking up theme colors, sizing typography, configuring spacing/radii, or verifying token compliance.
* **Responsible For**:
  - Explaining the tokens implemented in `shared/constants/*`.
  - Guiding correct import paths for style constants.
  - Enforcing the `no-raw-hex-colors` guard.
* **Must NOT Do**:
  - Does NOT invent tokens (no non-existent tokens like `Colors.accent`, `textPrimary`, or `Radius.full`).
  - Does NOT define a second competing token system.
  - Does NOT dictate high-level screen layout or domain boundaries (defer to `pebble-design`).
  - Does NOT specify motion curves (defer to `emil-design-eng`).
* **Source of Truth Hierarchy**:
  1. `shared/constants/*` (Absolute implementation truth)
  2. `design-tokens` (Reference documentation)

---

## 2. Token Modules Overview

All tokens live under `shared/constants/`:

| Token Domain | Implementation File | Key Export |
| :--- | :--- | :--- |
| **Colors & Palette** | `shared/constants/theme.ts` | `Colors[scheme]`, `Palette` |
| **Semantic & Category Hues** | `shared/constants/categoryColors.ts` | `getCategoryColor`, `getCategoryColors` |
| **Typography** | `shared/constants/typography.ts` | `Typography` |
| **Spacing** | `shared/constants/spacing.ts` | `Spacing` |
| **Radii** | `shared/constants/radii.ts` | `Radius` |
| **Shadows / Elevation** | `shared/constants/shadows.ts` | `Shadows` |
| **Row Specifications** | `shared/constants/rowSpec.ts` | `ROW_SPEC` |

---

## 3. Color Tokens (`shared/constants/theme.ts`)

Colors are resolved per scheme via `Colors[scheme]` where `scheme` is `"dark" | "light"` (dark is the default).

### Semantic Colors
* `colors.background`: Base canvas / foundation surface.
* `colors.card`: Standard raised card surface.
* `colors.cardLight`: Secondary/hover card surface.
* `colors.primary`: **Pine brand accent** (dark `#358366`, light `#2C6C54`).
* `colors.primaryLight`: Lighter Pine step (`#44A782` dark / `#358366` light) for accent text/icons.
* `colors.secondary`: Blue accent (`#3B82F6` dark / `#2563EB` light).
* `colors.text`: Primary body and heading text.
* `colors.textMuted`: Secondary labels, captions, placeholders.
* `colors.success`: Emerald for positive/completion states.
* `colors.warning`: Amber for streaks and alerts.
* `colors.error`: Red for destructive states and warnings.
* `colors.border`: Faint hairline divider/boundary.
* `colors.icon`: Default icon tint.
* `colors.tabIconDefault`, `colors.tabIconSelected`: Navigation dial states.

### Raw Palette (`Palette`)
Raw primitives live on `Palette` (e.g. `Palette.pine500`, `Palette.amber500`). Use raw primitives only inside light/dark ternaries or inside `theme.ts` / `categoryColors.ts`.

> **ESLint Guard**: `theme.ts` and `categoryColors.ts` are the **only two modules allowed to contain raw hex literals** (`pebble/no-raw-hex-colors`). All components must consume semantic tokens.

### Category & Semantic Hues (`categoryColors.ts`)
Entity, priority, status, and workspace colors are resolved through `getCategoryColor(category, isDark)` or the hook `useCategoryColors()`. Do not write ad-hoc hex ternaries in components.

---

## 4. Typography Tokens (`shared/constants/typography.ts`)

Render text using `AppText` (`shared/components/ui/AppText.tsx`) which binds to Outfit font steps:

* **Font Families**:
  * `Typography.fontFamily.headline` = `"Outfit_700Bold"`
  * `Typography.fontFamily.body` = `"Outfit_400Regular"`
* **Sizes** (`Typography.sizes`):
  * `xs`: 12
  * `sm`: 14
  * `md`: 16 (standard body)
  * `lg`: 18
  * `xl`: 20
  * `xxl`: 24
  * `display`: 34
* **Weights** (`Typography.weights`):
  * `regular`: `"400"`
  * `medium`: `"500"`
  * `semibold`: `"600"`
  * `bold`: `"700"`
  * `heavy`: `"800"`

*Note*: There are no `typography.heading` or `typography.caption` object tokens. Map directly to `Typography.sizes` and `Typography.weights` steps or `AppText` props.

---

## 5. Spacing Tokens (`shared/constants/spacing.ts`)

Pebble enforces a disciplined 4px baseline scale:

* `Spacing.xs`: 4
* `Spacing.sm`: 8
* `Spacing.md`: 12
* `Spacing.lg`: 16 (standard screen side gutter and card padding)
* `Spacing.xl`: 20
* `Spacing.xxl`: 24
* `Spacing.ux`: 32 (hero surface padding)

Align all margins, paddings, gaps, and control heights to these steps.

---

## 6. Radii Tokens (`shared/constants/radii.ts`)

Corner radii for touch elements and surfaces:

* `Radius.sm`: 8 — Badges, chips, compact tags.
* `Radius.md`: 12 — Standard inputs, buttons, list tiles.
* `Radius.lg`: 16 — Standard cards, containers.
* `Radius.xl`: 20 — Primary elevated cards (`AppCard`), modal sheets.
* `Radius.pill`: 9999 — Fully rounded pills, search bars, filter chips.

**Touch Targets**: Every interactive element must maintain a minimum **44×44pt** hit area. Expand smaller visual controls using `hitSlop` (`PressableScale` defaults to `hitSlop={8}`).

---

## 7. Shadows & Surface Elevation (`shared/constants/shadows.ts`)

Pebble uses tonal layering for depth, augmented by two platform-aware shadow presets:

* `Shadows.soft`: Raised card elevation (subtle, dark-first).
* `Shadows.glow`: Pine-tinted accent glow for active or hero surfaces.

---

## 8. Row Specifications (`shared/constants/rowSpec.ts`)

Standard dimensions for task, habit, and checklist rows:

* `row`: `paddingVertical: 14`, `paddingHorizontal: 16`, `gap: 12`
* `checkbox`: 24pt visual ring, 1.5 ring width, 44pt effective hit area
* `badge`: 36pt tile, 11pt radius, 18pt icon
* `type`: Title 16 (`Typography.weights.semibold`), meta 13 (`Typography.weights.regular`)
* `dividerInset`: 52pt (aligned to the text start edge after the badge/checkbox)
* `listRow.minHeight`: 44pt

---

## 9. Motion Note (No Token Module)

**There is no central `Motion` or `spring.tactile` token module in Pebble.** Do not import or invent motion token objects. All motion is authored inline via `react-native-reanimated` worklets according to the interaction craft principles in `emil-design-eng`.
