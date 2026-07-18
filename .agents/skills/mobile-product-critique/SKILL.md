---
name: mobile-product-critique
description: Mobile product design critique. Reviews information hierarchy, visual rhythm, cognitive load, interaction cost, and checks for generic design patterns without generating code.
---

# Mobile Product Critique Guide

This skill is designed strictly for critique. It is prohibited from generating code or building UI. Its purpose is to evaluate existing or proposed screens and explain *why* they do or do not feel premium, indicating areas of design debt, cognitive load, and generic patterns.

---

## Evaluation Criteria

Evaluate every screen against these 9 dimensions:

### 1. Information Hierarchy
*   *Check*: Is the primary action immediately clear? Does the screen follow the **"1 Hero, 3 Supporting, everything else fades"** rule? Can the user tell what is most important in under 1 second?
*   *Critique Pattern*: Point out when multiple elements compete for dominant attention, or when headings, sub-headings, and body copy share similar weights or colors, causing "flatness."

### 2. Spacing and Visual Rhythm
*   *Check*: Do elements group together naturally? Is there an established grid/spacing system (e.g. 4px/8px baseline)?
*   *Critique Pattern*: Highlight when spacing is uniform across unrelated elements, which destroys spatial hierarchy, or when containers have insufficient internal padding.

### 3. Typography Hierarchy
*   *Check*: Are fonts sized and weighted with clear contrast? Is text readable on dark/light surfaces?
*   *Critique Pattern*: Critique the use of plain sans-serif fonts without weight contrast, or when labels are too large and compete with core headers.

### 4. Interaction Cost
*   *Check*: How many taps, swipes, or scrolls does it take to perform common actions? 
*   *Critique Pattern*: Call out designs that require unnecessary navigation steps, complex gestures, or multiple sub-menus.

### 5. Cognitive Load
*   *Check*: Is the user overwhelmed by too many elements on screen?
*   *Critique Pattern*: Flag nested cards, repeating sections, cluttered borders, and crowded widgets. Explain how the clutter increases processing time.

### 6. Accessibility (A11y)
*   *Check*: Is color contrast sufficient (WCAG standards)? Are touch targets large enough (minimum 44x44 points)?
*   *Critique Pattern*: Flag low-contrast text on glass overlays or tiny tap targets.

### 7. Platform Consistency
*   *Check*: Does the design feel like a native mobile app (iOS/Android) rather than a desktop website scaled down?
*   *Critique Pattern*: Point out heavy browser-like scrollbars, non-native select dropdown lists, or desktop-centric hover card states.

### 8. Design Debt
*   *Check*: Does the screen reuse existing design patterns and theme tokens, or does it introduce ad-hoc styles?
*   *Critique Pattern*: Critique layouts that introduce custom colors, border radii, or button shapes that break consistency with the rest of the application.

### 9. The "Generic Dashboard" Trap
*   *Check*: Does the screen look like a generic corporate template or bootstrap theme?
*   *Critique Pattern*: Explain *why* the layout looks generic (e.g., "It relies on standard borders, uniform padding, and a grid of boxes, lacking brand character, custom micro-interactions, or a primary focal point").

---

## Critique Output Format

Your critique must be structured as follows:

1.  **Overview**: A 2-sentence summary of the screen's main usability and design challenges.
2.  **Structural Breakdown**: Evaluation of the structure (nesting, layout).
3.  **Detailed Assessment Table**:
    | Dimension | Critique | Severity (High/Med/Low) |
    | :--- | :--- | :--- |
    | *Spacing* | Description of issue and why it fails... | High |
    | *Hierarchy* | Description... | Med |
4.  **Generic Analysis**: Explain specifically *why* this design lacks personality and how it can be elevated to feel premium.
