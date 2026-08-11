# Pebble Smart Capture — Architecture Decision Record

**Status:** Approved  
**Date:** July 2026  
**Author:** Architecture Review Board  
**Applies to:** `features/capture/*`, `services/scheduling/*`, `repositories/*`, `shared/types/*`

---

## 1. Scope

This ADR governs the Quick Capture subsystem: UI, parsing, classification, entity construction, suggestion, reminder scheduling, and persistence. It does NOT cover Focus, Calendar, Profile, or Workspace management.

---

## 2. Everyone Agreed

The following decisions received broad consensus across all architecture reviews:

| Decision | Consensus |
|---|---|
| **Parser should NOT be split.** One 300-line function is acceptable. Add fields rather than creating new files. | ✅ Unanimous |
| **CaptureService remains the single entry point** for all entity creation. No screen or component creates entities directly. | ✅ Unanimous |
| **EntityFactory stays pure.** No side effects. No scheduling. No persistence. | ✅ Unanimous |
| **Repository architecture is good.** CRUD + normalize for legacy migration. Keep the pattern. | ✅ Unanimous |
| **Undo infrastructure exists but is unused.** Wire `showUndo` instead of `showToast` in the save flow. | ✅ Unanimous |
| **File attachment bug must be fixed.** `buildResource()` loses attachment metadata on save. Fix it. | ✅ Unanimous |
| **SuggestionBanner bypasses CaptureService.** This is a real bug risk. Route through CaptureService. | ✅ Unanimous |
| **`cognitive-flow.service.ts` is dead code.** Delete it. No consumers exist. | ✅ Unanimous |
| **`compromise.js` adds marginal value.** Remove the import. Keyword regex handles the same cases. | ✅ Unanimous |
| **Debug `console.log` statements in TaskRepository** must be removed before production. | ✅ Unanimous |
| **Default unknown to Resource, not Task.** Add `classification` metadata to the parser output. CaptureService checks it. | ✅ Unanimous |

---

## 3. Mixed Opinions — Resolved

### 3.1. CaptureSession

**Proposal:** A temporary object bundling raw input, parsed metadata, user overrides, and source. Destroyed after save.

**Arguments FOR:**
- Single object through the pipeline instead of multiple params
- Serializable (useful for offline queuing and undo history)
- Audit trail for telemetry and learning

**Arguments AGAINST:**
- Adds a new type and construction logic
- `ParsedProductivityItem` + 2 params (`workspaceId`, `source`) covers the same surface
- Offline queuing and undo history are not Phase 1 concerns
- Risk of becoming a "kitchen sink" object that accumulates 20+ fields

**Decision: POSTPONE.**  
Do not introduce CaptureSession in Phase 1 or 2. If offline queuing or capture replay becomes a requirement, introduce it then. `ParsedProductivityItem` + `workspaceId` is sufficient for now.

### 3.2. Classification Policy

**Proposal:** A separate decision layer that reads parser output and decides entity type. CaptureService should not contain business decisions.

**Arguments FOR:**
- Separation of concerns: CaptureService orchestrates, Policy classifies
- If classification grows to 10+ rules, a dedicated file prevents CaptureService bloat

**Arguments AGAINST:**
- Classification is currently a single if-statement. A separate file adds indirection without removing complexity.
- CaptureService's stated responsibility includes business decisions. It already decides reminders, events, and analytics.
- Developers must look in two places to understand the save flow.

**Decision: MERGE with CaptureService.**  
A single if-statement does not warrant a file. Keep `classification.confidence` in the parser output. The check lives in CaptureService. Extract only if classification grows to 5+ rules.

### 3.3. Suggestion Engine (class hierarchy)

**Proposal:** A coordinator with `SuggestionProvider` interface, dynamic provider registration, ranking, and deduplication.

**Arguments FOR:**
- Clean extensibility for future providers (duplicate, reminder, AI)
- Single API surface: `engine.getSuggestions(context)`
- Decouples UI from provider implementation

**Arguments AGAINST:**
- No external providers exist today. The interface has one implementation.
- A class hierarchy for a single use case is premature.
- A single function calling hardcoded providers achieves the same result with less code.

**Decision: SIMPLIFY to a single function.**  
Build `collectSuggestions()` as an exported function, not a class. Providers are hardcoded function calls inside it. Upgrade to the provider pattern only when external plugins need to register providers.

### 3.4. Telemetry

**Proposal:** Record parser confidence, type corrections, suggestion acceptance, workspace auto-assignment accuracy.

**Arguments FOR:**
- Data-driven parser improvements
- Identify which edge cases users correct most often

**Arguments AGAINST:**
- Requires a telemetry system that doesn't exist
- Privacy concerns for a local-first app
- Premature optimization — fix the known bugs first, then measure

**Decision: POSTPONE to Phase 3.**  
The known bugs (default-to-Task, file attachments, undo) should be fixed and shipped before investing in measurement infrastructure.

---

## 4. Rejected Ideas

These proposals were considered and rejected. Do not implement.

| Idea | Reason for Rejection |
|---|---|
| **Split parser into Intent Engine + Metadata Extractor + Classification** | Works. Tested. 5 dependents. No user benefit from the split. |
| **Add `"unknown"` to the entity type union** | Pollutes the domain model. Use `classification.confidence` metadata instead. |
| **Replace rule-based parsing with AI** | Rules handle 80%+ of inputs. Add AI only when 80% isn't enough. |
| **Replace AsyncStorage with SQLite** | AsyncStorage handles current scale. SQLite adds complexity without solving a current problem. |
| **Build a plugin system for suggestions** | No plugins exist. Don't build infrastructure for code that doesn't exist. |
| **Add on-device ML for classification** | Marginal improvement over rules. High complexity cost. Postpone indefinitely. |

---

## 5. Final Architecture Pipeline

```
┌─────────────────────────────────────────────────────────┐
│                     INVOCATION                           │
│  FAB / Hotkey / Widget / Share Sheet / Voice / Clipboard │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  UnifiedCapture.tsx         [KEEP — 700 lines, OK]       │
│  └─ CaptureInputBox.tsx     [KEEP — clean]               │
│  └─ VoiceCaptureButton.tsx  [KEEP — beautiful]           │
│                                                           │
│  RESPONSIBILITY: UI coordination only                     │
│  Logic delegated to: parser, CaptureService, suggestions  │
└─────────────────────┬───────────────────────────────────┘
                      │ raw text
                      ▼
┌─────────────────────────────────────────────────────────┐
│  nlp-parser.service.ts      [EXTEND]                     │
│                                                           │
│  INPUT: raw text                                           │
│  OUTPUT: ParsedProductivityItem                            │
│          + classification: { suggested, confidence }       │
│                                                           │
│  CHANGES:                                                 │
│  - Add classification field                               │
│  - Remove compromise.js import                            │
│  - Remove artificial prefix detection                      │
│    (note:, memo:, remember:)                              │
│  - Add absolute-time reminder parsing                     │
│                                                           │
│  RESPONSIBILITY: Pure text → structured data              │
│  Does NOT persist. Does NOT construct entities.            │
└─────────────────────┬───────────────────────────────────┘
                      │ parsedItem
                      ▼
┌─────────────────────────────────────────────────────────┐
│  CaptureService.ts          [EXTEND]                     │
│                                                           │
│  INPUT: ParsedProductivityItem                             │
│  OUTPUT: SavedEntity (Task | Habit | Checklist | Resource) │
│                                                           │
│  FLOW:                                                    │
│  1. Check classification.confidence                        │
│     └── "unclear" → isResource = true                     │
│     └── otherwise → keep suggested type                   │
│  2. Call EntityFactory.build*()                            │
│  3. [Phase 2] Call collectSuggestions()                    │
│  4. Schedule reminders                                     │
│  5. Repository.save*()                                     │
│  6. emitStateChange()                                      │
│                                                           │
│  RESPONSIBILITY: Single validated creation path            │
└─────────────────────┬───────────────────────────────────┘
                      │ entity
                      ▼
┌─────────────────────────────────────────────────────────┐
│  EntityFactory               [EXTEND]                     │
│                                                           │
│  buildTask()  — pure                                       │
│  buildHabit() — pure                                       │
│  buildChecklist() — pure                                   │
│  buildResource() — pure                                    │
│                                                           │
│  CHANGES:                                                 │
│  - Fix file→attachment mapping in buildResource()          │
│  - Remove computeTriggerAt() — move to CaptureService      │
│                                                           │
│  RESPONSIBILITY: Pure entity construction. No side effects │
└─────────────────────┬───────────────────────────────────┘
                      │ entity
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Repositories               [KEEP]                        │
│                                                           │
│  TaskRepository        — normalizeTask()                   │
│  HabitRepository       — normalizeHabit()                  │
│  ChecklistRepository   — normalizeChecklist()              │
│  ResourceRepository    — normalizeResource()               │
│                                                           │
│  CHANGES:                                                 │
│  - Remove DEBUG-* console.log from TaskRepository          │
│                                                           │
│  RESPONSIBILITY: CRUD + legacy migration                   │
└─────────────────────┬───────────────────────────────────┘
                      │ AsyncStorage
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Post-Save                                               │
│                                                           │
│  ├── UndoContext.showUndo()     [WIRE — infrastructure OK]│
│  ├── emitStateChange()          [KEEP]                    │
│  └── recordDailyHistorySnapshot() [KEEP]                  │
└─────────────────────────────────────────────────────────┘
```

---

## 6. Final Folder Structure

```
features/capture/
├── components/
│   ├── CaptureInputBox.tsx          KEEP
│   ├── SuggestionBanner.tsx         REFACTOR (route through CaptureService)
│   ├── UnifiedCapture.tsx           KEEP (add undo, remove dead props)
│   └── VoiceCaptureButton.tsx       KEEP
├── hooks/
│   └── useVoiceCapture.ts           KEEP
└── services/
    ├── CaptureService.ts            EXTEND (add confidence check)
    ├── entity-factory.service.ts    EXTEND (fix file mapping)
    ├── nlp-parser.service.ts        EXTEND (add classification, remove compromise.js)
    ├── quick-suggestions.service.ts EXTEND (receive inline function)
    ├── speech-recognition.service.ts KEEP
    ├── suggestions.service.ts       EXTEND (add fuzzy matching)
    ├── tag-extractor.service.ts     NEW (Phase 2)
    ├── draft-recovery.service.ts    NEW (Phase 1)
    └── suggestion-providers.ts      NEW (Phase 2 — collectSuggestions function)
    (delete)
    └── cognitive-flow.service.ts    DELETE

services/scheduling/
    └── reminders.service.ts         KEEP (add absolute-time patterns)

repositories/
    ├── index.ts                     KEEP
    ├── TaskRepository.ts            SIMPLIFY (remove DEBUG-* logs)
    ├── HabitRepository.ts           KEEP
    ├── ChecklistRepository.ts       KEEP
    ├── ResourceRepository.ts        KEEP
    ├── RecycleBinRepository.ts      KEEP
    ├── UiStateRepository.ts         KEEP
    └── WorkspaceRepository.ts       KEEP

shared/
    ├── types/
    │   └── domain.types.ts          KEEP
    └── components/
        └── ui/
            └── UndoContext.tsx       KEEP (wire into capture flow)

docs/
    └── architecture/
        └── smart_capture_adr.md     NEW (this file)
```

**Net change to file count:** +3 files, -1 file = +2 files net.

---

## 7. Technical Debt

### Immediate (Fix Before Ship)

| Debt | Why Now | Fix |
|---|---|---|
| Default unknown → Task | Most obvious user-facing bug | Add `classification.confidence`. Check in CaptureService. |
| `console.log("[DEBUG-*]")` in TaskRepository | Privacy + performance | Remove 4 statements. |
| `cognitive-flow.service.ts` dead code | Maintenance burden | Delete file. |
| `compromise.js` import | 50KB bundle for marginal value | Remove import, rely on keyword regex. |
| SuggestionBanner bypasses CaptureService | Data corruption risk | Route through CaptureService. |
| SuggestionBanner misses `reminder` field | Schema inconsistency | Add `reminder` field to banner-created habits. |

### Later (Monitor, Don't Rush)

| Debt | When to Fix | Trigger |
|---|---|---|
| `ResourceRepository` 5-way if-chain for `body` | When adding a new Resource field | Adding a 6th legacy format. |

| `500-char` input limit not validated downstream | When adding new input sources | New widget or CLI input bypasses the limit. |
| `useTasksState.ts` imports parser type | When entity shape changes cause a bug | The third creation path surfaces an inconsistency. |

### Never Worth Fixing

| Debt | Why Not |
|---|---|
| `cognitive-flow.service.ts` | Already deleted above. |
| `parseTime()` duplication (CaptureService + EntityFactory) | 5 lines each. The cost of extracting + importing a shared utility exceeds the cost of 5 duplicated lines. |
| `onSaveComplete` dead prop | 1-line removal. If it bothers someone, they'll delete it in 30 seconds. |
| `catch {}` blocks | Add `console.warn` opportunistically but don't audit all files for it. |

---

## 8. Implementation Roadmap

### Phase 1 — Bugs & Consistency (Ship First)

| Task | Complexity | Risk | User Impact | Arch Impact |
|---|---|---|---|---|
| Add `classification: { suggested, confidence }` to parser | Low | Low | High | Low |
| Wire confidence check in CaptureService | Low | Low | High | Low |
| Remove `compromise.js` from parser | Low | Low | None | Low |
| Remove `cognitive-flow.service.ts` | Low | Low | None | Low |
| Remove DEBUG-* logs from TaskRepository | Low | Low | None | Low |
| Wire `showUndo` in save flow | Low | Low | Medium | Low |
| Fix file→attachment mapping in EntityFactory | Low | Low | Medium | Low |
| Remove dead `onSaveComplete` prop from UnifiedCapture | Low | Low | None | Low |
| Remove prefix detection (note:, memo:, remember:) | Low | Low | None | Low |
| **Phase 1 total:** 9 tasks, 2-3 days | Low | Low | High | Low |

### Phase 2 — UX and Structure

| Task | Complexity | Risk | User Impact | Arch Impact |
|---|---|---|---|---|
| Route SuggestionBanner through CaptureService | Medium | Medium | Medium | Medium |
| Create `draft-recovery.service.ts` | Low | Low | High | Low |
| Add `tag-extractor.service.ts` to parser pipeline | Low | Low | None | Low |
| Add fuzzy matching to `suggestions.service.ts` | Low | Low | Low | Low |
| Grow workspace keyword map (9→50+) | Low | Low | Medium | Low |
| Add absolute-time reminder parsing | Low | Low | Medium | Low |
| Create `collectSuggestions()` function | Low | Low | None | Low |
| Add duplicate detection provider | Medium | Low | Low | Low |
| Create editable review panel in UI | Medium | Low | High | Low |
| **Phase 2 total:** 9 tasks, 1-2 weeks | Low-Med | Low-Med | Medium-High | Low |

### Phase 3 — Intelligence

| Task | Complexity | Risk | User Impact | Arch Impact |
|---|---|---|---|---|
| Capture telemetry (confidence, corrections) | Medium | Low | None | Medium |
| AI enrichment as optional post-process | High | Medium | Medium | Medium |
| Semantic parsing to replace prefix detection | Medium | Medium | Low | Medium |
| **Phase 3 total:** 3 tasks, 2-4 weeks | Med-High | Medium | Medium | Medium |

---

## 9. Architecture Constitution (10 Permanent Rules)

1. **All entity creation goes through CaptureService.** No screen, hook, or component calls Repository.save*() directly. The only exceptions are data migration scripts.

2. **Parser never writes to repositories.** `nlp-parser.service.ts` is a pure text-processing function. It returns structured data. It has no side effects.

3. **EntityFactory remains pure.** `buildTask()`, `buildHabit()`, `buildChecklist()`, and `buildResource()` accept data and return an entity. They do not call repositories, schedulers, or event emitters.

4. **UI never constructs entities.** `UnifiedCapture.tsx` and `SuggestionBanner.tsx` do not create Task, Habit, Checklist, or Resource objects directly. They call CaptureService.

5. **Prefer extending existing services before creating new ones.** Before adding a file, answer: "Can this be a function inside an existing service instead?"

6. **One function is better than one class.** Before creating a class with methods, consider whether a single exported function achieves the same result with less indirection.

7. **Dead code is deleted, not commented out.** If a file has no imports, delete it. If a function is unused, remove it. The git history preserves it.

8. **`console.log` is for development only.** No debug logging in production code. Use `console.warn` for recoverable errors. Use `console.error` for failures.

9. **Every entity creation should be undoable.** If CaptureService creates an entity, the calling code should store the entity ID and call `showUndo()` with a delete callback.

10. **Default unknown to Resource, not Task.** When the parser has low confidence, `CaptureService` saves as Resource (Note). Users can change the type after save. This prevents clutter from ambiguous captures.

---

## 10. Final Verdict

### What should be implemented immediately?

Phase 1 in order:

1. Classification metadata on parser output
2. Confidence check in CaptureService (unknown → Resource)
3. Remove dead code (cognitive-flow, compromise.js, DEBUG-* logs)
4. Wire undo in save flow
5. Fix file attachment mapping in EntityFactory

These are **bugs, not features**. They should ship before any new functionality.

### What should wait?

Phase 2 (suggestion engine, draft recovery, tag extraction, editable review panel) delivers user-facing value but depends on Phase 1 stability. Start Phase 2 the week after Phase 1 ships.

Phase 3 (telemetry, AI enrichment) should wait until the deterministic pipeline is working reliably. Premature AI will produce unreliable results that erode user trust.

### What should never be built?

- CaptureSession abstraction
- Classification Policy as a separate file
- Suggestion Engine class hierarchy with provider registration
- Plugin system for capture

These solve problems Pebble doesn't have. If Pebble reaches 100,000 users and gains external plugin developers, revisit. Until then, the single-function approach is superior.

### What is the single biggest architectural weakness remaining?

**Three entity creation paths exist instead of one.** CaptureService is the intended single entry point, but SuggestionBanner and `useTasksState.ts` both create entities directly. If the entity schema changes (new required field, renamed field), the two bypass paths will silently produce inconsistent data.

This is the highest-risk architectural issue remaining after Phase 1.

### What is Pebble's strongest architectural decision?

**CaptureService as the single entry point with EntityFactory as pure construction.** This pattern means:
- All entities are validated before persistence
- All entities go through the same normalization pipeline
- Adding a new entity type means adding a case to CaptureService and a factory function
- Testing is straightforward (mock CaptureService, not repositories)

### Would you approve this architecture for production?

**Yes, with conditions:**

1. Phase 1 must be completed before shipping any new capture features.
2. The SuggestionBanner bypass must be resolved in Phase 2 (not deferred to Phase 3).
3. The `classification.confidence` field must be added before the unknown→Resource behavior change (to ensure the change is data-driven, not hardcoded).

If these conditions are met, this architecture is simple enough for one developer, maintainable by a team of five, and extensible without rewrites for at least 3-5 years.

---

*End of ADR. This document is the source of truth for Pebble Smart Capture architecture. Any proposed change must first update this ADR.*
