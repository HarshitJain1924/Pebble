# Pebble AI Agent Instructions

> **Truth as of 2026-10-02.** The facts below were verified against the active codebase on this date. If the code has changed since, the code wins — update this document instead of trusting the date.

Pebble is a local-first React Native app built on **Expo SDK 57** (React Native 0.86, React 19.2, New Architecture + React Compiler).

- **Primary Project Guidelines**: Refer to [.agents/AGENTS.md](file:///.agents/AGENTS.md) for active engineering guardrails and workflow.
- **Current Product & Architecture Map**: Refer to [AI_CONTEXT.md](file:///AI_CONTEXT.md) first, then [docs/current_state.md](file:///docs/current_state.md) and [docs/integrity_status.md](file:///docs/integrity_status.md).
- **Mascot & Voice System**: Refer to [docs/cairn_voice_guide.md](file:///docs/cairn_voice_guide.md) for Cairn's product behavior specification, presence rules, and voice constraints.
- **Expo SDK 57 Documentation**: Check versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing Expo code.

## Source of Truth (read this before trusting any document)

When documentation conflicts with active code, **code wins**. Do not invent a third
interpretation. Inspect the implementation and update the documentation instead.

Evidence hierarchy, strongest first:

1. Active source code (`app/`, `features/`, `services/`, `repositories/`, `shared/`)
2. Runtime behavior and tests (`**/__tests__/**`)
3. Actual design tokens / components (`shared/constants/*`, `shared/components/*`)
4. Active architecture decisions (`docs/architecture/*.md`)
5. Current-state engineering docs (`docs/current_state.md`, `docs/integrity_status.md`, `AI_CONTEXT.md`)
6. AI context / instructions (`AGENTS.md`, `.agents/AGENTS.md`, `.agents/skills/*`)
7. README / PRD
8. Historical / archived material (`docs/archive/**`, old audits)

An old README or archived audit is never more authoritative than the code it
describes. `docs/archive/**` is history, not current state.
