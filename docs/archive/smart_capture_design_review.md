# Smart Capture Design Review

> **Author:** Principal Product Architect & Staff Software Engineer  
> **Date:** July 2026  
> **Reviewing:** `smart_capture_decision_engine.md` (proposed), `smart_capture_adr.md` (historical), `smart_capture_implementation_blueprint.md` (historical)  
> **Against:** Current codebase (`nlp-parser.service.ts`, `CaptureService.ts`, `entity-factory.service.ts`, `UnifiedCapture.tsx`, `useTasksState.ts`, etc.)  

---

## Phase 1: Internal Consistency

### 1.1 Contradictory Rules

**Issue 1.1-A: Decision 6 (Note Detection) vs Hierarchy Rule 4**

The decision engine defines Decision 6 as a Note detection step that runs after explicit-type checks but before recurrence analysis (Section 3, Decision 6: "Runs after all explicit-type checks (URL, checklist, idea, file) but before recurrence analysis").

However, Hierarchy Rule 4 states: "Metadata never changes type. Category, priority, date, time, reminder — these enrich an entity but never cause a type change after the initial decision."

These are consistent in principle but **the Note detection step contradicts the hierarchy diagram**. The hierarchy diagram (Section 2) shows Note detection as a gate in the type decision flow (alongside URL, Checklist, Idea, File), while Hierarchy Rule 4 says type decisions are final after explicit signals. If Note is a type decision, it should be in the type precedence list (Section 5.1), which it is (at position 5). But then Decision 6 should not say "runs before recurrence analysis" if it's a type gate — recurrence analysis also determines type (Task vs Habit). This creates an ordering contradiction.

**Severity:** Low. The inconsistency is in the document's description of where Note detection sits in relation to recurrence analysis.

---

**Issue 1.1-B: Empty Input Behavior vs Confidence Behavior**

Decision 1 returns an empty Task with confidence 0.1 (mapped to "Unknown"). Section 6.4 says Unknown confidence + Task → "Override to NOTE". But Decision 1's "Fallback behavior" says "Return empty task. UI shows disabled save button."

The pipeline description (Section 6.6) says Unknown → Parser produces Task → CaptureService overrides to Note. So an empty input would become an empty Note? But Decision 1 explicitly says "UI shows disabled save button" — meaning no save at all.

**Severity:** Medium. The empty-input flow has three different descriptions: (1) empty Task with disabled save, (2) override to Note via confidence check, (3) no entity created. These need resolution.

---

**Issue 1.1-C: Confidence Thresholds vs Score Sources**

Section 6.2 lists "Default task" with base score 0.30. Section 6.4 says <0.40 = Unknown → override to Note.

But Decision 8 (Habit vs Task classification) can produce a Task with recurrence. The current code starts with `confidence = 0.5` (not 0.3). The 0.3 base score in the document only applies to the "default task" path where no signal at all is detected. The document's own examples table lists "Gym" at 0.50 and "Buy milk" at 0.65 — neither below 0.40.

If the Unknown threshold is 0.40, and the default base confidence is 0.30 (with bonuses potentially increasing it), when would an input actually stay below 0.40? Only inputs with zero bonus signals. But category detection (+0.15) would bring even a single-category match to 0.45 (above Unknown). The Unknown tier would only apply to inputs with absolutely no category, no recurrence, no priority, no date, no time. That's a very narrow band.

**Severity:** Low. The 0.40 threshold may be too low to be practically useful.

---

### 1.2 Duplicate Concepts

**Issue 1.2-A: `confidence` and `classification.confidence`**

The decision engine proposes adding a `classification.confidence` field (Section 6.6). But the existing `ParsedProductivityItem` already has a `confidence: number` field. Adding a second confidence field (one numeric, one qualitative) creates two parallel sources of truth. Engineers will ask: "Which confidence do I read?"

The document doesn't specify whether `classification.confidence` replaces the existing `confidence` field or coexists with it. If coexisting, which one does CaptureService check?

**Severity:** Medium. Must resolve before implementation.

---

**Issue 1.2-B: `checklistConfidence` and `classification.confidence` for checklists**

The existing type has `checklistConfidence?: "high" | "medium"`. The proposed `classification.confidence` would be `"high" | "medium" | "low" | "unclear"`. For checklists, both fields carry overlapping information. The decision engine document doesn't address whether `checklistConfidence` should be removed in favor of `classification.confidence`.

**Severity:** Low. These can coexist, but it adds cognitive load.

---

### 1.3 Overlapping Responsibilities

**Issue 1.3-A: `CaptureService.saveParsedItem()` vs `useTasksState.handleSaveParsedItem()`**

The decision engine's pipeline (Section 7.1) shows CaptureService as the single entry point. However, reading the code reveals that `useTasksState.ts` has its own `handleSaveParsedItem()` method (lines 517-722 of useTasksState.ts) that constructs entities directly — it calls `TaskRepository.saveTask()` and `HabitRepository.saveHabit()` without going through `CaptureService`.

This means the decision engine's assumed architecture (single entry point) is contradicted by actual code. There are **two** parsed-item save paths:
1. `UnifiedCapture.tsx` → `CaptureService.saveParsedItem()` (the intended path)
2. `useTasksState.ts` → `handleSaveParsedItem()` (the real path used by the tasks screen)

The decision engine doesn't acknowledge this split. Any changes to CaptureService (like the Unknown→Note override) would only affect path 1, not path 2.

**Severity:** **Critical.** The entire confidence-based entity routing design collapses if half the saves bypass CaptureService.

---

### 1.4 Conflicting Terminology

**Issue 1.4-A: "File" as a type**

The parser outputs `type: "file"`, but `ResourceType` in `domain.types.ts` is `"note" | "link" | "idea"` — no "file". The `entity-factory.service.ts` maps `"file"` → `"note"`. The decision engine's precedence list puts FILE at position 1 (highest priority), but FILE doesn't survive entity construction — it becomes a NOTE resource.

This creates a confusing user experience: the badge says "File" but the entity is stored as a Note.

**Severity:** Medium. Terminology mismatch between what the parser says and what's persisted.

---

**Issue 1.4-B: "Resource" vs "Note" vs "Idea" vs "Link"**

The decision engine uses "Note" as a type in the detection flow, but the domain model uses "Resource" as the container. "Note" is actually a `ResourceType` variant (`"note" | "link" | "idea"`). The document uses "Note" to mean both the detection type AND the storage type, without clarifying that "Note" detection results in a Resource entity with `type: "note"`.

**Severity:** Low. Acceptable for a design document, but implementers must map carefully.

---

### 1.5 Circular Logic

**Issue 1.5-A: Confidence → Type → Confidence**

The decision engine's flow (Section 7 Decision Tree):
1. Parser determines type
2. Parser calculates confidence
3. CaptureService checks confidence → may override type to Note
4. New type (Note) goes to ResourceRepository

But the confidence was calculated based on the *original* type assignment. If the type is overridden after confidence calculation, the confidence score no longer reflects the final entity's semantics. For example, "Gym" → confidence 0.5 (calculated for Task) → overridden to Note. The 0.5 confidence is meaningful for Task but meaningless for Note.

**Severity:** Low. The confidence score is used for UI display, not downstream logic. Still, it's a conceptual circularity worth noting.

---

### 1.6 Impossible States

**Issue 1.6-A: Idea containing recurrence**

Decision 4 says: "If input matches both idea keywords AND contains recurrence (e.g., 'Idea: journal every day'), the idea keyword wins. The recurrence is still parsed as metadata on the Resource entity."

But the current code (and the decision engine's own metadata stripping in Decision 15) strips recurrence from Resource entities: `recurrence: isResource ? undefined : recurrence`. So storing recurrence on an Idea is impossible with the current code. The document proposes it but doesn't update the stripping logic.

**Severity:** Medium. The document describes a state that the code cannot produce.

---

### 1.7 Missing Decisions

**Issue 1.7-A: No decision for what happens when multiple categories match**

The current code iterates through categories in map order and stops at the first match. This means "Study React at the gym" would get "learning" (first match) rather than "health". The document documents this as intended (Decision 9), which is fine, but doesn't consider whether the user should be notified of potential miscategorization.

**Severity:** Low. Acceptable behavior.

---

**Issue 1.7-B: No decision for how the UI should handle the Unknown→Note override**

Section 6.5 says for Unknown: "Labeled 'Save as Note'", "Override dropdown shown by default". But the actual code's `TYPE_META` and save button label (in UnifiedCapture.tsx) don't have any mechanism to change the save button based on confidence. The document prescribes UI behavior that doesn't exist and doesn't describe how to thread confidence information to the UI layer.

**Severity:** Medium. The UI prescription is not backed by any existing infrastructure.

---

## Phase 2: Document vs Code Comparison

### 2.1 Behavior Already Implemented

| Behavior | Document | Code Location | Status |
|---|---|---|---|
| Empty input returns default Task | Decision 1 | `nlp-parser.service.ts` line 63-69 | ✅ Fully implemented |
| URL detection with type="link" | Decision 2 | `nlp-parser.service.ts` line 82-103 | ✅ Fully implemented |
| Checklist detection (bullets) | Decision 3 | `nlp-parser.service.ts` line 106-134 | ✅ Fully implemented |
| Checklist detection (short lines) | Decision 3 | `nlp-parser.service.ts` line 136-159 | ✅ Fully implemented |
| Idea keyword detection | Decision 4 | `nlp-parser.service.ts` line 162-179 | ✅ Fully implemented |
| Category keyword detection | Decision 9 | `nlp-parser.service.ts` line 188-204 | ✅ Fully implemented |
| Recurrence parsing (7 patterns) | Decision 7 | `nlp-parser.service.ts` line 217-297 | ✅ Fully implemented |
| Habit vs Task heuristic scoring | Decision 8 | `nlp-parser.service.ts` line 303-366 | ✅ Fully implemented |
| Reminder offset parsing | Decision 12 | `nlp-parser.service.ts` line 369-385 | ✅ Fully implemented |
| Priority keyword detection | Decision 10 | `nlp-parser.service.ts` line 388-406 | ✅ Fully implemented |
| chrono-node date/time extraction | Decision 11 | `nlp-parser.service.ts` line 409-455 | ✅ Fully implemented |
| "today"/"tomorrow" fallback | Decision 11 | `nlp-parser.service.ts` line 445-457 | ✅ Fully implemented |
| Title cleanup (remove keywords, capitalize) | Decision 13 | `nlp-parser.service.ts` line 462-479 | ✅ Fully implemented |
| Default priority = "medium" | Decision 14 | `nlp-parser.service.ts` line 481 | ✅ Fully implemented |
| Metadata stripping for resources | Decision 15 | `nlp-parser.service.ts` line 488-492 | ✅ Fully implemented |
| detectionSignal assignment | Decision 16 | `nlp-parser.service.ts` line 494-496 | ✅ Fully implemented |
| Workspace suggestion | Decision 15 (external) | `workspace-suggestions.service.ts` | ✅ Fully implemented |
| Behavior suggestion (post-hoc) | Decision 18 | `suggestions.service.ts` | ✅ Fully implemented |

### 2.2 Behavior Partially Implemented

| Behavior | Document | Current State | Gap |
|---|---|---|---|
| File attachment | Decision 5 | Handled in `UnifiedCapture.tsx` via DocumentPicker, sets `type: "file"` on parsedItem. EntityFactory maps to Resource. | The document says this is a parser decision, but the parser never handles file attachments. File attachment is UI-layer logic. |
| Confidence scoring | Decision 14 | The parser calculates a numeric confidence (0.1–1.0) but does NOT map to qualitative tiers (Certain/Likely/Uncertain/Unknown) | The qualitative mapping is unimplemented |
| detectionSignal field | Decision 16 | The parser sets `detectionSignal` for most patterns but NOT for all paths | The `default_task` signal is only assigned at the end; some early-return paths (empty input) don't set it |

### 2.3 Behavior Completely Missing

| Behavior | Document Section | Why Missing |
|---|---|---|
| **Note Detection (passive content)** | Decision 6 | The parser has no passive content analysis. Zero code exists for detecting passive verbs, citations, or reference material. This is a **new feature**, not a documentation gap. |
| **Confidence tier mapping** | Section 6.1 | The parser outputs a raw number. No tier classification exists. |
| **Unknown→Note override in CaptureService** | Section 6.6 | CaptureService unconditionally uses the parser's type. No confidence check before entity construction. |
| **Classification field** | Section 6.6 | `ParsedProductivityItem` has no `classification` field. The existing `confidence` field is a raw number. |
| **Note type in detectionSignal** | Decision 16 (detectionSignal) | The type allows `"keyword_note"` but the parser never sets it (the `"keyword_note"` detection was removed in an earlier edit) |
| **Confidence-based UI behavior** | Section 6.5 | No UI code reads confidence to change save button labels, show override prompts, or alter type badges |
| **Explicit signal gate** | Hierarchy diagram (Section 2) | The parser doesn't have an "EXPLICIT SIGNAL?" gate. It's a linear flow-through with conditional checks. |

### 2.4 Behavior Impossible with Current Architecture

| Behavior | Why Impossible |
|---|---|
| Note detection via passive verb analysis | The parser has no NLP model for passive voice. Adding this would require a library (like compromise) or a substantial keyword expansion. The ADR explicitly rejected adding AI/cloud services. |
| Confidence tiers affecting save button in UnifiedCapture | The save button label and behavior are determined by `saveButtonLabel` (a useMemo based on `parsedItem.type`). Changing it based on `classification.confidence` would require: (a) the classification field to exist, (b) the component to read it, (c) a new UI state for "confirm before save". All three are absent. |
| Confidence-based type override in CaptureService | CaptureService's switch-case directly uses `item.type`. Adding a pre-check would need the switch to be conditional. Not impossible, but the document's pipeline (Section 7.1) shows a clean confidence check before entity factory — this doesn't exist. |

### 2.5 Behavior Requiring Architectural Changes

| Behavior | Required Changes |
|---|---|
| Unknown→Note routing | Requires changes to: `ParsedProductivityItem` (add classification), `CaptureService` (add confidence check), `entity-factory` (may need adjustment), and `useTasksState.handleSaveParsedItem()` (the bypass path must also implement the check or be deprecated) |
| Confidence tiers in UI | Requires changes to: `UnifiedCapture.tsx` (save button logic), `TYPE_META` (add confidence-based display), and a new mechanism to pass classification metadata to the UI |
| Note detection (passive content) | Requires new detection logic in the parser. Could be regex-based (e.g., detect forms of "to be", quotations, passive constructions) or require a new dependency. |

---

## Phase 3: Decision Engine Review

### 3.1 Necessity Check

| Decision | Necessary? | Can Merge? | Notes |
|---|---|---|---|
| D1: Empty Input | ✅ Yes | No | Gate check, prevents crashes |
| D2: URL Detection | ✅ Yes | No | Strongest structural signal |
| D3: Checklist Detection | ✅ Yes | No | Structural, high confidence |
| D4: Short-line Checklist | ⚠️ Yes but D3+D4 could merge | Yes, merge D3+D4 | These are the same decision at different confidence levels. Merge into "Checklist Detection" with High/Medium sub-outcomes. |
| D5: Idea Keyword | ✅ Yes | No | Explicit user signal |
| D6: File Attachment | ⚠️ Not a parser decision | Move to UI layer doc | Handled programmatically in component, not by parser. Remove from parser decisions. |
| D7: Note Detection | ⚠️ New feature, not a decision | Create separate section | Doesn't exist in code yet. Document it as proposed feature, not current decision. |
| D8: Recurrence Detection | ✅ Yes | No | Core to Task/Habit split |
| D9: Habit vs Task | ✅ Yes | No | Core classification |
| D10: Category | ✅ Yes | No | Useful metadata |
| D11: Priority | ✅ Yes | No | Useful metadata |
| D12: Date/Time | ✅ Yes | No | Core temporal parsing |
| D13: Reminder Offset | ✅ Yes | No | User-requested feature |
| D14: Title Cleanup | ✅ Yes | No | UX quality |
| D15: Confidence | ✅ Yes | No | Core to new design |
| D16: Workspace Suggestion | ⚠️ Not a parser decision | Move to separate doc | Runs asynchronously in UI. Remove from parser docs. |
| D17: Suggestion Engine | ⚠️ Not a parser decision | Move to separate doc | Post-hoc analysis, not real-time parsing |

**Recommendation:** Reduce the decision list from 17 to 13 parser decisions by removing file attachment, workspace suggestion, and suggestion engine from the parser's scope.

### 3.2 Ordering Correctness

The current execution order in the code is:

```
Empty Check → URL → Checklist → Idea → Category → Recurrence → Habit/Task → Reminder → Priority → Date/Time → Title Cleanup → Return
```

The document's proposed order (Section 2 hierarchy diagram) is:

```
Empty Check → URL → Checklist → Idea → File → Note → Recurrence → Habit/Task → Metadata → Confidence Check → Entity Decision
```

**Issues with proposed order:**

1. **Category detection is after Note detection in the document but before recurrence in the code.** The document doesn't place category in the flow diagram at all (it's in "Metadata Extraction" box). But the current code runs category BEFORE recurrence, and the Habit/Task heuristic uses the detected category. If category runs after recurrence/habit detection, the heuristic loses a key input.

2. **Note detection before recurrence** — If Note detection triggers (e.g., "The sky is blue"), recurrence analysis is skipped entirely. But "The sky is blue every day" would be a legitimate habit check. The ordering should be: Note detection only triggers if there's NO recurrence. Currently the code doesn't handle this because Note detection doesn't exist.

3. **File attachment check is out of place** — The document places it between Idea and Note, but in the code, file attachment is set programmatically (before parsing even starts). It should be removed from the parser flow entirely.

**Recommendation:** Keep the current execution order. Add Note detection as a low-priority check (after recurrence fails, before default task).

### 3.3 Unnecessary Complexity

| Complexity | Where | Why Unnecessary |
|---|---|---|
| **4 confidence tiers** | Section 6.1 | The document defines Certain (≥0.85), Likely (0.60-0.84), Uncertain (0.40-0.59), Unknown (<0.40). Only **two** behaviors matter: (1) confident enough to auto-save, (2) not confident enough, route to Note. Reduce to: Confident ≥0.60, Uncertain <0.60. |
| **Separate Decision 14 (Confidence) from Score Sources table** | Section 3 vs Section 6.2 | The score sources table already defines the confidence logic. Decision 14 adds nothing that isn't in Section 6. Remove Decision 14 as a standalone entry. |
| **`checklistConfidence` alongside `classification.confidence`** | Section 1.1 | Two parallel confidence systems for the same thing. Remove `checklistConfidence` when adding `classification`. |
| **Ambiguity section with only 10 cases** | Section 4.2 | 10 cases is not comprehensive enough for a "decision engine." Either provide 50+ or remove the section and rely on the 140-example table. 10 cases give false confidence. |
| **`classification.detectionSignal` duplicating existing `detectionSignal`** | Section 6.6 | The existing `detectionSignal` field already captures what signal triggered the type. Adding `classification.detectionSignal` duplicates this. Use only the existing field. |

### 3.4 Engineering Clarity

Could another engineer implement from this document alone?

**No.** An engineer would need to guess:
1. Where exactly `classification` is populated (in the parser? in CaptureService?)
2. Whether `classification.confidence` replaces or supplements the existing `confidence` field
3. How the 4-tier mapping maps to the existing confidence score (Section 6.2 lists base scores, but the current code starts at 0.5 and adds bonuses — the mapping is unclear)
4. How the "save as Note" button label reaches the UI (no mechanism described)
5. Whether Note detection uses regex, a keyword list, or a third-party library

---

## Phase 4: Specification Review

### 4.1 Ambiguous Language

| Phrase | Location | Problem |
|---|---|---|
| "Presence of passive verbs (is, are, was, were, seems, feels)" | Decision 6, Inputs considered | The document claims this is an input, but provides no detection mechanism. Is it an exhaustive list? Partial? How many passive verbs trigger Note vs stay as Task? |
| "Prefer Task over Note when there is any reasonable action interpretation" | Decision 6, Tie-breaking | Entirely subjective. What counts as "reasonable"? Different engineers will implement different thresholds. |
| "The parser should be biased toward actionability" | Decision 6, Tie-breaking | Aspirational but not testable. Define "actionability" or remove. |
| "If both scores are 0 (no distinguishing keywords), default to task" | Decision 8, Fallback | Correct but not stated in the document. The current code defaults to `type = "task"` when no recurrence detected AND when both scores are 0. |
| "Score ≥ 70: auto-assign with High Match confidence" | Decision 15, Tie-breaking | What does "auto-assign" mean? Change workspace silently? Show a toast? The current code sets `selectedWorkspaceId` and `topSuggestion`, but doesn't actually move the entity. |

### 4.2 Requirements That Cannot Be Tested

| Requirement | Why Untestable |
|---|---|
| "Prefer Task over Note when there is any reasonable action interpretation" | Subjective. No engineer can write a deterministic test for "reasonable." |
| "The parser should be biased toward actionability" | No measurable definition of "actionability bias." |
| "Strong daily recurrence (habit) > single date (task)" | Rule P7 says this, but provides no threshold. What makes a recurrence "strong"? |
| "User must confirm before save" (Unknown confidence) | Describes UI behavior that doesn't exist. Until the UI is built, this can't be tested. |
| "Do not auto-save" (Uncertain, Case A) | The document says "Do not auto-save" for "Gym" (Case A), but the current code auto-saves everything. This is a product requirement with no acceptance criteria. |

### 4.3 Implementation Details Leaking into Product Requirements

| Leak | Location | Issue |
|---|---|---|
| `classification: { suggested, confidence, detectionSignal? }` | Section 6.6 | This is an implementation detail of the ParsedProductivityItem type, not a product requirement. The product spec should say "Users should see a confidence indicator" not "add a classification field." |
| `finalScore = baseScore + sum(bonuses)` | Section 6.3 | This is an implementation formula. A spec should say "Confidence increases with each detected signal" not provide arithmetic. |
| "Tuesday" maps to day index 2 | Recurrence Detection | Implementation detail. Spec should say "detect named days" not provide mappings. |

### 4.4 Requirements That Belong Elsewhere

| Requirement | Should Be In |
|---|---|
| Workspace suggestion behavior (score ≥ 70 auto-assign) | `workspace-suggestions.service.ts` design doc |
| Behavior suggestion (≥3 same title → convert to habit) | `suggestions.service.ts` design doc |
| Confidence UI treatment (green badge, amber badge) | Product design specs for UnifiedCapture |
| Chrono-node behavior | Library documentation, not product spec |

### 4.5 Missing Product Decisions

| Missing Decision | Why Needed |
|---|---|
| **What happens to attachments when confidence is Unknown?** | If "Passport" (confidence Unknown) becomes a Note, does the attachment survive? Currently attachments are set before parsing, but if the entity type changes post-hoc, attachments could be lost. |
| **Can users promote a Note to Task after save?** | If unknown inputs become Notes, users need a way to convert them to Tasks. This conversion path doesn't exist in the current UI. |
| **Should confidence tiers affect the undo behavior?** | Low-confidence saves are more likely to be undone. Should the undo duration be longer for Unknown-confidence saves? |
| **What is the migration path for existing entities?** | If the Unknown→Note override is implemented, existing ambiguous captures in users' task lists won't be affected. But new saves will behave differently. This inconsistency needs product sign-off. |
| **Should the Note detection heuristic be user-configurable?** | Power users may want to disable Note detection for their workflow. Should this be a setting? |

---

## Phase 5: Maintainability Review

### 5.1 Adding New Entity Types

If Pebble adds Events, Projects, Bookmarks, or Goals, the following would need to change:

| Entity Type | Changes Required | Pain Points |
|---|---|---|
| **Events** | New detection logic, new `buildEvent()` in EntityFactory, new case in CaptureService, new Repository, new `ParsedProductivityItem` type variant | The 7-type union in `ParsedProductivityItem["type"]` would expand to 8. Every switch-case on this type must be updated. |
| **Projects** | Detection logic (keyword "project"?), new entity construction, new storage | Projects typically contain sub-tasks. The current entity model has no parent-child relationship between Task and Project. |
| **Bookmarks** | Essentially a Link with richer metadata. Minor additions to existing Link detection. | Low pain. Link detection already handles URLs. |
| **Goals** | Detection logic (long-term vs action), potentially time-bounded, no current equivalent | High pain. The parser has no concept of "long-term" vs "actionable." New detection heuristics needed. |

### 5.2 Future Pain Points

**Pain Point 1: The 7-type union is brittle.**

```typescript
type: "task" | "habit" | "checklist" | "note" | "link" | "idea" | "file"
```

Every addition requires updating:
- The type union itself
- The `TYPE_META` constant in UnifiedCapture (label, icon, color)
- The `typeMap` in entity-factory
- The switch-case in CaptureService
- The `detectionSignal` union
- Every test that checks `.type`

**Recommendation:** Make `ParsedProductivityItem["type"]` extensible via a type registry, not a union. Or accept that adding a new type requires touching many files — and document every file that needs changing.

---

**Pain Point 2: Two save paths double maintenance.**

`CaptureService.saveParsedItem()` and `useTasksState.handleSaveParsedItem()` are independent implementations. Any change to entity construction logic (new field, new confidence check, new type) must be implemented in both places. This is the highest-risk architectural issue.

**Recommendation:** Deprecate `useTasksState.handleSaveParsedItem()`. Route all captures through CaptureService. This is a pre-existing gap, not a document issue, but the decision engine's reliance on CaptureService makes it critical.

---

**Pain Point 3: Heuristic scoring is fragile.**

The Habit vs Task heuristic (Decision 8) uses hardcoded scores (+4 for strong recurrence, +3 for health category, +4.5 for work keywords, etc.). These scores are arbitrary. Adding a new keyword (`"deploy" → work`) changes the behavior for all users.

The keyword-driven approach means the parser's behavior is a sum of individual keyword additions. Over time, as keywords accumulate (9 work keywords → 50+), the heuristic becomes harder to reason about.

**Recommendation:** Keep the heuristic but document the scoring weights explicitly in a configuration object. Don't bury weights in regex logic.

---

**Pain Point 4: `buildResource()` maps "file" → "note", losing type information.**

The `buildResource()` function maps `type: "file"` to `type: "note"` in the Resource entity. This means downstream consumers (ResourceRepository, resource list UI) cannot distinguish between a user-typed Note and a file attachment. If Pebble ever wants to show file attachments differently from notes, this mapping must change.

**Recommendation:** Either (a) add `"file"` to `ResourceType` union, or (b) use `attachments` presence as a proxy for "was a file." Option (a) is cleaner.

---

## Phase 6: QA Readiness

### 6.1 Deterministic Test Cases

**What CAN be tested deterministically:**

| Test Type | Example | Deterministic? |
|---|---|---|
| Parsing input → expected type | `parseProductivityText("Buy milk")` → type = "task" | ✅ Yes. Always the same result. |
| Parsing input → expected category | `parseProductivityText("Study React")` → category = "learning" | ✅ Yes. Keyword-based. |
| Parsing input → expected date | `parseProductivityText("tomorrow")` → date = specific YYYY-MM-DD | ⚠️ Partially. "tomorrow" depends on current date. Use relative-date assertions or mock `Date.now()`. |
| Parsing input → expected confidence | `parseProductivityText("Buy milk")` → confidence = 0.65 | ✅ Yes. |
| List with bullets → checklist | `parseProductivityText("- Milk\n- Bread")` → type = "checklist" | ✅ Yes. |
| URL detection | `parseProductivityText("https://example.com")` → type = "link" | ✅ Yes. |
| Entity construction | `buildTask(item, ws)` → Task with correct fields | ✅ Yes. Pure function. |

**What CANNOT be tested deterministically:**

| Test Type | Why Not |
|---|---|
| "Needs review?" flag for ambiguous cases | Document says "Needs review? Yes/No" (Section 8) but this is a UI concept, not a parser output. No code implements it. |
| Confidence tier (Certain/Likely/Uncertain/Unknown) | Not implemented. The parser outputs a number, not a tier. |
| Note detection ("Passport" → Note) | Not implemented. Parser outputs Task for single-word inputs. |
| "Save as Note" button label | UI behavior, not testable at unit level. |
| Auto-assign workspace (score ≥ 70) | The document says auto-assign, but the code only sets state, doesn't persist the workspace change. |

### 6.2 Measurable vs Subjective Requirements

**Measurable:**
- Type assignment (17 binary decisions defined in Section 1.1)
- Category, priority, date, time extraction (regex-based, deterministic)
- Recurrence detection (7 regex patterns, each testable)
- Habit/Task classification (scoring function, testable with known inputs)
- 140 examples in Section 8 (each makes a specific assertion)

**Subjective:**
- "Reasonable action interpretation" (Decision 6)
- "Strong daily recurrence" (Rule P7)
- "Biased toward actionability" (Decision 6 philosophy)
- "Do not auto-save" (Case A — no mechanism defined)
- "Prefers user's text over file name" (Rule P10 recommendation)

### 6.3 Test Coverage Gap

The existing test file (`nlpParser.test.ts`) has **6 test cases** for a ~300-line parser with ~17 decision points. The test coverage by decision:

| Decision | Tested? |
|---|---|
| D1: Empty input | ✅ 1 test |
| D2: URL detection | ❌ Not tested |
| D3: Checklist (bullets) | ❌ Not tested |
| D4: Checklist (short lines) | ❌ Not tested |
| D5: Idea keywords | ❌ Not tested |
| D6: Category detection | ✅ 6 assertions |
| D7: Recurrence detection | ✅ 8 assertions |
| D8: Habit vs Task | ✅ 8 assertions |
| D9: Priority detection | ✅ 3 assertions |
| D10: Reminder offset | ✅ 2 assertions |
| D11: Date/time extraction | ✅ 3 assertions (in title cleanup test) |
| D12: File attachment (entity factory) | ✅ 1 test |
| D13: Title cleanup | ✅ 3 assertions |
| D14: Default priority | ✅ Covered in priority test |
| D15: Metadata stripping | ❌ Not tested |
| D16: detection signal | ❌ Not tested |

The 140 examples in Section 8 of the decision engine could serve as a test specification — but currently none are automated.

---

## Phase 7: Engineering Readiness

### 7.1 Can an Engineer Implement from These Documents?

**No. The gaps are significant.**

| Gap | What's Missing | Impact |
|---|---|---|
| **No implementation plan** | The document says what to build but not how. No file-by-file plan, no dependency order, no implementation sequence. | Engineer must design the implementation themselves. High risk of missed dependencies. |
| **No API contract** | The `classification` field is mentioned but not fully specified. Is it part of `ParsedProductivityItem` or separate? What's the exact TypeScript type? | Engineer will guess the type shape. May need rework. |
| **No migration strategy** | Existing entities were saved without classification metadata. What happens when the code reads an old entity? | Engineer may add migration logic or may not. Undefined behavior for legacy data. |
| **No error handling** | What if confidence is NaN? What if Note detection throws? What if chrono crashes (current code has a try-catch but the document doesn't define error behavior)? | Engineer follows existing patterns (try-catch with null fallback). |
| **No performance budget** | Note detection (passive verb analysis) could be expensive with regex. No guidance on acceptable parse time. | Engineer may add heavy analysis that slows capture. |
| **No testing strategy** | The document doesn't specify how the 140 examples should be tested. Manually? Unit tests? Snapshot tests? | Engineer designs test strategy from scratch. |
| **No rollback plan** | If Unknown→Note override causes user complaints, how is it rolled back? Feature flag? Config? | No graceful degradation path. |

### 7.2 What an Engineer Would Have to Guess

1. **The exact shape of the `classification` field.** The document uses `classification.confidence` in Section 6.6 but doesn't define the full type.

2. **Where Note detection lives.** Does it go in the existing `parseProductivityText()` function (adding ~50 lines) or in a new function that wraps it?

3. **How the UI receives confidence tiers.** The parser outputs a number. The UI needs a qualitative tier. Does mapping happen in the parser, in CaptureService, or in the component?

4. **How "override dropdown shown by default" works.** Should the type dropdown be expanded when Unknown? Should it pulse? Should there be a confirmation dialog? The document says "shown prominently" but no spec.

5. **What "auto-save enabled" means for Uncertain confidence.** The document says auto-save is enabled but the user should review. Does the save happen on a timer? On button press? Both?

6. **Which repository gets the Unknown→Note entity.** If a Task becomes a Note, it goes to ResourceRepository instead of TaskRepository. Does the UI know to show it in the resources tab? What workspace does it go to? The document doesn't specify.

7. **How `useTasksState.handleSaveParsedItem()` is affected.** The document assumes all saves go through CaptureService, but the code has a second path. The engineer must either (a) update both paths or (b) refactor the second path away. The document doesn't mention this.

---

## Phase 8: Final Report

### 8.1 Strengths

1. **Thorough decision inventory (Phase 1).** The document correctly identifies every decision the parser makes, with accurate inputs, outputs, and priority ordering. An engineer can use this as a checklist during implementation.

2. **140-example table (Phase 8).** This is the most valuable part of the document. It provides a deterministic specification for parser behavior. If every example is turned into a unit test, the parser's behavior is fully specified.

3. **Precedence rules (Phase 5).** Rules P1–P10 address real ambiguity cases that developers encounter. Rule P5 (Checklist Containing Dates) and Rule P6 (Recurring Work Task) capture implementation subtleties that are otherwise easy to miss.

4. **Correct architectural boundaries.** The document correctly separates parser concerns from CaptureService concerns from UI concerns. Even where the code doesn't match, the separation is sound.

5. **Conservative ambiguity strategy.** "When uncertain, prefer storage over actionability" is a clear product philosophy that makes implementation decisions easier.

### 8.2 Weaknesses

1. **Misalignment with actual code.** The document describes behaviors (Note detection, confidence tiers, Unknown→Note override) that don't exist in the code. It presents them as current decisions when they are proposed features. This is the single biggest weakness — an engineer reading this would think the code does things it doesn't.

2. **Two save paths not acknowledged.** The document's architecture assumes a single entry point (CaptureService), but the code has two. Any design built on the single-entry assumption will fail when `useTasksState.handleSaveParsedItem()` behaves differently.

3. **Confidence model complexity.** Four tiers, two confidence fields (`confidence` + `classification.confidence`), score sources table, and a pipeline override. This is more complex than needed. Two tiers (Confident/Uncertain) with a single confidence field would cover the same use cases.

4. **No implementation sequence.** The document specifies WHAT but not WHEN or IN WHAT ORDER. This is acceptable for a design doc but insufficient for engineering handoff.

5. **Subjective test criteria.** "Reasonable action interpretation" and "biased toward actionability" are philosophy, not spec. They cannot be tested or QA-verified.

### 8.3 High-Priority Improvements

| # | Improvement | Impact | Effort |
|---|---|---|---|
| H1 | **Acknowledge two save paths.** Update the document's pipeline to show both `CaptureService` and `useTasksState.handleSaveParsedItem()`. Specify which confidence behavior applies to each. | Prevents design collapse | Low |
| H2 | **Remove Note detection from current decisions.** Move it to a "Proposed Features" appendix. Don't pretend it exists. | Eliminates engineer confusion | Low |
| H3 | **Reduce confidence to 2 tiers.** Change from 4 tiers (Certain/Likely/Uncertain/Unknown) to 2: Confident (≥0.60) and Uncertain (<0.60). Remove the `classification` field — use the existing `confidence` number directly. | Simplifies implementation 50% | Low |
| H4 | **Define the `classification` type or remove it.** If keeping it, provide the exact TypeScript type. If removing it, specify how the existing `confidence` field is used for tier mapping. | Resolves ambiguity | Low |
| H5 | **Replace subjective criteria with objective thresholds.** Change "reasonable action interpretation" to "if any action verb in actionVerbs list is present in the first 3 words." | Makes spec testable | Medium |

### 8.4 Medium-Priority Improvements

| # | Improvement | Impact | Effort |
|---|---|---|---|
| M1 | **Remove File Attachment from parser decisions.** File attachment is a UI action, not a parser decision. Document it in the UI flow. | Cleaner separation | Low |
| M2 | **Merge D3 and D4 into "Checklist Detection" with High/Medium outcomes.** Same decision at two confidence levels. | Reduces decision count from 17 to 15 | Low |
| M3 | **Add a test specification section.** Map the 140 examples to a test plan: "For input X, assert type=Y, confidence=Z, category=W." | Enables QA automation | Medium |
| M4 | **Remove the 10-case ambiguity section or expand to 50+.** 10 cases provide false completeness. Either remove or expand. | Eliminates false confidence | Medium |
| M5 | **Document the file attachment → Note mapping gap.** Acknowledge that `"file"` type becomes `"note"` Resource, and decide whether to add `"file"` to `ResourceType`. | Prevents future data model issues | Low |

### 8.5 Low-Priority Improvements

| # | Improvement | Impact | Effort |
|---|---|---|---|
| L1 | **Remove D14 (Confidence Assignment) as a separate decision.** It's covered by Section 6. | Reduces document length | Low |
| L2 | **Clarify that `detectionSignal` already exists.** Don't propose adding it — it's already in the code. | Eliminates confusion | Low |
| L3 | **Fix confidence scores in examples table.** Ensure each example's confidence score correctly matches the scoring model (base + bonuses). Currently some may be inconsistent. | Prevents test failures | High (140 entries) |
| L4 | **Add an appendix on entity migration.** Explain what happens to existing captures when the new confidence behavior is deployed. | Prevents data loss | Medium |

### 8.6 Technical Debt Remaining

| Debt | Location | Priority |
|---|---|---|
| `useTasksState.ts` imports `ParsedProductivityItem` and has its own save logic | `features/tasks/hooks/useTasksState.ts` (line 30, lines 517-722) | **Critical** — two save paths |
| `buildResource()` maps "file" → "note" | `features/capture/services/entity-factory.service.ts` (typeMap) | Medium — data model mismatch |
| Confidence is a raw number with no qualitative mapping | `nlp-parser.service.ts` | Low — works but limited |
| No passive content analysis exists | Nowhere | Medium — feature gap |
| 5 legacy body field formats checked in `normalizeResource()` | `repositories/ResourceRepository.ts` (lines 30-60) | Low — works but fragile |

### 8.7 Product Debt Remaining

| Debt | Description | Priority |
|---|---|---|
| No way to convert a Resource (Note) to a Task after save | If Unknown→Note is implemented, users need a promotion path | **High** — affects user workflow |
| No confidence indicator in current UI | Users can't see how certain the parser is | Medium — nice to have |
| No "review this capture" flow | Uncertain captures have no dedicated review step | Medium — product feature gap |
| File type disappears in storage | "File" badge shown but entity is stored as "Note" | Low — cosmetic mismatch |

### 8.8 Documentation Debt Remaining

| Debt | Description | Priority |
|---|---|---|
| ADR and Implementation Blueprint are stale | Contain recommendations not followed by code | **High** — should be archived or updated |
| Decision engine's Phase 1 section conflates current decisions with proposed features | Engineer cannot distinguish "what exists" from "what's proposed" | **High** — causes implementation errors |
| No implementation plan or PR sequence | Engineer starting today has no order of operations | **High** — blocks engineering handoff |
| No test specification | 140 examples not tied to test assertions | Medium |
| UI behavior specs embedded in parser document | Confidence badge colors, save button labels — belong in UI design docs | Low |

---

## Summary

| Category | Verdict |
|---|---|
| **Is the decision engine internally consistent?** | Mostly. 3 contradictions found (empty input path, confidence threshold utility, Note detection ordering). All resolvable. |
| **Does it match the current code?** | **No, significantly.** ~30% of described behaviors don't exist in code. The document describes a future state as if it's current. |
| **Is the architecture sound?** | The **single-entry principle** is sound, but the code has **two entry points**. Until `useTasksState.ts` is refactored, any design built on this assumption will be incomplete. |
| **Is it maintainable for 3 years?** | The heuristic scoring and 7-type union are brittle but workable. Adding entity types will require touching many files. |
| **Can QA derive tests?** | Partially. The 140 examples are testable. The subjective criteria ("reasonable," "biased toward actionability") are not. |
| **Can an engineer implement from this alone?** | **No.** 7 critical gaps remain (implementation plan, API contract, migration strategy, UI specification, two-save-path resolution, error handling, performance budget). |
| **Is Smart Capture ready to be a stable product foundation?** | **Not yet.** The existing code works and handles known inputs well. But the proposed enhancements (confidence tiers, Note detection, Unknown→Note override) require significant architectural alignment before they can be safely added. The highest-risk item is the dual save path — until resolved, any CaptureService changes are fragile. |

### Final Verdict

**The decision engine is a good design document with serious implementation gaps.** It correctly identifies what the parser does today and proposes a reasonable decision model. But it fails to distinguish between current behavior and proposed changes, and it ignores the dual-save-path problem that undermines its core architectural assumption.

**Immediate actions recommended:**
1. Archive the ADR and Implementation Blueprint as superseded
2. Remove proposed features from the "Current Decisions" section
3. Add a "Current Architecture Gaps" section acknowledging the two save paths
4. Replace 4-tier confidence with 2-tier (Confident/Uncertain)
5. Produce a file-by-file implementation plan before any code changes start
