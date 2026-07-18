---
name: product-architecture
description: Product architecture skill to define screen intent, justify layout structures, and align user needs before writing any code.
---

# Product Architecture & Screen Justification Guide

This skill governs screen justification and structural planning. Before implementing *any* user interface, writing React Native code, or drawing mockups, you must run this architectural thinking step to prevent feature bloat and justify every element.

---

## The 6 Core Justification Questions

For every new screen, modal, tab, or significant layout section, you must answer these six questions:

### 1. What question is this screen answering?
*   *Purpose*: Clarify the immediate information need. (e.g., "Am I on track today?" or "Where did I put that resource?").
*   *Action*: Define the one query the user wants answered by opening this view.

### 2. Who opens this screen?
*   *Context*: Identify the user segment and state of mind. (e.g., "A rushed user trying to check off their morning habits" vs. "A planner organizing a deep weekly workspace").

### 3. What emotion should they feel?
*   *Aesthetic Goal*: Align colors, spacing, and density with psychology.
    *   *Today screen*: Calm, focused, control.
    *   *Sanctuary screen*: Accomplished, satisfied, playful.
    *   *Workspace screen*: Organized, structured, capable.

### 4. What is the primary action?
*   *Focal Point*: There must be exactly one primary action (e.g. check a box, press "Start focus", create workspace). It must be visually dominant.

### 5. What is the secondary action?
*   *Alternative Path*: Identify the main secondary action (e.g. "Filters" or "Open workspace"). De-emphasize it compared to the primary action.

### 6. Can anything be removed? (Simplification)
*   *Bloat Prevention*: Inspect the proposed mockup. List at least two widgets, details, labels, or dividers that can be omitted to make it cleaner.

---

## Architectural Review Format

When this skill is invoked, generate a **Product Architecture Document** matching this markdown format:

```markdown
# Product Architecture: [Screen Name]

### 1. Intent & Justification
*   **Question Answered**: ...
*   **Target Persona / Mindset**: ...
*   **Target Emotional Response**: ...

### 2. Action Hierarchy
*   **Primary Action (Hero)**: ...
*   **Secondary Action**: ...

### 3. Simplification (What We Removed)
*   *Item 1*: Removed [X] because it duplicates [Y].
*   *Item 2*: Removed [Z] to reduce visual clutter.
```
