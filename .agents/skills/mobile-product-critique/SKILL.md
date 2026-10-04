---
name: mobile-product-critique
description: Pebble's primary design critique skill. Diagnoses what is wrong with an existing or proposed mobile interface across hierarchy, visual rhythm, cognitive load, ergonomics, and anti-patterns. Never generates code.
---

# Mobile Product Critique Guide

> **Truth as of 2026-10-02.** Subordinate to active code and `shared/constants/*`.

This is Pebble's **primary design critique skill**. Its sole purpose is to diagnose usability flaws, cognitive load, visual bloat, hierarchy defects, and generic AI patterns in existing or proposed mobile screens.

> **CRITICAL RULE**: This skill is strictly diagnostic. It must **NEVER generate implementation code or JSX**. It explains *what* is wrong and *why*.

---

## 1. Skill Contract & Deterministic Activation

* **Activates When**: Evaluating, auditing, or reviewing an existing screen or UI proposal for usability, visual rhythm, hierarchy, ergonomics, or anti-patterns.
* **Responsible For**:
  - Diagnosing information hierarchy and reading flow.
  - Checking spacing rhythm against the 4px baseline (`Spacing.*`).
  - Checking typography scale contrast (`Typography.*`).
  - Evaluating cognitive load, card usage, and surface nesting.
  - Assessing interaction cost (tap count, path complexity).
  - Checking mobile ergonomics (thumb-zone reachability, touch targets ≥ 44pt).
  - Flagging generic AI tropes ("card soup", bento grids, forced heroes).
  - Verifying alignment with Pebble's design constitution (`pebble-design`).
* **Must NOT Do**:
  - Must NOT generate implementation code or component files.
  - Must NOT invent new product concepts, domains, or tokens.
  - Must NOT prescribe redesigns for unrelated screens.
* **Authority Hierarchy**:
  1. Active source code & `shared/constants/*`
  2. `pebble-design` (Visual constitution)
  3. `design-tokens` (Token constraints)
  4. `mobile-product-critique` (Diagnostic authority)

---

## 2. Critique Dimensions

Evaluate the target screen against these 9 dimensions:

### 1. Information Hierarchy & Surface Appropriateness
* *Question*: Is the primary purpose immediately clear?
* *Check*: If an overview screen (Today), does it have an intentional anchor? If a functional screen (Workspace, task list, calendar, form), does it avoid forcing unnecessary hero cards?
* *Critique Pattern*: Flag competing focal points, forced hero cards on functional lists, or visual flatness where headers and body share identical visual weight.

### 2. Spacing & Visual Rhythm
* *Question*: Do related items group naturally through whitespace?
* *Check*: Does spacing align to Pebble's 4px baseline (`Spacing.xs` 4 to `Spacing.ux` 32)?
* *Critique Pattern*: Highlight uniform spacing that erases grouping, tight card padding (<16pt), or arbitrary offsets (e.g. 10px, 15px).

### 3. Typography Contrast
* *Question*: Does text scan effortlessly?
* *Check*: Does typography use Outfit scale steps (`Typography.sizes`, `Typography.weights`)? Is text rendered via `AppText`?
* *Critique Pattern*: Flag lack of weight contrast between titles and metadata, or body text styled as large as headings.

### 4. Cognitive Load & Surface Nesting
* *Question*: Is the user overwhelmed by visual containers?
* *Check*: Are cards nested inside cards? Is every individual row wrapped in its own card ("card soup")?
* *Critique Pattern*: Flag nested card structures and recommend flat lists, hairline dividers (`ROW_SPEC.dividerInset: 52`), and whitespace.

### 5. Interaction Cost & Navigation Friction
* *Question*: Can frequent actions be completed with minimal effort?
* *Check*: Does the action require unnecessary navigation? Are inline actions or contextual bottom sheets (`@gorhom/bottom-sheet`) preferred over full modals?
* *Critique Pattern*: Flag multi-step paths for simple edits or full-screen routes for minor actions.

### 6. Mobile Ergonomics & Touch Targets
* *Question*: Is the screen comfortable to use with one hand on a real device?
* *Check*: Are primary controls placed within the bottom thumb zone? Does every interactive target maintain at least **44×44pt**?
* *Critique Pattern*: Flag tiny icons without `hitSlop`, primary actions pinned to the unreachable top corners, or desktop-centric hover controls.

### 7. Accessibility (A11y) & Contrast
* *Question*: Does the interface pass WCAG AA standards?
* *Check*: Is text legible against tonal backgrounds? Are disabled/muted states readable?
* *Critique Pattern*: Flag low-contrast text, unlabelled icon buttons, or reliance on color alone for critical status.

### 8. Token Compliance & Design Debt
* *Question*: Does the layout reuse existing Pebble primitives?
* *Check*: Does it use semantic tokens from `shared/constants/*` (`theme.ts`, `categoryColors.ts`), or does it introduce hardcoded hex colors, arbitrary radii, or ad-hoc margins?
* *Critique Pattern*: Flag raw hex literals or invented token names.

### 9. Generic AI Tropes Trap
* *Question*: Does this screen look like a generic corporate dashboard or SaaS template?
* *Check*: Does it rely on bento grids, glassmorphism everywhere, gradients, or KPI metric blocks?
* *Critique Pattern*: Explain *why* it fails Pebble's calm, tactile 2026 identity and how to restore content-first simplicity.

---

## 3. Critique Output Format

Critique reports must be concise, structured, and actionable:

```markdown
# Design Critique: [Screen Name]

### 1. Executive Summary
[2–3 sentences summarizing the screen's core usability and design challenges.]

### 2. Structural Findings
* **Surface Architecture**: [Flat rows vs cards, nesting check, surface levels]
* **Hierarchy Assessment**: [Reading flow, focal point, hero appropriateness]

### 3. Detailed Diagnostic Table

| Dimension | Observation & Flaw | Severity | Concrete Correction |
| :--- | :--- | :--- | :--- |
| *Hierarchy* | [Specific issue] | High / Med / Low | [Recommended structural fix] |
| *Surface Nesting* | [e.g. Card soup on list rows] | High | [Replace with flat rows + ROW_SPEC dividers] |
| *Touch Ergonomics* | [e.g. 28pt icon button] | Med | [Apply 44pt min height or hitSlop={8}] |
| *Token Compliance* | [e.g. Hardcoded #6366F1] | High | [Map to Colors[scheme].primary] |

### 4. Pebble Identity Alignment
[Bullet points outlining immediate steps to align the screen with Pebble's Pine accent, Outfit typography, and calm tonal depth.]
```
