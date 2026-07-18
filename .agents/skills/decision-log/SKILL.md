---
name: decision-log
description: Pebble's architectural and product memory. Records accepted decisions, rejected ideas, future experiments, known limitations, user research, and technical debt.
---

# Pebble Architectural & Product Memory

This skill serves as Pebble's permanent product and technical memory. It indexes accepted decisions, rejected directions, future experiments, user research findings, and technical debt. Before recommending changes, verify your proposal against this memory.

---

## 1. Permanent Decision Log

### [2026-06-27] today-execution-focus
*   **Context**: The Today screen felt cluttered and heavy, resembling a Workspace view rather than a day planner.
*   **Decision**: Redesigned the folder context card from containing full checklist/habit/task sub-menus into a flat, unified preview list containing a maximum of **5 items** sorted with incomplete items first. Added a zesty folder-colored checkbox style and a clear navigation gateway (`Continue in [Workspace Name] →`) at the bottom of the card.
*   **Reasoning**: Today is for execution; Workspaces are for organization. Putting collections, sub-sections, or settings inside Today causes cognitive load.
*   **Rejected Direction**: Retaining a full checklist manager in Today. Rejected because nested cards inside cards create visual density.
*   **Owner**: Harshit

### [2026-06-27] surface-hierarchy-vs-glassmorphism
*   **Context**: We initially specified glassmorphism as a hardcoded background rule, which is a styling trend that might drift.
*   **Decision**: Replaced all mentions of stylistic glassmorphism with a structured tonal layering model (Level 0 Canvas, Level 1 Surface, Level 2 Modal, Level 3 Temporary overlays).
*   **Reasoning**: Pebble's design language must be timeless and rely on depth, spacing, and micro-contrasts rather than styling trends.
*   **Rejected Direction**: Hardcoding glassmorphism tags.
*   **Owner**: Harshit

### [2026-06-27] dual-speed-workflow
*   **Context**: Running a full 5-stage design critique for minor modifications (like minor padding tweaks) slows down development velocity.
*   **Decision**: Structured two workflows in `AGENTS.md` (Fast Mode and Full Review Mode). Fast Mode skips the critique/review layers and implements edits directly using the tokens and motion guide.
*   **Reasoning**: Balance quality assurance with execution speed.
*   **Owner**: Harshit

---

## 2. Future Experiments & Hypotheses

*   **Exp-1: Gesture Completion Triggers**
    *   *Hypothesis*: Allowing users to complete tasks by swiping right directly on a preview row in Today will decrease completion friction.
    *   *Constraint*: Must be evaluated against the "one tap > two taps" interaction principle.
*   **Exp-2: Mascot Encouragement Timing**
    *   *Hypothesis*: Prompting the Crow mascot to react only when the Pebble Jar milestones are hit (rather than on every single checkbox click) increases the delight factor of the milestone.

### 2.1. Rejected Experiments
*   **Exp-3: Wallet Cards**
    *   *Result*: Users preferred clean, lightweight preview cards over card decks. (Rejected 2026).
*   **Exp-4: Collections on Today**
    *   *Result*: Drastically increased clutter and cognitive load. (Rejected 2026).

---

## 3. Known Limitations & Technical Debt

*   **Debt-1: Nested List Performance in React Native**
    *   *Description*: Rendering checklists with deep nested items inside standard FlatLists causes layout measuring drops.
    *   *Rule*: Keep checklists flat in data structure, indenting items visually using paddings rather than nesting scroll views.
*   **Debt-2: Reanimated Layout Transition Overhead**
    *   *Description*: Large numbers of parallel layout springs on Android result in frame drops.
    *   *Rule*: Wrap layout animation boundaries to separate list containers.

---

## 4. User Research Findings

*   **Res-1: Visual Overwhelm in Dashboards**
    *   *Observation*: Users feel anxious when confronted with 5+ competing widgets or dashboard grids.
    *   *Action*: Solidified the "1 Hero, 3 Supporting" layout rule.
