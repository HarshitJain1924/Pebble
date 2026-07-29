# Pebble Smart Capture — Decision Engine

> **Status:** Design Document  
> **Date:** July 2026  
> **Author:** Product Architecture & NLP Systems  
> **Applies to:** `features/capture/services/nlp-parser.service.ts`, `features/capture/services/CaptureService.ts`, `features/capture/services/entity-factory.service.ts`  
> **Supersedes:** All prior implicit parser behavior. This document is the single source of truth for how user input becomes a Pebble entity.

---

## Table of Contents

1. [Current Parser Decisions (Phase 1)](#1-current-parser-decisions)
2. [Decision Hierarchy (Phase 2)](#2-decision-hierarchy)
3. [Decision Definitions (Phase 3)](#3-decision-definitions)
4. [Ambiguity Handling (Phase 4)](#4-ambiguity-handling)
5. [Precedence Rules (Phase 5)](#5-precedence-rules)
6. [Confidence Behavior (Phase 6)](#6-confidence-behavior)
7. [Decision Tree (Phase 7)](#7-decision-tree)
8. [Ambiguous Examples Table (Phase 8)](#8-ambiguous-examples-table)

---

## 1. Current Parser Decisions

### 1.1 Complete Decision Inventory

Below is every decision the parser (`nlp-parser.service.ts`, `parseProductivityText()`) currently makes, ordered by execution within the function. Each entry is a standalone decision point with its own inputs, logic, and outputs.

| # | Decision | Input Signal | Possible Outputs | Current Confidence | Priority |
|---|---|---|---|---|---|
| D1 | **Is the input empty?** | `text === "" \|\| text.trim() === ""` | Task with empty title, confidence 0.1 | N/A | Highest — gate check |
| D2 | **Does the input contain a URL?** | Regex: `https?://\|www.\|domain.tld` | type = "link", url extracted, title = remaining text or domain | 0.90 | Runs before all type decisions |
| D3 | **Is the input a bullet/numbered checklist?** | Lines ≥ 2, lines start with `-`, `*`, `•`, or `\d+.` | type = "checklist", items extracted, title = first line or "Checklist" | 0.85 (bullets), 0.65 (no bullets) | Second type check |
| D4 | **Is the input a short-line checklist?** | Lines ≥ 3, each < 60 chars, no bullets | type = "checklist", items = all lines, title = first line or "List" | 0.65 | Continuation of D3 |
| D5 | **Does the input start with an idea keyword?** | Starts with `idea:`, `thought:`, `concept:`, `what if` | type = "idea", title = text after keyword | 0.70 | Third type check |
| D6 | **Which category does the input belong to?** | Keyword match against CATEGORY_MAP (7 categories) | category ∈ {work, personal, health, learning, creative, focus} or undefined | +0.15 | After type detection |
| D7 | **Does the input contain a recurrence pattern?** | Regex: `every X hours/days`, `daily`, `weekly`, `monthly`, `weekdays`, `weekends`, specific day names | recurrence object with type, interval, unit, days | +0.15 | Before habit/task split |
| D8 | **Is the recurring item a habit or a task?** | Heuristic scoring: habitScore vs taskScore from keywords + category + recurrence | type = "habit" or "task" | Varies (score-based) | Based on D7 result |
| D9 | **Does the input contain a reminder offset?** | Regex: `remind/alert me X minutes/hours before` | reminderOffsetMinutes | +0.10 | After recurrence |
| D10 | **Does the input contain a priority keyword?** | Keyword match against PRIORITY_MAP (3 levels) | priority ∈ {high, medium, low} | +0.15 | After reminder |
| D11 | **Does the input contain a date via chrono?** | chrono-node library parsing | date string (YYYY-MM-DD), time string (HH:MM) | +0.15 | After priority |
| D12 | **Does the input contain "today" or "tomorrow"?** | Regex | date = today or tomorrow | +0.10 | Fallback to D11 |
| D13 | **What is the final title?** | Remove date/time/keyword text, capitalize | Cleaned title string | N/A | After all extractions |
| D14 | **What is the default priority?** | No priority detected | priority = "medium" | N/A | Fallback |
| D15 | **Should metadata be stripped for non-task types?** | type ∈ {link, idea, checklist} | Strip date, time, category, priority, recurrence, reminder | N/A | Before return |
| D16 | **What is the detection signal?** | No signal detected + type = task | detectionSignal = "default_task" | N/A | Before return |

### 1.2 Decisions Made Outside the Parser

| # | Decision | Location | Input | Output |
|---|---|---|---|---|
| D17 | **Which workspace should this entity go to?** | `workspace-suggestions.service.ts` | title, category, history | workspaceId suggestion with score (0-100) |
| D18 | **Should this task be suggested as a habit?** | `suggestions.service.ts` | Creation history (≥3 same title) | SmartSuggestion: convert_habit or recurring_schedule |
| D19 | **What entity type should be saved?** | `CaptureService.ts` | parsedItem.type → switch/case | Entity constructor call |

### 1.3 Gaps in Current Decision Coverage

| Gap | Description | Impact |
|---|---|---|
| **No unknown detection** | All inputs are assigned a type. No "I don't know" signal. | Ambiguous inputs default to Task |
| **No confidence threshold** | Even confidence 0.1 passes through as Task | Every capture creates an entity |
| **No user review trigger** | No mechanism to ask users to confirm low-confidence decisions | Users must manually correct type |
| **No duplicate detection at capture time** | Suggestions engine catches repeats post-hoc (≥3 times) | First two duplicates create duplicate tasks |
| **No single-line checklist detection** | "Buy milk, eggs, bread" stays as Task | Common checklist pattern missed |
| **No time-only extraction without date** | "meeting at 5pm" → time extracted but no date unless "today/tomorrow" | Time without date works but is fragile |
| **No parenthetical note extraction** | "Research (notes from meeting)" → title includes parentheses | Cluttered titles |
| **No attachment→entity mapping** | File attachments set type to "file" but entity becomes Resource | Works, but no dedicated file entity |

---

## 2. Decision Hierarchy

The hierarchy defines the order in which questions are asked. Each decision is gated by the previous one. Once a high-confidence decision is reached, lower-priority decisions only refine metadata, not the entity type.

```
                    RAW INPUT TEXT
                          │
                          ▼
               ┌─────────────────────┐
               │  IS INPUT EMPTY?    │──── Yes ──→ Return default Task (confidence 0.1)
               └─────────┬───────────┘
                         │ No
                         ▼
               ┌─────────────────────┐
          ┌────│  EXPLICIT SIGNAL?   │
          │    └─────────┬───────────┘
          │              │
          │        ┌─────┴──────┐
          │        ▼            ▼
          │    YES (type       NO
          │     is set)        │
          │                    ▼
          │          ┌─────────────────────┐
          │     ┌────│  IS IT A URL?       │──── Yes ──→ type = LINK (confidence 0.9)
          │     │    └─────────┬───────────┘
          │     │              │ No
          │     │              ▼
          │     │    ┌─────────────────────┐
          │     │    │  IS IT A            │
          │     │    │  MULTILINE          │──── Yes ──→ type = CHECKLIST (confidence varies)
          │     │    │  CHECKLIST?         │
          │     │    └─────────┬───────────┘
          │     │              │ No
          │     │              ▼
          │     │    ┌─────────────────────┐
          │     │    │  HAS IDEA           │
          │     │    │  KEYWORD?           │──── Yes ──→ type = IDEA (confidence 0.7)
          │     │    └─────────┬───────────┘
          │     │              │ No
          │     │              ▼
          │     │    ┌─────────────────────┐
          │     │    │  HAS FILE           │
          │     │    │  ATTACHMENT?        │──── Yes ──→ type = FILE (confidence 0.95)
          │     │    └─────────┬───────────┘
          │     │              │ No
          │     │              ▼
          │     │    ┌─────────────────────┐
          │     │    │  IS IT A NOTE?      │
          │     │    │  (passive content,  │──── Yes ──→ type = NOTE (confidence 0.6)
          │     │    │   no action verb)   │
          │     │    └─────────┬───────────┘
          │     │              │ No
          │     │              ▼
          │     │    ┌─────────────────────┐
          │     │    │  HAS RECURRENCE?    │
          │     │    └─────────┬───────────┘
          │     │              │
          │     │        ┌─────┴──────┐
          │     │        ▼            ▼
          │     │      YES           NO
          │     │        │            │
          │     │        ▼            ▼
          │     │  ┌──────────┐  ┌──────────┐
          │     │  │ HABIT    │  │ DEFAULT  │
          │     │  │ OR TASK? │  │ TASK     │
          │     │  └────┬─────┘  └──────────┘
          │     │       │
          │     │   ┌───┴────┐
          │     │   ▼        ▼
          │     │  HABIT    TASK
          │     │
          │     ▼
          │   ┌─────────────────────────────────────┐
          │   │         METADATA EXTRACTION          │
          │   │  (applies to all types)              │
          │   │                                      │
          │   │  1. Category detection               │
          │   │  2. Priority detection               │
          │   │  3. Date extraction (chrono)         │
          │   │  4. Time extraction                  │
          │   │  5. Reminder offset parsing          │
          │   │  6. Title cleanup                    │
          │   └─────────────────────────────────────┘
          │                      │
          │                      ▼
          │           ┌─────────────────────┐
          │           │  CONFIDENCE CHECK    │
          │           │  ≥ 0.8 ? → Certain   │
          │           │  ≥ 0.6 ? → Likely    │
          │           │  ≥ 0.4 ? → Uncertain │
          │           │  < 0.4 ? → Unknown   │
          │           └─────────┬───────────┘
          │                     │
          ▼                     ▼
    ┌──────────────────────────────────────────────────┐
    │              FINAL ENTITY DECISION                │
    │                                                   │
    │  Confidence = "Certain" or "Likely"               │
    │    → Use parser's type suggestion                 │
    │                                                   │
    │  Confidence = "Uncertain" or "Unknown"            │
    │    → Show type override in UI, let user decide    │
    │    → Default to NOTE if user dismisses            │
    └──────────────────────────────────────────────────┘
```

### 2.1 Hierarchy Rules

1. **Explicit signals win.** URL pattern, file attachment, idea keyword — these override all other type detections because they are unambiguous.
2. **Structure wins over semantics.** Multiline checklist detection runs before natural language analysis because the structure is machine-detectable with high confidence.
3. **Recurrence is a secondary signal.** It refines Task→Habit but does not override an explicit type.
4. **Metadata never changes type.** Category, priority, date, time, reminder — these enrich an entity but never cause a type change after the initial decision.
5. **Low confidence is an explicit output.** If no decision reaches minimum confidence, the engine outputs `type = "note"` with `confidence = "unknown"` rather than guessing.

---

## 3. Decision Definitions

### Decision 1: Empty Input Check

| Attribute | Value |
|---|---|
| **Purpose** | Prevent parsing of empty or whitespace-only input |
| **Inputs considered** | `text` length after trim |
| **Possible outputs** | ParsedProductivityItem with empty title, type = "task", confidence = 0.1 |
| **Priority over others** | Highest. No other decision runs if input is empty. |
| **Tie-breaking rules** | Not applicable — binary check |
| **Fallback behavior** | Return empty task. UI shows disabled save button. |
| **User visibility** | Invisible. No type badge shown. |
| **Examples** | `""` → empty task; `"   "` → empty task |

---

### Decision 2: URL Detection

| Attribute | Value |
|---|---|
| **Purpose** | Detect web links and save them as Link resources |
| **Inputs considered** | Presence of URL pattern: scheme (https?://), www. prefix, or common TLD (.com, .org, .net, etc.) followed by a path |
| **Possible outputs** | type = "link", extracted URL, title = remaining text or domain name |
| **Priority over others** | **Highest type override.** If a URL is found, all other type detections (checklist, idea, recurrence, etc.) are skipped. Only file attachment outranks URL detection (when both file and URL are present — edge case). |
| **Tie-breaking rules** | If a URL is inside a longer text, the URL is extracted, and the remaining text becomes the title. If only a URL, the domain name becomes the title. |
| **Fallback behavior** | URL detection is regex-based. If regex fails (unusual URL format), it falls through to default Task. |
| **User visibility** | Type badge shows "Link". URL subtitle shown in card. |
| **Examples** | `"https://github.com/pebble"` → Link with title "github.com"; `"Read this https://example.com/article"` → Link with title "Read this" |

---

### Decision 3: Checklist Detection

| Attribute | Value |
|---|---|
| **Purpose** | Detect structured lists from multiline input |
| **Inputs considered** | Number of lines (≥2), line prefixes (bullets, numbers, dashes), line lengths |
| **Possible outputs** | type = "checklist", items array, confidence = 0.85 (bullets) or 0.65 (short lines), title = first labeling line or "Checklist"/"List" |
| **Priority over others** | Runs after URL detection. If URL is detected, checklist detection is skipped completely. Outranks idea keywords and all semantic analysis. |
| **Tie-breaking rules** | **High confidence (bullets):** If ≥2 lines start with `-`, `*`, `•`, or `\d+.`, treat as checklist. First non-bullet line is title.  
| | **Medium confidence (short lines):** If ≥3 lines, each <60 chars, no bullet prefix, treat as checklist. If first line ends with `:` or is <30 chars, treat as title; otherwise generate title "List". |
| **Fallback behavior** | If neither condition is met, falls through to idea keyword detection |
| **User visibility** | **Medium confidence:** UI shows a suggestion banner: "Looks like a checklist ✓" with "Create as List" button. The user must confirm.  
| | **High confidence:** Checklist type badge shown automatically. |
| **Examples** | `"- Milk\n- Bread\n- Eggs"` → Checklist (high confidence); `"Buy milk\nBuy bread\nCall mom"` → Checklist (medium confidence, "List" title); `"Buy milk, eggs, and bread"` → NOT a checklist (single line, falls to Task) |

---

### Decision 4: Idea Keyword Detection

| Attribute | Value |
|---|---|
| **Purpose** | Capture raw ideas, thoughts, and concepts |
| **Inputs considered** | Natural idea prefixes: `idea:`, `idea `, `thought:`, `thought `, `what if `, `concept:`, `concept ` |
| **Possible outputs** | type = "idea", title = text after keyword, confidence = 0.7 |
| **Priority over others** | Runs after checklist detection. Only runs if type is still "task". Outranks recurrence analysis and habit detection. |
| **Tie-breaking rules** | If input matches both idea keywords AND contains recurrence (e.g., "Idea: journal every day"), the idea keyword wins. The recurrence is still parsed as metadata on the Resource entity. |
| **Fallback behavior** | If no idea keyword, falls through to attachment check |
| **User visibility** | Type badge shows "Idea" |
| **Examples** | `"idea: app that tracks water intake"` → Idea; `"what if we had dark mode"` → Idea; `"thought: this could work"` → Idea |

---

### Decision 5: File Attachment Check

| Attribute | Value |
|---|---|
| **Purpose** | Handle user-attached files from the document picker |
| **Inputs considered** | Presence of attachment metadata (name, URI, mimeType, size) passed alongside text |
| **Possible outputs** | type = "file", title = file name, attachments array, confidence = 0.95 |
| **Priority over others** | This is typically set programmatically by the file picker handler, not by the parser. When set, it overrides all other type decisions. |
| **Tie-breaking rules** | If user types text AND attaches a file, the file type wins. The text is stored as the title description. |
| **Fallback behavior** | If attachment fails to load or is removed, type reverts to "task" |
| **User visibility** | Type badge shows "File". File preview card shown with name and size. |
| **Examples** | File picker selected "project-spec.pdf" → File; Drag-and-drop image → File |

---

### Decision 6: Note Detection

| Attribute | Value |
|---|---|
| **Purpose** | Identify passive, reference-oriented content that is not actionable |
| **Inputs considered** | Presence of passive verbs (is, are, was, were, seems, feels), lack of active verbs (do, make, get, buy, call, submit), italics or quotes suggesting a citation, no structured patterns (URL, checklist, idea keyword) |
| **Possible outputs** | type = "note", confidence = 0.4–0.6 (varies by number of passive signals detected) |
| **Priority over others** | Runs after all explicit-type checks (URL, checklist, idea, file) but before recurrence analysis. Only triggers when the type is still "task" and confidence is low. |
| **Tie-breaking rules** | Prefer Task over Note when there is any reasonable action interpretation. The parser should be biased toward actionability. |
| **Fallback behavior** | If no note signal detected, falls through to default Task |
| **User visibility** | Type badge shows "Note". Will often appear in low-confidence scenarios. |
| **Examples** | `"The sky is blue on Mars"` → Note (statement, not actionable); `"Notes from meeting with client"` → Note; `"Quote from Atomic Habits: '1% better every day'"` → Note |

---

### Decision 7: Recurrence Detection

| Attribute | Value |
|---|---|
| **Purpose** | Identify frequency patterns for recurring tasks and habits |
| **Inputs considered** | Keywords: `every X hours/days`, `every morning/evening`, `daily`, `weekly`, `monthly`, `weekdays`, `weekends`, specific day names (`every Monday and Thursday`), `hourly` |
| **Possible outputs** | Recurrence object with type (daily, weekdays, weekly, monthly, interval), interval, unit, days, dayOfMonth |
| **Priority over others** | Runs after all explicit-type decisions. Only applies when type is still "task". |
| **Tie-breaking rules** | Interval patterns (`every X hours`) → `type = "interval"`  
| | Day patterns (`every Monday`) → `type = "weekly"` with days array  
| | `weekdays` → `type = "weekdays"` with days [1,2,3,4,5]  
| | `every morning` → `type = "daily"` with time 08:00  
| | `every evening` → `type = "daily"` with time 18:00  
| | If multiple conflicting patterns exist (e.g., "every day every 2 hours"), the last matched pattern wins. |
| **Fallback behavior** | If no recurrence pattern found, entity remains non-recurring Task |
| **User visibility** | Recurrence label shown in summary card (e.g., "Daily", "Mon, Wed, Fri", "Every 2 hours") |
| **Examples** | `"every day"` → daily; `"every Monday and Thursday"` → weekly [1,4]; `"every month on the 15th"` → monthly day 15; `"every 3 hours"` → interval 3 hours |

---

### Decision 8: Habit vs Task Classification

| Attribute | Value |
|---|---|
| **Purpose** | Distinguish recurring routines (habits) from one-off or irregular recurring tasks |
| **Inputs considered** | Recurrence strength + category + habit/recurrence keywords vs work/deadline keywords |
| **Possible outputs** | type = "habit" or type = "task" (with recurrence) |
| **Priority over others** | Only runs if recurrence was detected (Decision 7). This is a tie-breaker within the "task" type. |
| **Tie-breaking rules** | **Habit score (scale 0–15):**  
| | - Strong recurrence (`every day`, `daily`, `every morning`, `weekdays`) → +4  
| | - Category = health → +3  
| | - Habit keywords (read, journal, meditate, water, gym, workout, run, walk, stretch, yoga, swim, drink, brush) → +3 each  
| |  
| | **Task score (scale 0–15):**  
| | - Category = work or creative or focus → +2  
| | - Work phrases ("call client", "call meeting", "submit") → +4.5  
| | - Work keywords (submit, client, meeting, project, assignment, report, presentation, deadline) → +4.5 each  
| |  
| | If habitScore > taskScore → type = "habit"  
| | If taskScore ≥ habitScore → type = "task" (with recurrence) |
| **Fallback behavior** | If both scores are 0 (no distinguishing keywords), default to task |
| **User visibility** | Type badge shows either "Habit" or "Task". Recurrence label shown regardless. |
| **Examples** | `"Gym every day at 7am"` → Habit (health + daily + gym keyword); `"Submit report every month on the 15th"` → Task (work + submit keyword); `"Every Monday meeting"` → Task (work + meeting) |

---

### Decision 9: Category Detection

| Attribute | Value |
|---|---|
| **Purpose** | Assign a contextual category to help organize entities in workspaces |
| **Inputs considered** | Keyword matching against CATEGORY_MAP (6 categories × 5–15 keywords each) |
| **Possible outputs** | category ∈ {work, personal, health, learning, creative, focus} or undefined |
| **Priority over others** | Runs after type decisions but before all other metadata extraction. Adds +0.15 to overall confidence. |
| **Tie-breaking rules** | First category match wins (iterate through CATEGORY_MAP in order). If multiple matches across categories, the first one found is used. |
| **Fallback behavior** | If no category keyword matches, category remains undefined |
| **User visibility** | Category label shown in details panel. Affects workspace suggestion. |
| **Examples** | `"Study React"` → learning; `"Gym"` → health; `"Client meeting"` → work; `"Buy groceries"` → personal |

---

### Decision 10: Priority Detection

| Attribute | Value |
|---|---|
| **Purpose** | Surface the urgency of a task from natural language |
| **Inputs considered** | Keywords: high (urgent, asap, important, critical), medium (normal, standard), low (later, someday, optional, lowkey) |
| **Possible outputs** | priority ∈ {high, medium, low} |
| **Priority over others** | Runs after category. Adds +0.15 to overall confidence. |
| **Tie-breaking rules** | First priority match wins. High → Medium → Low check order. |
| **Fallback behavior** | If no priority keyword found, defaults to "medium" |
| **User visibility** | Priority label shown in details panel. Color-coded (red, amber, green). |
| **Examples** | `"Urgent client meeting"` → high; `"Optional reading"` → low; `"Gym at 7am"` → medium (default) |

---

### Decision 11: Date & Time Extraction

| Attribute | Value |
|---|---|
| **Purpose** | Extract temporal context from natural language using chrono-node |
| **Inputs considered** | Relative dates (today, tomorrow, next week, in 3 days), absolute dates (July 15, 2026-07-15), times (at 5pm, at 14:30, noon, midnight), day names (Friday) |
| **Possible outputs** | date string (YYYY-MM-DD), time string (HH:MM) |
| **Priority over others** | Runs after priority. Adds +0.15 to overall confidence. |
| **Tie-breaking rules** | chrono-node: first parsed date/time result wins. If chrono fails, fallback to "today"/"tomorrow" regex.  
| | For tasks: date is extracted (without time) or date+time.  
| | For resources (link, note, idea) and checklists: date and time are NOT extracted (stripped). |
| **Fallback behavior** | If chrono fails, fallback regex for "today" (+0.1) and "tomorrow" (+0.1). If no date found, no date assigned. |
| **User visibility** | Date and time labels shown in summary card. |
| **Examples** | `"tomorrow at 5pm"` → date = tomorrow's date, time = "17:00"; `"next Friday"` → date = next Friday; `"at noon"` → time = "12:00" |

---

### Decision 12: Reminder Offset Parsing

| Attribute | Value |
|---|---|
| **Purpose** | Schedule alerts relative to a task's timing |
| **Inputs considered** | Patterns: `remind/alert me X minutes/hours before` |
| **Possible outputs** | reminderOffsetMinutes (number) |
| **Priority over others** | Runs after date/time. Adds +0.1 to overall confidence. |
| **Tie-breaking rules** | If hours → multiply by 60. If minutes → use as-is. First match wins. |
| **Fallback behavior** | If no reminder pattern found, no reminder set |
| **User visibility** | Reminder info shown in details panel. |
| **Examples** | `"remind me 30 minutes before"` → 30; `"alert me 2 hours prior"` → 120 |

---

### Decision 13: Title Cleanup

| Attribute | Value |
|---|---|
| **Purpose** | Produce a clean, readable title by removing parsing artifacts |
| **Inputs considered** | Raw cleaned text after all keyword/date/time extractions |
| **Possible outputs** | Cleaned title string (capitalized first letter) |
| **Priority over others** | Last processing step before return |
| **Tie-breaking rules** | Remove leading/trailing prepositions (at, on, by, for, to, with, in). Collapse whitespace. Capitalize first letter. If result is empty, use original text. |
| **Fallback behavior** | If cleaned text is empty, fall back to original input |
| **User visibility** | Displayed as the entity's primary title |
| **Examples** | `"Study React tomorrow at 5pm urgent"` → "Study React"; `"at Gym"` → "Gym" |

---

### Decision 14: Confidence Assignment

| Attribute | Value |
|---|---|
| **Purpose** | Communicate how certain the parser is about its classification |
| **Inputs considered** | Cumulative confidence score from all detection steps |
| **Possible outputs** | Numeric (0.1–1.0) + qualitative label (Certain, Likely, Uncertain, Unknown) |
| **Priority over others** | Final calculation after all processing |
| **Tie-breaking rules** | See [Section 6: Confidence Behavior](#6-confidence-behavior) |
| **Fallback behavior** | Confidence floors at 0.1, caps at 1.0 |
| **User visibility** | Confidence badge shown in summary card (green ≥80%, amber ≥60%, not shown <60%) |

---

### Decision 15: Workspace Suggestion

| Attribute | Value |
|---|---|
| **Purpose** | Route the entity to the most appropriate workspace automatically |
| **Inputs considered** | Task title keywords, detected category, workspace names, selection history, topic matching |
| **Possible outputs** | WorkspaceId suggestion with score (0–100) and confidence label |
| **Priority over others** | Runs asynchronously after parsing, in the UI layer |
| **Tie-breaking rules** | Score ≥ 70: auto-assign with High Match confidence. Score 40–69: suggest but don't auto-assign. Score < 40: keep in Inbox. |
| **Fallback behavior** | If no workspace scores ≥ 70, entity stays in Inbox |
| **User visibility** | Workspace shown and cyclable in summary card. User can override. |

---

## 4. Ambiguity Handling

### 4.1 Ambiguity Resolution Strategy

Pebble follows a conservative ambiguity strategy: **When uncertain, prefer storage (Resource/Note) over actionability (Task/Habit).** This prevents inbox clutter and lets users actively decide to promote items to actionable types.

The decision engine uses a **tiered disambiguation** approach:

1. **Structural signals** (URLs, bullet lists, file attachments) → unambiguous, high confidence
2. **Semantic signals** (recurrence patterns, idea keywords, passive voice) → meaningful but may overlap
3. **Contextual signals** (category keywords, priority markers, time references) → supportive but not decisive
4. **Behavioral signals** (creation history, workspace association) → post-hoc, not real-time

### 4.2 Specific Ambiguity Cases

#### Case A: `"Gym"`

| Attribute | Value |
|---|---|
| **Possible interpretations** | Task (Go to gym), Habit (Workout routine), Note (Write about gym) |
| **Chosen interpretation** | Task (single non-recurring action) |
| **Why** | No recurrence keyword → not a Habit. Short, active noun → actionable as Task. Category detection ("gym" → health) confirms but doesn't override. |
| **Confidence level** | Uncertain (0.5). Only category keyword matched; no recurrence, no priority, no date. |
| **Should user review?** | Yes. UI should show the Task type and allow override to Habit. |
| **What the UI should do** | Show "Task" badge. Show health category. Show "Change type" option. Do not auto-save. |

---

#### Case B: `"Read Atomic Habits"`

| Attribute | Value |
|---|---|
| **Possible interpretations** | Task (read a specific book), Habit (daily reading), Note (book reference), Resource (book note) |
| **Chosen interpretation** | Task (single action with a specific book) |
| **Why** | "read" → habit keyword (+3 habit score), but no recurrence → not a Habit. "Read" is an action verb → more actionable than passive reference. Category = learning. |
| **Confidence level** | Likely (0.65). Category matched, action verb present, no date. |
| **Should user review?** | No. The Task interpretation is reasonable. User can change type if they intended a note. |
| **What the UI should do** | Show "Task" badge. Show learning category. Allow type override. |

---

#### Case C: `"Passport"`

| Attribute | Value |
|---|---|
| **Possible interpretations** | Task (renew passport), Note (passport number), Resource (passport scan), Idea (travel concept) |
| **Chosen interpretation** | Note (passive reference, no action verb) |
| **Why** | Single word. No action verb (no "renew", "get", "apply"). No category keyword matches. No recurrence. No structural signals. The note detection heuristic catches this: single-word passive input with zero actionable signals. |
| **Confidence level** | Unknown (0.3). Minimum confidence because no signal was detected. |
| **Should user review?** | Yes. The UI must show a type override prominently. |
| **What the UI should do** | Show "Note" badge. Display unknown confidence indicator. Auto-select Note type. Offer Task as primary override. |

---

#### Case D: `"Meeting tomorrow"`

| Attribute | Value |
|---|---|
| **Possible interpretations** | Task (attend meeting), Task with date (tomorrow), Calendar event |
| **Chosen interpretation** | Task with date = tomorrow, time = undefined |
| **Why** | "Meeting" → work category. "Tomorrow" → date extraction. No recurrence. Strong structural date signal. |
| **Confidence level** | Likely (0.75). Category + date = strong signal. |
| **Should user review?** | No. The interpretation is correct for most users. |
| **What the UI should do** | Show "Task" badge. Show "Tomorrow" date. Show work category. Offer time override. |

---

#### Case E: `"Project Alpha"`

| Attribute | Value |
|---|---|
| **Possible interpretations** | Task (work on Project Alpha), Note (reference material), Resource (project notes) |
| **Chosen interpretation** | Task (actionable reference to a project) |
| **Why** | "Project" → not in any category map directly. But "project" is a work-associated word. No recurrence. No passive signal. Single actionable noun phrase → Task. |
| **Confidence level** | Uncertain (0.5). No category, no date, no priority, no strong signal. |
| **Should user review?** | Yes. The intent is ambiguous — could be a note about the project. |
| **What the UI should do** | Show "Task" badge with low confidence indicator. Offer Note as primary override. |

---

#### Case F: `"Research React"`

| Attribute | Value |
|---|---|
| **Possible interpretations** | Task (research React), Note (research notes), Learning resource |
| **Chosen interpretation** | Task (action: "research" is an active verb) |
| **Why** | "research" → weakly active verb. "React" → learning category keyword. Active verb + category = Task. |
| **Confidence level** | Likely (0.65). Category matched, verb present. |
| **Should user review?** | No. Task is a reasonable default. User can change to Note if they intended reference. |
| **What the UI should do** | Show "Task" badge. Show learning category. Allow type override. |

---

#### Case G: `"Vacation"`

| Attribute | Value |
|---|---|
| **Possible interpretations** | Task (plan vacation), Note (vacation ideas), Time-off block |
| **Chosen interpretation** | Note (passive concept, no action verb) |
| **Why** | Single word. No action verb. No category keyword match. "Vacation" is a state/event, not an action. Note detection triggers. |
| **Confidence level** | Unknown (0.3). No signals detected. |
| **Should user review?** | Yes. UI must show type override. |
| **What the UI should do** | Show "Note" badge. Provide Task override option. Allow scheduling as time-off. |

---

#### Case H: `"Invoice #104"`

| Attribute | Value |
|---|---|
| **Possible interpretations** | Task (pay invoice), Resource (invoice document), Note (invoice reference) |
| **Chosen interpretation** | Task (reference to an actionable document) |
| **Why** | "Invoice" → implies action (pay, review, file). No passive signal. The hashtag pattern suggests a reference number, not a link. Category = work (by association). |
| **Confidence level** | Uncertain (0.5). "Work" category association is weak. No action verb explicitly present. |
| **Should user review?** | Yes. Could be either a task or a reference note. |
| **What the UI should do** | Show "Task" badge with uncertainty indicator. Offer Note as primary alternative. Show "work" category suggestion. |

---

#### Case I: `"Buy milk"`

| Attribute | Value |
|---|---|
| **Possible interpretations** | Task (buy milk), Checklist item (part of shopping list) |
| **Chosen interpretation** | Task (single-line shopping item) |
| **Why** | "Buy" → strong action verb → Task. Single line → not a checklist. Category = personal (by keyword "buy"). No recurrence. |
| **Confidence level** | Likely (0.65). Action verb + category + no ambiguity. |
| **Should user review?** | No. Clear intent. |
| **What the UI should do** | Show "Task" badge. Show personal category. Allow adding to shopping list workspace. |

---

#### Case J: `"Workout"`

| Attribute | Value |
|---|---|
| **Possible interpretations** | Task (do a workout), Habit (daily workout routine), Note (workout plan) |
| **Chosen interpretation** | Task (single action, no recurrence specified) |
| **Why** | "Workout" → health category. No recurrence keyword → not a Habit. Active noun → Task. |
| **Confidence level** | Uncertain (0.5). Category matched but no other signals. |
| **Should user review?** | Yes. The user likely intends a habit. |
| **What the UI should do** | Show "Task" badge. Show health category. Show a suggestion: "Make this a daily habit?" Offer one-tap conversion. |

---

## 5. Precedence Rules

### 5.1 Type Precedence (Highest to Lowest)

```
1. FILE              (programmatic attachment — user explicitly chose a file)
2. LINK              (URL pattern detected — unambiguous structure)
3. CHECKLIST         (multiline structural pattern detected)
4. IDEA              (idea keyword prefix detected)
5. NOTE              (passive content, no action signals)
6. HABIT             (recurrence + habit-leaning score)
7. TASK              (default — everything else)
```

### 5.2 Metadata Precedence

```
1. EXPLICIT TIME     (chrono-parsed time like "at 5pm") > IMPLIED TIME (like "every morning" → 08:00)
2. EXPLICIT DATE     (chrono-parsed date like "tomorrow") > NO DATE
3. EXPLICIT PRIORITY ("urgent" → high) > NO PRIORITY (→ medium default)
4. EXPLICIT CATEGORY (keyword match) > NO CATEGORY
5. REMINDER OFFSET   (explicit "30 minutes before") > NO REMINDER
```

### 5.3 Specific Precedence Rules

#### Rule P1: Date vs Recurrence

**Rule:** When both a specific date AND a recurrence pattern are present, the date applies to the first occurrence. The recurrence applies to all subsequent occurrences.

**Example:** `"Gym every day starting tomorrow"` → date = tomorrow, recurrence = daily  
**Behavior:** First scheduled instance is tomorrow. Subsequent days follow daily recurrence.

**Conflict case:** If "tomorrow" and "every day" both appear, both are extracted. The title removes both.

---

#### Rule P2: Reminder vs Time

**Rule:** The reminder offset is relative to the parsed time. If both a reminder offset and a time are present, the reminder triggers before the time.

**Example:** `"Meeting at 5pm and remind me 30 minutes before"` → time = 17:00, reminder = 16:30

**Conflict case:** If reminder is requested but no time is parsed, the reminder cannot be scheduled. The parser still records the offset but CaptureService does not schedule it.

**Behavior:** `"Remind me 30 minutes before"` (no time) → reminderOffsetMinutes = 30, no reminder scheduled (triggerAt cannot be computed).

---

#### Rule P3: Idea Keyword vs Checklist

**Rule:** Idea keywords outrank checklist detection. If input starts with "idea:" and has multiple lines, it is an Idea, not a Checklist.

**Example:** `"idea: app features\n- push notifications\n- dark mode\n- widgets"` → Idea (not Checklist)  
**Behavior:** The idea keyword shunts the input to the resource path before checklist detection runs.

**Rationale:** The explicit prefix `"idea:"` is a stronger signal than the structural bullet pattern because the user consciously typed the prefix.

---

#### Rule P4: URL Inside a Note

**Rule:** If a URL is present, the input is always classified as Link, regardless of surrounding text.

**Example:** `"Check out this cool article https://example.com"` → Link  
**Behavior:** URL pattern detection runs first and short-circuits all other type detection.

**Edge case:** If text contains both a URL and explicit idea/note keywords, URL still wins.

**Rationale:** A URL is the strongest structural signal. Users can change the type after parsing.

---

#### Rule P5: Checklist Containing Dates

**Rule:** Date/time extraction does NOT run on checklists. The items are treated as text.

**Example:** `"- Buy milk tomorrow\n- Meeting at 5pm\n- Call mom"` → Checklist with items ["Buy milk tomorrow", "Meeting at 5pm", "Call mom"]  
**Behavior:** Metadata stripping for checklists removes date/time/priority. Items are preserved verbatim.

**Rationale:** In a checklist, each item may have its own timing. Applying a single date/time to the entire checklist is incorrect.

---

#### Rule P6: Recurring Work Task

**Rule:** When recurrence is detected AND the content is work-related, the entity is a Task (with recurrence), NOT a Habit.

**Example:** `"Submit report every month on the 15th"` → Task with monthly recurrence  
**Example:** `"Client call every Monday"` → Task with weekly recurrence [1]

**Rationale:** Work items are scheduled tasks, not personal habits. The Habit→Task heuristic favors Task for work keywords.

---

#### Rule P7: Habit with Deadline

**Rule:** If a habit-like input contains a specific deadline (date, not recurrence), it becomes a Task with that date, NOT a Habit.

**Example:** `"Run 5km next Friday"` → Task with date = next Friday  
**Example:** `"Run 5km every day"` → Habit

**Rationale:** A specific deadline contradicts the "ongoing routine" nature of a habit. The presence of a date shifts the item toward Task.

**Conflict:** If both recurrence AND a specific date are present → precedence depends on strength: strong daily recurrence (habit) > single date (task). But if the date is paired with a task keyword, it shifts toward Task.

---

#### Rule P8: Priority Inside Title

**Rule:** When a priority keyword is part of a compound title, it is removed from the title.

**Example:** `"Urgent client meeting tomorrow"` → title = "Client meeting", priority = high  
**Example:** `"Low priority design review"` → title = "Design review", priority = low

**Conflict:** If the priority keyword is the entire title? E.g., `"Urgent"` → title = "Urgent", priority = high. The keyword is removed only if there is other text.

**Behavior:** If removing the priority keyword empties the title, keep the keyword as the title.

---

#### Rule P9: Category vs Note

**Rule:** Category detection does NOT override the Note type. If the type is Note (from passive detection), category is still stored but does not promote to Task.

**Example:** `"The sky is blue"` → Note (passive). Category stays undefined.  
**Example:** `"Notes from gym session"` → Note. Category = health. Still stored as Resource, not promoted to Task.

**Rationale:** Category describes content; type describes intent. They are orthogonal.

---

#### Rule P10: File + Text

**Rule:** When a file is attached and text is also entered, the file metadata takes priority for the type, but the text is preserved as the title.

**Example:** User picks "document.pdf" and types "Project spec review" → type = file, title = "Project spec review" (or "document.pdf"? This is undecided — needs future product decision.)  
**Current behavior:** Title is set to the file name (asset.name). The typed text is lost.

**Recommendation:** `title = typed text || file name` — prefer user's text over file name.

---

## 6. Confidence Behavior

### 6.1 Confidence Tiers

| Level | Score Range | Meaning | UI Treatment |
|---|---|---|---|
| **Certain** | ≥ 0.85 | Parser is highly confident. Multiple strong signals detected. | Green confidence badge shown. Auto-save enabled. No type override prompt. |
| **Likely** | 0.60 – 0.84 | Parser is reasonably confident. At least one strong signal. | Amber confidence badge shown. Auto-save enabled. Type override available but not prompted. |
| **Uncertain** | 0.40 – 0.59 | Parser has some signals but not enough to be confident. | No confidence badge (hidden). Auto-save enabled. Type override prominently available. Suggestion shown if applicable (e.g., "Make this a habit?"). |
| **Unknown** | < 0.40 | Parser detected no meaningful signals. Minimal confidence. | No confidence badge. Auto-save uses Note type regardless of parser suggestion. Type override shown prominently. User must confirm before save. |

### 6.2 Score Sources

| Signal | Base Score | Conditions |
|---|---|---|
| URL detected | 0.90 | Presence of URL pattern |
| File attachment | 0.95 | Attachment metadata present |
| Checklist (bullets) | 0.85 | ≥2 bullet/numbered lines |
| Checklist (short lines) | 0.65 | ≥3 lines, <60 chars each |
| Idea keyword | 0.70 | Prefix match (idea:, thought:, etc.) |
| Category matched | +0.15 | Keyword match against CATEGORY_MAP |
| Recurrence detected | +0.15 | Any recurrence pattern matched |
| Reminder offset | +0.10 | Reminder pattern matched |
| Priority detected | +0.15 | Keyword match against PRIORITY_MAP |
| Date/time detected | +0.15 | chrono or regex date/time parsed |
| "today" / "tomorrow" | +0.10 | Fallback date regex |
| Note detection | 0.40 – 0.60 | Passive content signals |
| Default task | 0.30 | No signals at all |

### 6.3 Score Calculation

```
finalScore = baseScore + sum(bonuses)
finalScore = clamp(0.1, 1.0, finalScore)
```

Where `baseScore` is determined by the highest-priority detected signal, and `bonuses` are additive for each metadata extraction that succeeded.

**Exception:** If no signal at all (default task path), `baseScore = 0.3`.

### 6.4 Confidence and Entity Type

| Final Score | Parser Output Type | Final Entity Type |
|---|---|---|
| ≥ 0.85 | Any | Use parser's type |
| 0.60 – 0.84 | Any | Use parser's type |
| 0.40 – 0.59 | task, habit | Use parser's type (but prompt override) |
| 0.40 – 0.59 | note, link, idea, checklist, file | Use parser's type |
| < 0.40 | task | Override to NOTE |
| < 0.40 | habit | Override to NOTE (weak habit signal) |
| < 0.40 | note, link, idea, checklist, file | Use parser's type (explicit signals override low confidence) |

### 6.5 Confidence and UI Behavior

| Confidence | Type Badge | Save Button | Override Prompt |
|---|---|---|---|
| Certain | Green with checkmark | Enabled with "Add [type]" | Hidden. Available as dropdown. |
| Likely | Amber | Enabled with "Add [type]" | Hidden. Available as dropdown. |
| Uncertain | Normal (no color) | Enabled with "Add [type]" | **Suggested**: "Is this correct?" banner |
| Unknown | Normal (no color) | Labeled "Save as Note" | **Required**: Override dropdown shown by default |

### 6.6 What "Unknown" Means for the Pipeline

When the decision engine outputs `confidence = "unknown"`:

1. **Parser** produces `type: "task"` (default fallback) with `classification.confidence: "unknown"`
2. **CaptureService** receives the parsed item, sees `confidence: "unknown"`, changes type to `"note"`
3. **EntityFactory** builds a `Resource` (not a Task)
4. **Repository** saves to Resource storage (not Task storage)
5. **UI** shows the item as a Note, with prominent override options

This prevents ambiguous/empty inputs from cluttering the task list.

---

## 7. Decision Tree

The complete decision tree below describes the flow from raw text to final entity. The tree is designed to be read by engineers, designers, and QA.

```
START: Raw input text
│
├─ IS INPUT EMPTY OR WHITESPACE?
│  ├─ YES → Return empty Task (confidence: 0.1)
│  │        Entity: none (UI blocks save)
│  └─ NO  → Continue
│
├─ DOES INPUT CONTAIN A URL?
│  ├─ YES → Type = LINK
│  │  │     Confidence: 0.9
│  │  │     Signal: url_pattern
│  │  └─ Extract: url, title (text without URL or domain)
│  │
│  └─ NO  → Continue
│
├─ IS INPUT MULTILINE (≥2 lines)?
│  ├─ YES → CHECK STRUCTURE
│  │  ├─ LINES START WITH BULLETS/NUMBERS (≥2)?
│  │  │  ├─ YES → Type = CHECKLIST (high confidence: 0.85)
│  │  │  │         First non-bullet line = title
│  │  │  │         Remaining lines = items
│  │  │  └─ NO  → Continue to short-line check
│  │  │
│  │  ├─ LINES ≥3 AND EACH <60 CHARS (no bullets)?
│  │  │  ├─ YES → Type = CHECKLIST (medium confidence: 0.65)
│  │  │  │         First line (if ends with ":" or <30 chars) = title
│  │  │  │         Otherwise title = "List"
│  │  │  │         All lines = items
│  │  │  └─ NO  → Continue
│  │  │
│  │  └─ NO (single line) → Continue
│  │
│  └─ NO (single line) → Continue
│
├─ DOES INPUT START WITH IDEA KEYWORD?
│  ├─ YES → Type = IDEA
│  │  │     Confidence: 0.7
│  │  │     Signal: keyword_idea
│  │  └─ Extract: title (text after keyword)
│  │
│  └─ NO  → Continue
│
├─ DOES INPUT HAVE FILE ATTACHMENT?
│  ├─ YES → Type = FILE
│  │  │     Confidence: 0.95
│  │  └─ Extract: title, attachments array
│  │
│  └─ NO  → Continue
│
├─ IS CONTENT PASSIVE (no action verb, no structure)?
│  ├─ YES (clear passive signal) → Type = NOTE
│  │  │     Confidence: 0.4–0.6
│  │  │     Signal: passive_content
│  │  └─ Store as Resource
│  │
│  ├─ PARTIALLY PASSIVE (some verbs but weak) → Continue
│  │
│  └─ NO (active voice) → Continue
│
├─ DOES INPUT CONTAIN RECURRENCE PATTERN?
│  ├─ YES → Parse recurrence config
│  │  │     Add +0.15 to confidence
│  │  │
│  │  ├─ RUN HABIT vs TASK HEURISTIC
│  │  │  ├─ habitScore > taskScore → Type = HABIT
│  │  │  │                            Signal: recurrence_health
│  │  │  └─ taskScore ≥ habitScore → Type = TASK (with recurrence)
│  │  │
│  │  └─ Continue to metadata extraction
│  │
│  └─ NO  → Type = TASK (default)
│            Signal: default_task
│            Confidence: 0.3 (base)
│            Continue
│
├─ METADATA EXTRACTION (runs for all types)
│  ├─ CATEGORY DETECTION
│  │  ├─ Match keywords against CATEGORY_MAP
│  │  └─ If matched: +0.15 confidence, store category
│  │
│  ├─ PRIORITY DETECTION
│  │  ├─ Match keywords against PRIORITY_MAP
│  │  └─ If matched: +0.15 confidence, store priority
│  │     If not matched: default priority = "medium"
│  │
│  ├─ DATE & TIME EXTRACTION
│  │  ├─ Run chrono-node on cleaned text
│  │  ├─ If chrono succeeds: +0.15, store date/time
│  │  ├─ If chrono fails: fallback to "today"/"tomorrow" regex
│  │  │  └─ If fallback matches: +0.1, store date
│  │  └─ Only for Task and Habit types (not Resource/Checklist)
│  │
│  ├─ REMINDER OFFSET
│  │  ├─ Match "remind me X minutes/hours before" pattern
│  │  └─ If matched: +0.1, store offset
│  │
│  └─ TITLE CLEANUP
│     ├─ Remove all matched date/time/keyword fragments
│     ├─ Collapse whitespace
│     ├─ Capitalize first letter
│     └─ If empty: use original input as title
│
├─ CONFIDENCE FINALIZATION
│  ├─ Calculate final score (base + bonuses, clamped 0.1–1.0)
│  └─ Map to tier: ≥0.85 = Certain, 0.60–0.84 = Likely,
│                   0.40–0.59 = Uncertain, <0.40 = Unknown
│
└─ ENTITY DECISION
   ├─ IF Confidence = Unknown AND Type = Task
   │  └─ Override type to NOTE → Resource entity
   ├─ IF Confidence = Unknown AND Type = Habit
   │  └─ Override type to NOTE → Resource entity
   ├─ IF Type = LINK or IDEA or NOTE (Resource types)
   │  └─ Build Resource entity (strip task-specific metadata)
   ├─ IF Type = CHECKLIST
   │  └─ Build Checklist entity (strip time-based metadata)
   ├─ IF Type = HABIT
   │  └─ Build Habit entity (preserve recurrence, add daily default)
   └─ IF Type = TASK
      └─ Build Task entity (preserve all metadata)
```

### 7.1 Post-Parse Pipeline (CaptureService)

```
PARSED ITEM
    │
    ▼
CONFIDENCE CHECK
    │
    ├─ Unknown + task/habit → route to Resource
    │
    └─ All others → use parser's type
           │
           ▼
     ENTITY FACTORY
           │
           ├─ buildTask() / buildHabit() / buildChecklist() / buildResource()
           │
           ▼
     REMINDER SCHEDULING
           │
           └─ Only for Task and Habit with time
           │
           ▼
     REPOSITORY SAVE
           │
           └─ TaskRepository / HabitRepository / ChecklistRepository / ResourceRepository
           │
           ▼
     STATE EVENT + ANALYTICS
           │
           └─ emitStateChange() + recordDailyHistorySnapshot()
```

---

## 8. Ambiguous Examples Table

The following table contains 100+ real-world inputs with their decision outcomes.

| # | Input | Possible Interpretations | Chosen Entity | Reason | Confidence | Needs Review? |
|---|---|---|---|---|---|---|
| 1 | `""` (empty) | — | Empty Task | Trivial empty input | 0.10 - Unknown | No |
| 2 | `" "` (whitespace) | — | Empty Task | Trivial empty input | 0.10 - Unknown | No |
| 3 | `"a"` (single char) | Task, Note | Note | No action signal, no structure | 0.30 - Unknown | Yes |
| 4 | `"Buy milk"` | Task, Checklist item | Task | Action verb "buy", personal category | 0.65 - Likely | No |
| 5 | `"Buy milk, eggs, bread"` | Task, Checklist | Task | Single line → not checklist | 0.65 - Likely | No |
| 6 | `"- Milk\n- Bread\n- Eggs"` | Checklist | Checklist | Bullet structure, high confidence | 0.85 - Certain | No |
| 7 | `"Milk\nBread\nEggs"` | Checklist (short), multiple Tasks | Checklist | 3 lines, each <60 chars | 0.65 - Likely | Yes (medium confidence) |
| 8 | `"Gym"` | Task, Habit, Note | Task | Active noun, no recurrence, health category | 0.50 - Uncertain | Yes |
| 9 | `"Gym every day"` | Habit, Task (recurring) | Habit | Daily recurrence + health + habit keyword | 0.80 - Likely | No |
| 10 | `"Gym every weekday at 7am"` | Habit | Habit | Weekdays recurrence + time + health + gym | 0.95 - Certain | No |
| 11 | `"Workout"` | Task, Habit, Note | Task | Active noun, health category, no recurrence | 0.50 - Uncertain | Yes |
| 12 | `"Meditate every morning"` | Habit | Habit | Daily (morning) recurrence + health keyword | 0.95 - Certain | No |
| 13 | `"Read"` | Task, Habit, Note | Note | Single word, passive verb, no structure | 0.30 - Unknown | Yes |
| 14 | `"Read Atomic Habits"` | Task, Habit, Note | Task | Action verb "read", learning category | 0.65 - Likely | No |
| 15 | `"Read every day"` | Habit, Task | Habit | Daily recurrence + habit keyword | 0.80 - Likely | No |
| 16 | `"Read 10 pages daily"` | Habit | Habit | Daily recurrence + "read" habit keyword | 0.95 - Certain | No |
| 17 | `"Run 5km"` | Task, Habit, Note | Task | Action noun, health, no recurrence | 0.65 - Likely | No |
| 18 | `"Run every Saturday"` | Habit | Habit | Weekly recurrence (Saturday) + health | 0.95 - Certain | No |
| 19 | `"Meeting tomorrow"` | Task (dated) | Task | Work category + date (tomorrow) | 0.75 - Likely | No |
| 20 | `"Standup at 10am"` | Task | Task | Work category + time | 0.80 - Likely | No |
| 21 | `"Team standup at 10am daily"` | Habit, Task (recurring) | Task | Work category + "team" (work keyword) → task wins over habit | 0.80 - Likely | No |
| 22 | `"Client call every Monday"` | Task (recurring) | Task | Work keyword "client" → task wins | 0.95 - Certain | No |
| 23 | `"Submit report monthly"` | Task (recurring) | Task | Work keyword "submit" → task wins | 0.80 - Likely | No |
| 24 | `"Call mom"` | Task | Task | Personal category (call), action verb | 0.65 - Likely | No |
| 25 | `"Call mom at 5pm"` | Task (timed) | Task | Personal category + time | 0.80 - Likely | No |
| 26 | `"Buy groceries"` | Task | Task | Personal category (buy), action verb | 0.65 - Likely | No |
| 27 | `"Study React"` | Task, Habit, Note | Task | Learning category, action verb | 0.65 - Likely | No |
| 28 | `"Study React daily"` | Habit, Task (recurring) | Task | Learning category + daily — but study+React is specific task | 0.65 - Likely | Yes |
| 29 | `"Study Kubernetes tomorrow at 8pm"` | Task (dated+timed) | Task | Learning category + date + time | 0.95 - Certain | No |
| 30 | `"Learn Rust"` | Task, Habit | Task | Learning category, action verb | 0.65 - Likely | No |
| 31 | `"Practice coding daily"` | Habit, Task | Habit | Daily recurrence + learning category | 0.80 - Likely | No |
| 32 | `"Solve 2 LeetCode problems daily"` | Habit, Task | Habit | Daily recurrence + learning category | 0.80 - Likely | No |
| 33 | `"Deep work session"` | Task | Task | Focus category | 0.65 - Likely | No |
| 34 | `"Design new UI"` | Task, Creative | Task | Creative category (design) | 0.65 - Likely | No |
| 35 | `"Sketch wireframes"` | Task | Task | Creative category (sketch) | 0.65 - Likely | No |
| 36 | `"Write blog post"` | Task | Task | Creative category (writing) | 0.65 - Likely | No |
| 37 | `"Drink water"` | Task, Habit | Task | Health category, no recurrence | 0.65 - Likely | No |
| 38 | `"Drink water every 2 hours"` | Habit | Habit | Interval recurrence + health keyword | 0.95 - Certain | No |
| 39 | `"Take vitamins daily"` | Habit | Habit | Daily + health keyword | 0.95 - Certain | No |
| 40 | `"Stretch for 10 minutes"` | Task, Habit | Task | Health, no recurrence | 0.65 - Likely | No |
| 41 | `"Stretch every morning"` | Habit | Habit | Daily (morning) + health | 0.95 - Certain | No |
| 42 | `"Journal every night"` | Habit | Habit | Daily (night) + habit keyword | 0.95 - Certain | No |
| 43 | `"Plan tomorrow every evening at 9pm"` | Habit, Task | Habit | Daily (evening) + time | 0.80 - Likely | No |
| 44 | `"Inbox zero every Friday"` | Task (recurring) | Task | Work category, task-like phrase | 0.80 - Likely | No |
| 45 | `"Weekly review every Sunday"` | Task (recurring) | Task | Work + "review" (work keyword) | 0.80 - Likely | No |
| 46 | `"Pay rent every month on the 1st"` | Task (recurring) | Task | Finance, "pay" is weak work keyword, monthly → task | 0.80 - Likely | No |
| 47 | `"Track expenses"` | Task | Task | Finance-related | 0.50 - Uncertain | Yes |
| 48 | `"Review monthly budget"` | Task | Task | Finance + "review" | 0.65 - Likely | No |
| 49 | `"Check investments"` | Task | Task | Finance, action verb | 0.50 - Uncertain | Yes |
| 50 | `"Urgent client meeting high priority"` | Task (high priority) | Task | Work + high priority + urgent | 0.95 - Certain | No |
| 51 | `"Low priority design review"` | Task (low priority) | Task | Creative + low priority | 0.80 - Likely | No |
| 52 | `"Someday read new book"` | Task (low priority) | Task | Low priority (someday) + learning | 0.65 - Likely | No |
| 53 | `"Optional reading before bed"` | Task (low priority) | Task | Low priority (optional) | 0.65 - Likely | No |
| 54 | `"https://github.com/pebble"` | Link | Link | URL detected | 0.90 - Certain | No |
| 55 | `"Check out https://example.com"` | Link | Link | URL detected, text becomes title | 0.90 - Certain | No |
| 56 | `"www.google.com"` | Link | Link | URL pattern detected | 0.90 - Certain | No |
| 57 | `"example.com"` | Link, Task | Link | TLD pattern detected (.com) | 0.90 - Certain | No |
| 58 | `"Read this article https://dev.to/post"` | Link | Link | URL + text. Text becomes title. | 0.90 - Certain | No |
| 59 | `"idea: color-coded calendar"` | Idea | Idea | Idea prefix | 0.70 - Likely | No |
| 60 | `"idea: app that tracks water intake"` | Idea | Idea | Idea prefix | 0.70 - Likely | No |
| 61 | `"what if we had dark mode"` | Idea | Idea | "what if" prefix | 0.70 - Likely | No |
| 62 | `"thought: combine tasks and habits"` | Idea | Idea | "thought:" prefix | 0.70 - Likely | No |
| 63 | `"concept: social productivity"` | Idea | Idea | "concept:" prefix | 0.70 - Likely | No |
| 64 | `"idea: study groups every week"` | Idea | Idea | Idea prefix → wins over recurrence | 0.70 - Likely | No |
| 65 | `"Passport"` | Task, Note, Resource | Note | No action verb, no category, no structure | 0.30 - Unknown | Yes |
| 66 | `"Vacation"` | Task, Note | Note | State/event, not an action | 0.30 - Unknown | Yes |
| 67 | `"Invoice #104"` | Task, Note | Task | Implies action, work association | 0.50 - Uncertain | Yes |
| 68 | `"Project Alpha"` | Task, Note | Task | Work-associated, actionable noun | 0.50 - Uncertain | Yes |
| 69 | `"Research React"` | Task, Note | Task | Action verb "research" + learning | 0.65 - Likely | No |
| 70 | `"The sky is blue"` | Note | Note | Passive statement | 0.50 - Uncertain | No |
| 71 | `"Notes from client meeting"` | Note | Note | Passive, reference material | 0.50 - Uncertain | No |
| 72 | `"Quote: '1% better every day'"` | Note, Idea | Note | Quotation, passive | 0.50 - Uncertain | No |
| 73 | `"Meeting notes 2024-07-15"` | Note, Task | Note | "Notes" → passive reference | 0.50 - Uncertain | Yes |
| 74 | `"API documentation link"` | Note, Task | Note | Passive, reference material | 0.40 - Uncertain | Yes |
| 75 | `"Docker networking notes"` | Note, Task | Note | "Notes" → passive | 0.50 - Uncertain | Yes |
| 76 | `"Remind me 30 minutes before meeting"` | Task (with reminder) | Task | Reminder offset detected | 0.65 - Likely | No |
| 77 | `"Alert me 2 hours prior to exam"` | Task (with reminder) | Task | Reminder offset detected | 0.80 - Likely | No |
| 78 | `"Exam at 10am alert me 2 hours prior"` | Task (timed + reminder) | Task | Time + reminder offset | 0.95 - Certain | No |
| 79 | `"Meeting at 3pm and remind me 15 min before"` | Task (timed + reminder) | Task | Time + reminder offset | 0.95 - Certain | No |
| 80 | `"Buy milk and eggs and bread"` | Task, Checklist | Task | Single line → not checklist | 0.65 - Likely | No |
| 81 | `"- Buy milk\n- Buy eggs\n- Call mom"` | Checklist | Checklist | Bullet structure | 0.85 - Certain | No |
| 82 | `"1. Buy milk\n2. Buy eggs\n3. Call mom"` | Checklist | Checklist | Numbered list | 0.85 - Certain | No |
| 83 | `"• Buy milk\n• Buy eggs\n• Call mom"` | Checklist | Checklist | Bullet structure (•) | 0.85 - Certain | No |
| 84 | `"Shopping:\n- Milk\n- Eggs\n- Bread"` | Checklist | Checklist | Title "Shopping" + bullets | 0.85 - Certain | No |
| 85 | `"Todo:\nClean room\nDo laundry\nStudy"` | Checklist (medium) | Checklist | 3 short lines, no bullets | 0.65 - Likely | Yes |
| 86 | `"Today I need to:\nBuy milk\nCall mom\nFinish report"` | Checklist (medium), Note | Checklist | First line ends with ":" → title | 0.65 - Likely | Yes |
| 87 | `"Finish report\nSubmit code\nReview PR"` | Checklist (medium) | Checklist | 3 short lines | 0.65 - Likely | Yes |
| 88 | `"Drink water every 2 hours"` | Habit | Habit | Interval recurrence + health | 0.95 - Certain | No |
| 89 | `"Stretch hourly"` | Habit | Habit | Hourly recurrence | 0.80 - Likely | No |
| 90 | `"Yoga every Monday and Thursday"` | Habit | Habit | Weekly specific days + health | 0.95 - Certain | No |
| 91 | `"Weekdays gym at 7am"` | Habit | Habit | Weekdays recurrence + health + time | 0.95 - Certain | No |
| 92 | `"Weekend run"` | Task, Habit | Task | Weekend implied but not explicit | 0.50 - Uncertain | Yes |
| 93 | `"Yoga session weekdays"` | Habit | Habit | Weekdays + health | 0.95 - Certain | No |
| 94 | `"Clean dishes"` | Task | Task | Personal, action verb | 0.65 - Likely | No |
| 95 | `"Laundry"` | Task, Note | Task | Implies action, personal | 0.50 - Uncertain | Yes |
| 96 | `"Fix login bug"` | Task | Task | Work, action verb | 0.65 - Likely | No |
| 97 | `"Deploy to production"` | Task | Task | Work, action verb | 0.65 - Likely | No |
| 98 | `"Doctor appointment"` | Task | Task | Health, implies action | 0.50 - Uncertain | Yes |
| 99 | `"Dentist next Tuesday"` | Task (dated) | Task | Health + date | 0.80 - Likely | No |
| 100 | `"Call mom and dad"` | Task | Task | Personal + call | 0.65 - Likely | No |
| 101 | `"Submit assignment Friday"` | Task (dated) | Task | Work + date | 0.80 - Likely | No |
| 102 | `"Finish deployment checklist"` | Task | Task | Work + action verb | 0.65 - Likely | No |
| 103 | `"Review PR before lunch"` | Task (timed) | Task | Work + time implied | 0.65 - Likely | No |
| 104 | `"Water plants"` | Task | Task | Personal, action verb | 0.65 - Likely | No |
| 105 | `"Feed the cat"` | Task | Task | Personal, action verb | 0.65 - Likely | No |
| 106 | `"Order birthday gift"` | Task | Task | Personal, action verb | 0.65 - Likely | No |
| 107 | `"Plan dinner party"` | Task | Task | Personal, action verb | 0.65 - Likely | No |
| 108 | `"Update LinkedIn profile"` | Task | Task | Personal/work, action verb | 0.65 - Likely | No |
| 109 | `"Backup photos"` | Task | Task | Personal, action verb | 0.65 - Likely | No |
| 110 | `"Clean inbox"` | Task | Task | Work, action verb | 0.65 - Likely | No |
| 111 | `"Organize desk"` | Task | Task | Personal, action verb | 0.65 - Likely | No |
| 112 | `"Sunday meal prep"` | Task (dated) | Task | Personal + day-of-week | 0.65 - Likely | No |
| 113 | `"Networking event"` | Task | Task | Work-associated | 0.50 - Uncertain | Yes |
| 114 | `"Conference talk proposal"` | Task, Note | Task | Work, implies creation | 0.50 - Uncertain | Yes |
| 115 | `"Brainstorm project names"` | Task, Idea | Task | Action verb "brainstorm" + creative | 0.65 - Likely | No |
| 116 | `"Compose email to team"` | Task | Task | Work + action verb | 0.65 - Likely | No |
| 117 | `"Prepare slides"` | Task | Task | Work + action verb | 0.65 - Likely | No |
| 118 | `"Update resume"` | Task | Task | Personal/work, action verb | 0.65 - Likely | No |
| 119 | `"Pay credit card bill"` | Task | Task | Finance + action verb | 0.65 - Likely | No |
| 120 | `"Book flights"` | Task | Task | Personal, action verb | 0.65 - Likely | No |
| 121 | `"Renew passport"` | Task | Task | Personal, action verb | 0.65 - Likely | No |
| 122 | `"Schedule oil change"` | Task | Task | Personal, action verb | 0.65 - Likely | No |
| 123 | `"Research SQLite WAL mode"` | Task, Note | Task | "Research" is active verb, learning | 0.65 - Likely | No |
| 124 | `"TIL: SQLite supports WAL mode"` | Note, Idea | Note | "TIL" → passive, informational | 0.50 - Uncertain | Yes |
| 125 | `"FYI: deployment moved to Friday"` | Note, Task | Note | "FYI" → informational, not actionable | 0.50 - Uncertain | Yes |
| 126 | `"Reminder: buy gift for mom"` | Task | Task | "Reminder:" prefix → actionable | 0.65 - Likely | No |
| 127 | `"Important: review contract"` | Task | Task | "Important:" + action verb | 0.80 - Likely | No |
| 128 | `"Note: server maintenance this weekend"` | Note, Task | Note | "Note:" → passive reference | 0.50 - Uncertain | Yes |
| 129 | `"Memo: new office policy"` | Note, Task | Note | "Memo:" → informational reference | 0.50 - Uncertain | Yes |
| 130 | `"Submit TPS reports"` | Task | Task | Work + action verb | 0.65 - Likely | No |
| 131 | `"Code review"` | Task | Task | Work noun, implies action | 0.50 - Uncertain | Yes |
| 132 | `"Push to git"` | Task | Task | Work, action verb | 0.65 - Likely | No |
| 133 | `"Write unit tests"` | Task | Task | Work, action verb | 0.65 - Likely | No |
| 134 | `"Refactor auth module"` | Task | Task | Work, action verb | 0.65 - Likely | No |
| 135 | `"Set up CI/CD"` | Task | Task | Work, action verb | 0.65 - Likely | No |
| 136 | `"Update dependencies"` | Task | Task | Work, action verb | 0.65 - Likely | No |
| 137 | `"Fix TypeScript errors"` | Task | Task | Work, action verb | 0.65 - Likely | No |
| 138 | `"Explore new frameworks"` | Task, Idea | Task | "Explore" is active, learning | 0.65 - Likely | No |
| 139 | `"Watch tutorial on React Native"` | Task | Task | Learning + action verb | 0.65 - Likely | No |
| 140 | `"Take notes on Kubernetes"` | Task, Note | Task | Action verb "take notes" → task | 0.65 - Likely | No |

---

## Appendix A: Decision Summary by Input Category

| Input Category | Entity Type | Typical Confidence | Notes |
|---|---|---|---|
| Empty/whitespace | Task (no save) | 0.10 | UI blocks save |
| Single word, active | Task | 0.50–0.65 | Depends on category match |
| Single word, passive | Note | 0.30–0.50 | Overridden to Note |
| Action phrase (verb + object) | Task | 0.65+ | Strong action signal |
| URL | Link | 0.90 | Unambiguous |
| Multiline bullets | Checklist | 0.85 | Structural signal |
| Multiline short lines | Checklist | 0.65 | Medium confidence |
| Idea-prefixed | Idea | 0.70 | Explicit keyword |
| Recurring + health/habit keywords | Habit | 0.80–0.95 | Strong signals |
| Recurring + work keywords | Task (recurring) | 0.80+ | Task bias for work |
| Passive/statement | Note | 0.40–0.60 | Informational |
| File attachment | File → Resource | 0.95 | Programmatic |
| Date/time but no recurrence | Task (dated/timed) | 0.65–0.80 | Temporal context |
| Reminder offset | Task | +0.10 bonus | Adds to base |
| Priority keyword | Task | +0.15 bonus | Adds to base |
| No signal at all | Note (overridden) | 0.30 | Conservative default |

## Appendix B: Implementation Checklist for Decision Engine Changes

- [ ] Add `classification` field to `ParsedProductivityItem` with `{ suggested, confidence, detectionSignal? }`
- [ ] Add Unknown confidence mapping for scores < 0.40
- [ ] Add Note detection heuristic for passive content
- [ ] Add confidence → final entity type mapping in CaptureService
- [ ] Add type override prompt UI for Uncertain/Unknown confidence
- [ ] Update entity-factory type map to handle Unknown→Note override
- [ ] Update test suite to verify ambiguity examples (target: 100% pass on examples table)
- [ ] Add QA verification for each ambiguity case in Section 8

---

*End of Smart Capture Decision Engine. This document is the single source of truth for parser decisions. Any proposed change to parser behavior must first update this document.*
