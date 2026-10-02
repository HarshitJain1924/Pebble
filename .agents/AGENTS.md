# Pebble Development and Engineering Guidelines

## 0. Source-of-Truth Hierarchy

Resolve conflicts in this order:

1. **Active source code** in the checked-out branch.
2. **`docs/current_state.md` + `docs/integrity_status.md`** for current architecture/integrity.
3. **Active decisions/ADRs** under `docs/architecture/`.
4. **Relevant Pebble skills** under `.agents/skills/`.
5. **`AI_CONTEXT.md`** as navigation context only.
6. **`PRD.md` / `README.md`** for product intent/orientation, not implementation truth.
7. **`docs/archive/`** as historical context only.

If documentation conflicts with code, follow the code. Do not invent a compromise behavior.

Legacy terminology may still exist in migration/compatibility code and historical documents. It is not evidence of a current product concept.

---

## 1. Development Workflow

1. Inspect the relevant active code first.
2. Read current architecture/integrity docs when the change touches architecture, persistence, concurrency, or domain behavior.
3. Consult only the relevant skill(s).
4. Implement the smallest production-ready change.
5. Verify with `npx tsc --noEmit` and relevant tests.

Do not design from screenshots, PRD prose, or historical docs when current code can answer the question.

## 2. Core Engineering Invariants

- **CaptureService is the Single Entry Point**: Entity creation flows through `CaptureService`.
- **EntityFactory Remains Pure**: No storage writes, notifications, or other side effects.
- **Repository Boundaries & Locking**: Repositories remain data-access boundaries. Mutex-protected RMW operations use `*Unlocked` primitives inside command handlers.
- **Locking**: Follow established `withLocks` and lifecycle sequences documented in `docs/current_state.md`.
- **Expo SDK**: Use the Expo SDK 54 documentation when working with Expo APIs.

## 3. UI & Design Guardrails

- Today is for execution; Workspaces are for organization.
- Do not invent nested workspace-management UI, folders, collections, members, or other legacy structure unless the current code or an active decision establishes it.
- Do not nest cards inside cards unless the current implementation has an explicit documented exception.
- Preserve 44x44pt minimum touch targets and existing Pebble interaction primitives.
- Cairn belongs to the presentation/experience layer only. See `docs/cairn_voice_guide.md`.
- Use the actual theme/style/token implementation in `shared/constants/` and existing shared components. Skills must not invent runtime token names or colors.

## 4. Code Change Protocol

- Do not touch unrelated files or perform unrequested refactors.
- Keep existing public APIs and repository boundaries stable.
- Do not introduce new entity-creation paths bypassing `CaptureService`.
- Do not introduce debug logging or dead code.
- Verify TypeScript and relevant tests before considering the change complete.
