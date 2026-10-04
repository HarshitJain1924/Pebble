---
name: react-native-performance
description: Specialized engineering skill for React Native list rendering, worklet thread safety, memoization boundaries, and frame-rate optimization in Pebble.
---

# React Native Performance Guide

> **Truth as of 2026-10-02.** Verified against active React Native 0.86 and Expo SDK 57 architecture.

This skill governs codebase rendering performance, memory efficiency, and list optimization in Pebble.

---

## 1. Skill Contract & Deterministic Activation

* **Activates When**: ONLY on performance-sensitive UI tasks:
  - Rendering long lists (>20 items) in Workspaces, Today, or Recycle Bin.
  - Investigating or fixing UI frame drops, animation jitter, or list stutter.
  - Designing complex Reanimated worklets with heavy thread handoffs.
* **Do NOT Activate When**:
  - Making simple visual styling or padding tweaks.
  - Doing standard design critique or review passes.
  - Implementing static forms, dialogs, or detail screens.
* **Responsible For**:
  - `FlatList` configuration and batch tuning.
  - Memoization boundaries (`React.memo`, `useMemo`, `useCallback`).
  - Reanimated UI thread and JS thread synchronization (`runOnJS`).
  - Avoiding Yoga layout re-measurement thrashing.
* **Must NOT Do**:
  - Must NOT dictate visual aesthetics, color palettes, or typography (defer to `pebble-design` / `design-tokens`).
  - Must NOT alter data persistence or repository locking rules (defer to `docs/current_state.md`).
* **Authority Hierarchy**:
  1. Active source code & profiling reality
  2. `shared/constants/*`
  3. `react-native-performance` (Specialized engineering authority)

---

## 2. List Rendering Optimization (`FlatList`)

When rendering lists of tasks, habits, checklists, or workspaces that may exceed **20 items**, avoid mapping raw arrays inside a standard `ScrollView`. Use `FlatList` (note: `FlashList` is **not** an installed dependency in Pebble) with these standard configurations:

* **Stable Key Extractor**: Always provide a stable string keyExtractor:
  ```typescript
  keyExtractor={(item) => item.id}
  ```
* **Predictable Row Heights**: Align list rows to `ROW_SPEC` (`shared/constants/rowSpec.ts`). Where rows have fixed height, provide `getItemLayout` to bypass asynchronous layout measurements:
  ```typescript
  getItemLayout={(_, index) => ({
    length: ROW_SPEC.listRow.minHeight,
    offset: ROW_SPEC.listRow.minHeight * index,
    index,
  })}
  ```
* **Window & Batch Tuning**:
  ```typescript
  initialNumToRender={8}
  maxToRenderPerBatch={10}
  windowSize={5}
  removeClippedSubviews={true}
  ```
* **No Inline Anonymous Functions**: Never pass inline arrow functions directly to `renderItem` or row handlers inside lists. Memoize render callbacks with `useCallback`.

---

## 3. Memoization & Render Boundary Discipline

Prevent unnecessary JavaScript thread re-renders:
* **`React.memo`**: Wrap repetitive list row components (e.g. `TaskItem`, `HabitItem`, `ChecklistItemRow`) in `React.memo` with proper prop equality checks.
* **`useMemo`**: Memoize heavy data sorting, filtering, and cross-workspace item aggregation (e.g. compiling the Today preview drawers).
* **`useCallback`**: Memoize handlers passed down to list children (toggle, press, delete).

---

## 4. Worklet & UI Thread Synchronization

* **Keep Reanimated Styles in Worklets**: Animated styles (`useAnimatedStyle`) must calculate purely on the UI thread without triggering React state updates per frame.
* **`runOnJS` for Side Effects**: When Reanimated gestures or spring completions must trigger state updates (such as updating task completion in storage or firing haptics), explicitly route them through `runOnJS()`:
  ```typescript
  runOnJS(handleCompletion)(itemId);
  ```
* **Layout Transition Cost**: Avoid wrapping hundreds of list items in Reanimated `layout` transitions simultaneously on Android. Confine layout transitions to immediate parent containers or active edit modes.
