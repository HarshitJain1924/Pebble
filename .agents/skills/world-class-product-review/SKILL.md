---
name: world-class-product-review
description: Optional final quality filter for major or high-impact screen redesigns. Evaluates proposals against visual bloat, unnecessary complexity, and craft integrity without redefining tokens or layout rules.
---

# World-Class Product Review (Quality Filter Overlay)

> **Truth as of 2026-10-02.** Subordinate to active code, `pebble-design`, and `design-tokens`.

This skill is an **optional quality-control overlay** for major or high-impact redesigns. It is **NOT** a standalone design system, and it does **NOT** redefine spacing, typography, tokens, or Pebble architecture.

Its job is to act as a **final editorial craft gate**: cutting bloat, testing restraint, and ensuring the interface feels intentional and native.

> **CRITICAL PROHIBITION: DO NOT CREATE A VISUAL COLLAGE.**
> Historical benchmarks (Apple, Rams, Linear, Things 3, Arc) are **craft standards only**.
> - Strictly prohibited: *"Combine Apple + Linear + Things + Arc."*
> - Pebble has its own distinct identity: Pine primary (`#358366`), Outfit typography, calm tonal surfaces, and Cairn mascot companion.
> - **Pebble must remain Pebble.**

---

## 1. Skill Contract & Deterministic Activation

* **Activates When**: ONLY on major screen redesigns, top-level navigation changes, or high-impact UX proposals.
* **Do NOT Activate When**:
  - Small visual tweaks (padding adjustments, color swaps, row styling).
  - Routine component maintenance or bug fixes.
  - Standard performance tuning.
* **Responsible For**:
  - Final quality gatekeeping.
  - Identifying unnecessary visual elements and cognitive bloat.
  - Ensuring the hierarchy is immediately scannable.
  - Filtering out generic AI templates and dashboard tropes.
  - Verifying that interaction complexity was kept minimal.
* **Must NOT Do**:
  - Must NOT redefine tokens, typography, or spacing scales (defer to `design-tokens`).
  - Must NOT generate implementation code or JSX.
  - Must NOT duplicate the detailed dimension-by-dimension diagnostic analysis of `mobile-product-critique`.
* **Authority Hierarchy**:
  1. Active source code & `shared/constants/*`
  2. `pebble-design` (Visual constitution)
  3. `design-tokens` (Token constraints)
  4. `mobile-product-critique` (Primary design diagnosis)
  5. `world-class-product-review` (Optional final quality gate)

---

## 2. The 7 Quality Filter Questions

Before approving a major redesign, pass the proposal through these 7 gates:

1. **Is anything unnecessary?**
   * *Lens*: "Less, but better" (Dieter Rams).
   * *Check*: Can any divider, border, container card, icon, or label be removed by letting whitespace do the work?

2. **Is the hierarchy obvious in 3 seconds?**
   * *Lens*: Scanning clarity (Alan Dye).
   * *Check*: Does the eye land immediately on the primary action or execution stream? Or do multiple elements compete for dominant attention?

3. **Is the interface overly generic or template-like?**
   * *Lens*: Anti-slop / Distinctiveness.
   * *Check*: Does it look like a generic SaaS dashboard, bento grid, or Material template? Does it honor Pebble's calm botanical green and editorial Outfit type?

4. **Is there visual bloat or "card soup"?**
   * *Lens*: Surface discipline.
   * *Check*: Did the designer wrap individual rows inside cards, or nest cards inside cards? Does it respect flat rows and Level 1 surface bounds?

5. **Is the interaction unnecessarily complex?**
   * *Lens*: Interaction friction (Things 3 / Linear).
   * *Check*: Does it require multiple taps, dropdowns, or full modal screens where an inline edit or bottom sheet would keep the user in flow?

6. **Does this feel native and ergonomic?**
   * *Lens*: Mobile ergonomics.
   * *Check*: Are primary controls reachable in the thumb zone? Are touch targets at least 44×44pt? Does it honor platform physics rather than web conventions?

7. **Does the proposal preserve Pebble's identity?**
   * *Lens*: Brand integrity.
   * *Check*: Does it preserve the Pine accent, Outfit type, calm tonal surfaces, and Cairn's unpressured presence?

---

## 3. Review Gate Output Format

When invoked, output a concise **Quality Gate Decision**:

```markdown
# World-Class Quality Filter: [Screen Name]

### Gate Status: [APPROVED / REVISE BEFORE IMPLEMENTATION]

### 1. Bloat & Restraint Filter ("Less, but better")
* **Elements to Eliminate**: [Specific dividers, borders, or redundant cards to remove]
* **Whitespace Opportunities**: [Where whitespace can replace visual chrome]

### 2. Craft & Hierarchy Verification
* **Scan Path**: [Is the primary focus unmistakable?]
* **Card Soup Check**: [PASS / FAIL - Are surfaces flat at Level 1?]
* **Ergonomics Check**: [PASS / FAIL - Thumb-zone alignment and 44pt touch targets]

### 3. Pebble Identity Check
* [ ] Pine brand accent preserved
* [ ] Outfit typography weights respected
* [ ] Tonal surface depth (no gratuitous glassmorphism)
* [ ] Cairn mascot remains calm companion (no high-pressure gamification)

### 4. Required Revisions
1. [Actionable change 1]
2. [Actionable change 2]
```
