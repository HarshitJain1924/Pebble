---
name: design-tokens
description: Pebble's design token repository. Defines the actual implemented constraints for color, typography, spacing, radius, shadows, and motion physics.
---

# Pebble Canonical Design Tokens

> **Truth as of 2026-10-02.** Verified against `shared/constants/*` on this date. If those constants change, this skill is stale — the constants win.

This skill maps design decisions onto the tokens that **actually exist in the
codebase**. It is authoritative only as a pointer: if this document and
`shared/constants/*` ever disagree, the constants win — verify against the source
before styling.

> **Source of truth for styling lives in code, not in this file:**
> `shared/constants/theme.ts` (`Colors`, `Palette`, `Fonts`),
> `shared/constants/typography.ts` (`Typography`),
> `shared/constants/spacing.ts` (`Spacing`),
> `shared/constants/radii.ts` (`Radius`),
> `shared/constants/shadows.ts` (`Shadows`),
> `shared/constants/categoryColors.ts` (semantic entity/priority/status hues).
>
> `theme.ts` and `categoryColors.ts` are the **only two modules allowed to contain
> raw hex literals** (enforced by the `pebble/no-raw-hex-colors` ESLint guard).
> Do not invent token names; if a token does not exist here, it does not exist.

---

## 1. Color

Colors are resolved per scheme from `Colors[scheme]` where `scheme` is
`"dark" | "light"` (dark is the app default). Available semantic keys:

*   `colors.background` — canvas / foundation surface.
*   `colors.card` — raised card surface.
*   `colors.cardLight` — slightly lighter card surface.
*   `colors.primary` — **brand accent, derived from the Pine ramp** (dark `#358366`, light `#2C6C54`). The old "Indigo/Purple primary" claim is stale: Indigo is retained only for one-off illustration/ambient tints and is explicitly *not* the primary.
*   `colors.primaryLight` — lighter Pine step used for accent text/icons.
*   `colors.secondary` — blue accent (`#3B82F6` dark / `#2563EB` light).
*   `colors.text` — primary body/heading text.
*   `colors.textMuted` — secondary text, captions, placeholders.
*   `colors.success` — emerald for completion/positive states.
*   `colors.warning` — amber for streaks/alerts.
*   `colors.error` — red for destructive/warning states.
*   `colors.border` — faint hairline divider/boundary.
*   `colors.icon` — default icon tint.
*   `colors.tabIconDefault`, `colors.tabIconSelected` — navigation icon states.

Raw primitives (mode-independent) live on `Palette` (e.g. `Palette.pine500`,
`Palette.amber500`) and must only be used inside light/dark ternaries or the two
sanctioned modules above.

### Semantic / category colors
Entity, priority, status, calendar, resource, and pebble hues live in
`shared/constants/categoryColors.ts`, resolved through `getCategoryColor`,
`getCategoryColors(isDark)`, or the `shared/hooks/useCategoryColors` hook. Do not
re-derive an entity hue with an inline `isDark ? "#x" : "#y"` ternary in a
component.

### Typography colors
Use `colors.text`, `colors.textMuted`, and semantic hues from the category map.
There are no `textPrimary` / `textMutedLight` tokens.

---

## 2. Typography

`Typography` (`shared/constants/typography.ts`) exposes three things only:

*   `Typography.fontFamily.headline` = `"Outfit_700Bold"`
*   `Typography.fontFamily.body` = `"Outfit_400Regular"`
*   `Typography.sizes`: `xs 12 · sm 14 · md 16 · lg 18 · xl 20 · xxl 24 · display 34`
*   `Typography.weights`: `regular 400 · medium 500 · semibold 600 · bold 700 · heavy 800`

The Outfit family (400/500/600/700) is loaded in `app/_layout.tsx`. There are no
`typography.display` / `typography.heading` / `typography.caption` tokens — map to a
`Typography.sizes` step and an `AppText` variant instead. Render all text through
`AppText` (`shared/components/ui/AppText.tsx`) so weights/colors stay consistent.

---

## 3. Spacing

`Spacing` (`shared/constants/spacing.ts`) is the 4px-based scale:

*   `xs 4 · sm 8 · md 12 · lg 16 · xl 20 · xxl 24 · ux 32`

Align margins, paddings, gaps, and heights to this scale. `lg` (16) is the standard
screen side gutter; `ux` (32) is the spacious gutter for hero surfaces.

---

## 4. Radii & Touch Boundaries

`Radius` (`shared/constants/radii.ts`):

*   `sm 8` — badges, chips, compact tags, small inner controls.
*   `md 12` — standard controls (buttons, inputs, list tiles).
*   `lg 16` — cards, containers, prominent banners.
*   `xl 20` — primary elevated cards (`AppCard`), major surfaces, modal cards.
*   `pill 9999` — fully rounded pills, filter chips, search bars.

**Touch targets**: every interactive element must keep a **44×44pt** minimum hit
area; where the visual is smaller, expand with transparent padding or `hitSlop`
(`PressableScale` defaults `hitSlop={8}`).

---

## 5. Shadows / Elevation

`Shadows` (`shared/constants/shadows.ts`) exposes two platform-aware presets:

*   `Shadows.soft` — the standard raised card shadow (dark-first).
*   `Shadows.glow` — a Pine-tinted glow for accent surfaces.

Surface hierarchy is **tonal layering**, not a stack of literal levels: Level 0
canvas, Level 1 surface cards, Level 2 modals/sheets, Level 3 transient overlays.
Translucency/blur (`expo-blur`) is used only where it improves hierarchy or depth —
it is not a universal background treatment. See
`docs/architecture/decision_log.md` (`surface-hierarchy-vs-glassmorphism`).

---

## 6. Motion Physics

There is **no central `Motion` / `spring.tactile` / `spring.natural` / `timing.duration`
token module.** Motion is authored inline with Reanimated:

*   **Springs for translation, scale, and gesture release** — e.g. the dial open uses
    `withSpring(1, { damping: 17, stiffness: 220, mass: 0.65 })`; press feedback uses
    springs in `PressableScale`.
*   **Timings for fades/color transitions** — `withTiming` under ~200ms with an
    out easing.
*   Respect `useReducedMotion()` (`shared/hooks/useReducedMotion`) for any ambient or
    looping animation, and route JS state updates out of worklets with `runOnJS`.

Do not cite spring/timing tokens that do not exist; copy the physics from the nearest
existing component or `PressableScale` instead.

---

## 7. Design Stance (2026)

Pebble targets a **clean, modern 2026 mobile aesthetic**: calm and intentional, high
information clarity, generous purposeful whitespace, content-first surfaces, strong
visual hierarchy, and restrained motion. Identity comes from the Outfit type scale,
the Pine accent, workspace hues, and spacing rhythm — not decoration.

When choosing tokens:

*   Prefer **tonal layering and soft shadows** for depth. Reach for `expo-blur` only
    where it genuinely improves hierarchy/depth/context and stays performant/readable;
    it is not a required treatment.
*   Prefer **fewer, stronger elements** over dense grids of equal-weight widgets.
*   Keep **state feedback** immediate (spring press + haptics) and **transitions**
    fast (<200ms), and honor `useReducedMotion`.
*   Design real **empty/loading/error** states, not placeholders.

This is directional, not prescriptive: no mandated gradients, glass, oversized rounded
cards, hero ratios, or floating action buttons. Trends yield to the product model in
`.agents/skills/pebble-design` §10.5.
