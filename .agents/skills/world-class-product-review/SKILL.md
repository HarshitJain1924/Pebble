---
name: world-class-product-review
description: Critique framework simulating the design standards of Alan Dye (Apple), Dieter Rams, Linear, Things 3, and Arc Browser to filter out generic layout generations.
---

# World-Class Product Review Guide

This skill operates as a high-quality product review overlay. Before implementing *any* design, review the proposed layout through the lens of history's and today's design pioneers:

*   **Alan Dye (Apple)**: Fluidity, physicality, tactile feedback, Safe Area harmony, and visual premiumness.
*   **Dieter Rams (Braun)**: "Less, but better." Functional honesty. No decorative lines or meaningless buttons.
*   **Linear**: Hyper-efficient keyboard pathways, clean grid boundaries, micro-contrast, and technical focus.
*   **Things 3**: Extreme whitespace, smooth entry animations, custom card decks, and elegant checklist sub-rows.
*   **Arc Browser**: Translucency, custom themes, playful mascot moments, and spatial personality.

---

## The Critique Filter

Critically analyze the UI proposal to catch these specific AI mistakes:

### 1. Unnecessary Elements (Rams' Principle)
*   Is there a divider line separating things that could be separated by whitespace?
*   Are there extra tags, icons, or badges that do not add value?

### 2. Inconsistent Spacing (Linear's Principle)
*   Are we mixing different padding offsets (e.g. 10px, 12px, 15px) inside the same screen?
*   Is vertical rhythm broken? (Keep elements aligned to a 4px/8px baseline grid).

### 3. Weak Hierarchy (Alan Dye's Principle)
*   Does the screen lack a distinct "Hero"?
*   Are headers too small or body texts too bright, creating a flat visual landscape?

### 4. Generic Interactions (Things 3 Principle)
*   Is the list standard and boring? Can we introduce a physical spring transition or a card deck overlap to make it feel premium?
*   Does it look like a Bootstrap template or Material design grid?

### 5. Platform Violations (Apple HIG Principle)
*   Does the screen resemble a desktop dashboard scaled down?
*   Are touch targets smaller than 44x44 points?

### 6. Emotional Disconnect (Arc Browser Principle)
*   Is the design sterile and cold? Where are the delightful mascot interactions, streak flames, or rewarding animations?

---

## Review Output Format

Generate a **World-Class Critique Report** structured exactly as follows:

```markdown
# World-Class Design Review

### 1. The Design Lens Critiques
*   **Dieter Rams (Braun)**: *"Less but better"* - Critique of visual bloat...
*   **Alan Dye (Apple)**: *"Physicality & Tactility"* - Critique of safe areas and touch feedback...
*   **Things 3**: *"Rhythm & Whitespace"* - Critique of hierarchy and lists...

### 2. Defects Identified
*   [ ] **Visual Bloat**: [Description of element to remove]
*   [ ] **Spacing Alignment**: [Description of alignment issue]
*   [ ] **Hierarchy Flatness**: [Description of typography contrast issue]
```
