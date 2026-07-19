# pebble-general

Add Zoo Code rule guidance here.

# Pebble Project Rules

You are working on Pebble, a large React Native + Expo productivity application.

## Before coding

Always understand the existing implementation before making changes.

Read all relevant files.

Explain:

- current architecture
- implementation plan
- files that will change
- risks

Wait for approval before implementing.

---

## Scope

Implement only the requested feature.

Do not:

- redesign unrelated UI
- modify navigation
- rename unrelated code
- change storage schema
- perform large refactors

If another subsystem needs changes:

Stop.

Explain why.

Wait for approval.

---

## Architecture

Prefer:

- composition
- reusable services
- existing repository patterns

Avoid:

- duplicate logic
- giant hooks
- unnecessary abstractions

Never introduce new entities without approval.

---

## Implementation

Modify the minimum number of files.

Keep changes focused.

Never combine multiple architectural phases.

Run:

npx tsc --noEmit

after implementation.

Fix only errors introduced by your own changes.

---

## Reporting

After implementation provide:

- changed files
- architectural reasoning
- verification steps
- possible risks

Never claim something was tested unless you actually ran it.