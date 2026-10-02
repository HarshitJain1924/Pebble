---
name: design-tokens
description: Semantic styling guidance for Pebble. Actual theme and component implementations in shared/constants/ and shared/components/ are authoritative.
---

# Pebble Design Tokens

Use semantic styling and existing Pebble tokens instead of ad-hoc values. This skill describes intent; implementation is authoritative.

## 1. Typography

Prefer the existing Pebble typography system and shared text primitives.

Semantic roles:
- `display` — major milestones/prominent numbers.
- `heading` — screen/primary section titles.
- `title` — subsection/workspace/modal titles.
- `body` — normal task/checklist/resource text.
- `caption` — metadata and secondary labels.
- `micro` — compact status/progress indicators.

Do not invent a new font family or scale when an existing shared implementation covers the need.

## 2. Spacing

Pebble generally follows a 4px rhythm, but exact values must come from current screen/component conventions and shared constants.

Do not assume `spacing.lg`, `spacing.xl`, etc. exist as runtime tokens unless they exist in code.

For an existing screen, preserve its established spacing rhythm unless the task is specifically a spacing redesign.

## 3. Color & Theme

Use the actual theme in `shared/constants/theme.ts` and related semantic color modules.

The current primary brand direction is the **Pine/green** ramp. Do not describe Indigo/Purple as Pebble's universal primary color.

Always inspect exported names before using them.

## 4. Radii & Touch Targets

Use existing shared radius/component conventions.

Interactive controls should preserve a minimum **44x44pt** hit target. Do not turn every control into a pill merely because a pill radius exists.

## 5. Motion

Prefer existing Reanimated/shared motion primitives and established timings/springs.

Motion should communicate state or physical response, remain interruptible for gestures, avoid decorative animation, and respect accessibility/reduced-motion support where available.

Do not invent named spring/timing tokens without checking the implementation.

## 6. Authority Rule

If this skill disagrees with `shared/constants/theme.ts`, shared components, or the active screen/component, the implementation wins.

Update this skill when the design system changes; do not use it to override the codebase.
