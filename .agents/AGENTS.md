# Pebble Development and Engineering Guidelines

> **Truth as of 2026-10-02.** Verified against the active codebase on this date. If the code has changed since, the code wins — update this document instead of trusting the date.

This document establishes the project rules, workflow, and engineering guardrails for Pebble.

---

## 0. Source of Truth & Design Guidance Hierarchy

When documentation conflicts with active code, **code wins**. Inspect the implementation and update documentation; never invent a compromise. Evidence hierarchy (strongest first):

1. **Active source code and runtime/tests** (`app/`, `features/`, `services/`, `repositories/`, `shared/`)
2. **Actual design tokens and active components** (`shared/constants/*`, `shared/components/*`)
3. **Active architecture decisions** (`docs/architecture/decision_log.md`, `docs/architecture/*.md`)
4. **Current-state engineering docs** (`docs/current_state.md`, `docs/integrity_status.md`, `AI_CONTEXT.md`)
5. **Agent instructions and skills** (`AGENTS.md`, `.agents/AGENTS.md`, `.agents/skills/*`)
6. **README / PRD**
7. **Historical/archive** (`docs/archive/**`) — context only, never current state

---

## 1. Skill Taxonomy & Authority Sequence

Every design and engineering skill has a single, non-overlapping responsibility. All skills are subordinate to active code and `shared/constants/*`.

```text
ACTIVE CODE + ACTUAL TOKENS (shared/constants/*, shared/components/*)
        ↓
PEBBLE PRODUCT / DESIGN CONSTITUTION (pebble-design)
        ↓
DESIGN TOKENS (design-tokens)
        ↓
INTERACTION / MOTION CRAFT (emil-design-eng)
        ↓
DESIGN CRITIQUE (mobile-product-critique)
        ↓
OPTIONAL QUALITY FILTER (world-class-product-review)
        ↓
SPECIALIZED ENGINEERING (react-native-performance)
```

### The 6 Canonical Pebble Skills

| Tier | Skill Name | Scope & Authority |
| :--- | :--- | :--- |
| **Permanent Authority** | *Active Code* | `shared/constants/*` and active components are the absolute styling authority. |
| **Design Constitution** | [`pebble-design`](file:///.agents/skills/pebble-design/SKILL.md) | Pebble visual language, surface hierarchy (Levels 0–3), card discipline, hero rule limits, domain boundaries, and Cairn boundaries. |
| **Visual Primitives** | [`design-tokens`](file:///.agents/skills/design-tokens/SKILL.md) | Maps visual choices strictly to `shared/constants/*` (colors, Outfit type, 4px spacing, radii, shadows, row specs). Never invents tokens. |
| **Interaction Craft** | [`emil-design-eng`](file:///.agents/skills/emil-design-eng/SKILL.md) | Reanimated UI thread motion, tactile feedback (`PressableScale`), gestural velocity handoff, and spring/timing heuristics. |
| **Design Critique** | [`mobile-product-critique`](file:///.agents/skills/mobile-product-critique/SKILL.md) | Primary diagnostic critique. Analyzes hierarchy, spacing, cognitive load, touch targets, and generic AI tropes. Never generates code. |
| **Optional Quality Filter** | [`world-class-product-review`](file:///.agents/skills/world-class-product-review/SKILL.md) | Final editorial filter for major redesigns only. Cuts visual bloat and enforces restraint. Crafts standards only (never a visual collage). |
| **Specialized Engineering** | [`react-native-performance`](file:///.agents/skills/react-native-performance/SKILL.md) | List rendering tuning (`FlatList`), memoization boundaries, and worklet thread safety. Invoked only for performance-sensitive tasks. |

> **Document References vs. Skills**: Architecture memory lives in `docs/architecture/decision_log.md` and `AI_CONTEXT.md`. These are repository documents, **not agent skills**. Do not reference phantom skills such as `decision-log` or `product-architecture`.

---

## 2. Skill Activation Rules (No Unnecessary Invocations)

Do NOT invoke every skill for every task. Select strictly according to task scope:

### 1. Small Visual Tweak (Padding, color mapping, row styling)
* **Active Skills**: `pebble-design` + `design-tokens`
* *Only add* `emil-design-eng` if interaction, press state, or motion changes.
* **Prohibited**: Do NOT invoke `world-class-product-review` or `react-native-performance`.

### 2. Existing Screen Critique (UX audit, hierarchy review)
* **Active Skills**: `pebble-design` + `design-tokens` + `mobile-product-critique`
* **Prohibited**: Do NOT invoke `react-native-performance` or generate code during a critique.

### 3. Major Redesign (Top-level layout restructuring, new surface)
* **Active Skills**: `pebble-design` + `design-tokens` + `mobile-product-critique` + `world-class-product-review`
* *Add* `emil-design-eng` if new gestures or animated transitions are introduced.

### 4. Motion-Heavy or Gesture Feature (Bottom sheet, custom dial, gesture dismiss)
* **Active Skills**: `pebble-design` + `design-tokens` + `emil-design-eng`

### 5. Performance-Sensitive UI (Long lists > 20 items, frame drops, worklet sync)
* **Active Skills**: `react-native-performance` (+ `design-tokens` if tuning row layout)
* **Prohibited**: Do NOT invoke `world-class-product-review`.

---

## 3. Development Workflow

Follow this deterministic 7-step engineering sequence:

```text
1. INSPECT EXISTING SCREEN / CONTEXT
       ↓
2. IDENTIFY THE SCREEN'S ACTUAL JOB
       ↓
3. IDENTIFY THE REAL UX / CODE PROBLEM
       ↓
4. CHECK EXISTING PRIMITIVES IN SHARED/
       ↓
5. APPLY ONLY THE MINIMAL RELEVANT SKILLS
       ↓
6. PROPOSE THE SMALLEST COHERENT CHANGE
       ↓
7. VERIFY WITH TSC & TESTS
```

1. **Inspect Existing Context**: Read active source code, props, and relevant architecture docs (`docs/current_state.md`, `docs/integrity_status.md`, `AI_CONTEXT.md`).
2. **Identify Screen Job**: Clarify whether the surface is an execution stream (Today), organizational container (Workspace), temporal planner (Schedule), session cockpit (Focus), or detail form.
3. **Identify Actual Problem**: Pinpoint the precise cognitive load, contrast, or performance bottleneck before proposing structural edits.
4. **Check Existing Primitives**: Reuse established components (`AppCard`, `AppText`, `PressableScale`, `EmptyState`, `AppHeader`) and constants (`Spacing`, `Typography`, `Colors`, `Radius`, `Shadows`, `ROW_SPEC`).
5. **Apply Minimal Skills**: Load only the skills required by the Activation Matrix in Section 2.
6. **Propose Smallest Change**: Deliver surgical, production-ready diffs. Evolution over revolution.
7. **Verify**: Always verify compilation with `npx tsc --noEmit` and run relevant tests.

---

## 4. Core Engineering Invariants

* **CaptureService is the Single Entry Point**: All entity creation must flow through `CaptureService`. No screen, hook, or component creates tasks/habits/resources directly.
* **EntityFactory Remains Pure**: `EntityFactory` must remain pure—no side-effects, no storage writes, no notification scheduling.
* **Repository Boundaries & Locking**:
  * Repositories are pure data-access objects.
  * Mutex-protected Read-Modify-Write (RMW) operations must call `*Unlocked` repository primitives within command handlers to prevent re-entrant deadlocks.
  * Follow established lock ordering (`withLocks` / canonical lifecycle sequences in `docs/current_state.md`).
* **Expo SDK Versioning**: This project runs Expo SDK 57 (React Native 0.86, React 19.2). Check versioned docs at https://docs.expo.dev/versions/v57.0.0/ when working with Expo APIs.

---

## 5. UI & Design Guardrails

* **Domain Boundaries (Execution vs. Organization vs. Temporal vs. Notification vs. Timer)**:
  * **Today is Execution**: Workspace-grouped execution stream (at most 5 preview items per workspace drawer before a "+N more" gateway). Keep it flat; never turn Today into a workspace browser.
  * **Workspaces are Organization**: Primary organizational container. Each workspace exposes four peer domain tabs: **Tasks, Habits, Checklists, Resources** (never nested folders or "collections").
  * **Schedule is Calendar Placement**: Dedicated time planning (day/week/month planner with drag-to-reschedule).
  * **Reminder is Notification Only**: A scheduled OS notification trigger (`triggerAt` epoch ms), not a separate domain entity or execution task.
  * **Focus is Focused Work/Timer**: Dedicated deep-work cockpit with linked task/habit and ambient audio.
* **Checklist Canonical Definition**: "Checklist is an independent collection of checkable items. It is not a task with subtasks."
* **Card Discipline (Surface Primitive, NOT Default Layout Primitive)**:
  * Cards are a surface primitive, not the default layout primitive. Prefer flat lists, rows, sections, dividers, and whitespace.
  * **Never nest cards inside cards** (surfaces remain flat at Level 1).
  * **Never wrap every individual row in a card** ("card soup").
* **Hero Rule (Overview Heuristic Only)**:
  * "1 Hero, 3 Supporting" is strictly an **optional heuristic for overview surfaces** (Today).
  * **Never force a hero onto functional screens**: Workspaces, Task lists, Habit lists, Checklists, Resources, Calendar/timeline, Forms, Detail screens, Planners, Settings.
  * **Do not turn every screen into a dashboard.**
* **Pebble Identity (Not a Derivative Collage)**:
  * Defined by: **Pine accent** (`Colors[scheme].primary`, dark `#358366`, light `#2C6C54`), **Outfit typography** via `AppText`, **4px spacing scale** (`Spacing.*`), **tactile interaction** (`PressableScale` scale(0.97) + light haptics), **calm tonal surfaces**, **workspace hues**, and **Cairn mascot companion**.
  * Never instruct agents to visually combine Apple, Things, Linear, and Arc. Those are craft quality standards only.
* **Modern 2026 Mobile Stance**:
  * *Promote*: Calm, intentional hierarchy; content-first interfaces; strong typography and spacing; restrained visual effects; tactile interaction; meaningful motion; progressive disclosure; native ergonomics (44pt touch targets); first-class empty states (`EmptyState`).
  * *Do NOT equate modern with*: Glassmorphism everywhere, gradients everywhere, giant hero cards, excessive rounded cards, bento/dashboard grids, floating action buttons everywhere, excessive pills, decorative badges, excessive animation, generic SaaS dashboard aesthetics, card-wrapped-everything, or copying another product's visual identity.
* **Token Authority**:
  * `shared/constants/*` is the absolute implementation authority (`theme.ts`, `typography.ts`, `spacing.ts`, `radii.ts`, `shadows.ts`, `rowSpec.ts`, `categoryColors.ts`).
  * **Never invent tokens.**
* **Terminology Boundaries**:
  * *Current*: `Workspace`, `Task`, `Habit`, `Checklist`, `Resource`, `Schedule`, `Reminder`, `Focus`, `Today`, `Pebble`, `Gem`, `Cairn`.
  * *Internal compatibility only*: `folderId` / `activeFolderId` (storage/code alias for `workspaceId`), `collections`, `stateTodos`. Never surface as product concepts.
  * *Archived / obsolete*: ❌ `Vault`, `Collections` as a product concept, `TodoList` / `TaskList`, `subtasks`, `nested folders`, `sidebar navigation`, `mandatory glassmorphism`, `XP`.
* **Mascot Guardrail (Cairn)**: Refer to `docs/cairn_voice_guide.md`. Presentation and companion layer only; never intrudes on core domain logic or storage persistence.

---

## 6. Regression Checklist

Before concluding any code modification, verify:
- [ ] TypeScript compiles cleanly (`npx tsc --noEmit`).
- [ ] Existing public APIs remain unchanged.
- [ ] No new entity creation paths bypass `CaptureService`.
- [ ] `EntityFactory` remains pure.
- [ ] Repository boundaries and locking sequences are preserved.
- [ ] No debug logging, dead code, or invented tokens introduced.
- [ ] No cards nested inside cards; no card soup on lists.
- [ ] Functional screens avoid artificial hero widgets.