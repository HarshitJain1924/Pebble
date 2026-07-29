# Pebble Development and Design Guidelines (v1.0 - Frozen)

This document establishes the project rules, multi-skill workflows, and design guidelines for building and modifying Pebble's user interface. This system is frozen at v1.0 to establish a stable building baseline.

---

## 1. Dual-Speed Execution Modes

Before touching any code, determine which execution mode is appropriate for the task at hand:

### Option A: Fast Mode (Minor UI Tweaks & Value Edits)
Use this mode for minor visual adjustments (e.g., changing padding, font colors, button radii, or simple animation speed constants).
*   **Active Skills**: `pebble-design` + `design-tokens` + `emil-design-eng`
*   **Workflow**:
    1. Check style parameters against `design-tokens`.
    2. Confirm interaction feedback defaults with `emil-design-eng`.
    3. Implement the change directly.

### Option B: Full Review Mode (New Features, Layouts & Redesigns)
Use this mode for implementing new screens, major components, workflows, or when refactoring layouts.
*   **Active Skills**: All skills collaborating (`decision-log`, `product-architecture`, `mobile-product-critique`, `pebble-design`, `design-tokens`, `world-class-product-review`, `emil-design-eng`, `react-native-performance`).
*   **Workflow**: Follow the 4-Stage Multi-Skill Design Workflow below.

---

## 2. Multi-Skill Design Workflow (Full Review Mode)

### Stage 1: Critique & Architecture
*   **Active Skills**: `decision-log` + `product-architecture` + `mobile-product-critique`
*   **Goal**: Check the `decision-log` to avoid rejected paths. Justify the screen's intent by answering the 6 Core justification questions (the "why"). Diagnose layout density, anti-patterns, and cognitive load.
*   **Output**: Product Architecture Document detailing primary/secondary actions, and a critique checklist.

### Stage 2: Component Blueprinting
*   **Active Skills**: `pebble-design` + `design-tokens` + `world-class-product-review`
*   **Goal**: Apply the "1 Hero, 3 Supporting" hierarchy rule, establish the Surface Hierarchy (Level 0–3), utilize the canonical spacing/typography scale, and run the design proposal through the world-class review filter (Apple, Rams, Linear, Things 3, Arc).
*   **Output**: Structural component layout and World-Class Critique Report.

### Stage 3: Interaction & Motion Design
*   **Active Skills**: `pebble-design` (Motion defaults) + `emil-design-eng`
*   **Goal**: Define gestures, spring configs, transitions, and tactile feedback.
*   **Output**: Motion design plan.

### Stage 4: Implementation & Review
*   **Active Skills**: `react-native-performance` + code integration
*   **Goal**: Implement type-safe React Native code, optimize list rendering, and verify performance on the UI thread.
*   **Output**: Fully verified premium layout.

---

## 3. General Constraints & Rules

1.  **Expo versioning**: Read versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing React Native/Expo code.
2.  **No Card Nesting**: Never nest cards inside cards.
3.  **Today screen focus**: Today is strictly for execution; keep folders as compact previews with a single list and a clear "Continue" gateway.
4.  **Touch Feedback**: Use `PressableScale` for all pressable elements, scaling down to `scale(0.97)` with light haptic feedback.

---

## 4. Pebble Implementation Mode (Code Change Protocol)

Use this mode when implementing any code change to Pebble. This protocol ensures every change is minimal, verifiable, and tied back to the approved architecture.

### Before Changing Code

Explain:

* **Why** this task is being implemented.
* **Which ADR rule** it satisfies.
* **Which files** will change.

### Implement

Make the smallest possible production-ready change.

Do not touch unrelated files.
Do not refactor.
Do not improve nearby code.
Do not continue to another task.

### Required Evidence

#### Git Diff

Show the actual diff (or a meaningful excerpt if very large).

#### Files Changed

List every modified, added, and deleted file.

#### Build

Run the project's typecheck/build and report the actual output.

Do not say "it passes" without showing the command and result.

#### Tests

Run the relevant tests (or explain why none exist).

#### ADR Compliance

After implementation, explain:

- Which ADR rule(s) this change satisfies.
- Whether any ADR rule had to be bent.
- If yes, stop and explain why instead of implementing around it.

If implementation conflicts with the ADR, do not invent a new architecture.
Wait for approval.

#### Regression Checklist

Explicitly verify:

□ Existing public APIs unchanged
□ No new entity creation paths
□ CaptureService remains the single entry point
□ EntityFactory remains pure
□ Repository boundaries unchanged
□ No dead code introduced
□ No duplicated logic introduced
□ No debug logging introduced

### Stop

Do **NOT** begin the next implementation task.

Wait for review.

If implementation cannot be completed, explain exactly why instead of pretending it was completed.

---

## 5. Relationship Between Modes

| Mode | When to Use | Output |
|------|-------------|--------|
| **Fast Mode** (Option A) | Minor UI tweaks, value edits | Direct code change |
| **Full Review Mode** (Option B) | New screens, major components, redesigns | 4-stage design workflow |
| **Implementation Mode** (Section 4) | Any code change after design is approved | Verifiable, ADR-tied patch |

All three modes are valid. Choose the minimal one that satisfies the task.