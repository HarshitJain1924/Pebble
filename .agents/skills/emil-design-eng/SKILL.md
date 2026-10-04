---
name: emil-design-eng
description: Interaction, motion craft, and tactile polish for Pebble on React Native, Expo SDK 57, and Reanimated. Enforces UI thread purity, gesture momentum, and intentional feedback heuristics.
---

# Interaction & Motion Craft (Pebble Edition)

> **Truth as of 2026-10-02.** Verified against active React Native Reanimated implementations (`shared/components/ui/PressableScale.tsx`, `shared/components/navigation/PebbleRadialTabBar.tsx`, `@gorhom/bottom-sheet`).

This skill governs the micro-interactions, gestures, springs, timings, and tactile feedback in Pebble. It guides judgment rather than imposing rigid dogma.

> **CRITICAL PLATFORM BOUNDARY:**
> - **React Native / Expo SDK 57**: Pebble is a local-first mobile app running React Native 0.86, React 19.2, and Expo SDK 57.
> - **UI Thread Motion**: All motion is powered by `react-native-reanimated` (`withSpring`, `withTiming`, `useSharedValue`, `useAnimatedStyle`) and `react-native-gesture-handler`.
> - **No Web-Only Libraries**: NEVER recommend CSS transitions, pseudo-classes (`:hover`, `:active`), Framer Motion, Motion, Radix UI, Base UI, or DOM manipulation.
> - **Authority Sequence**: This skill is subordinate to active code, `pebble-design`, and `design-tokens`. It guides interaction craft, not visual styling or product architecture.

---

## 1. Skill Contract & Deterministic Activation

* **Activates When**: Writing, refining, or debugging UI interactions, gesture handlers, Reanimated animations, press states, bottom sheet transitions, or haptics.
* **Responsible For**:
  - Motion decisions (should it animate, frequency checks, intent definition).
  - Reanimated implementation details (spring parameters, timing durations, easing curves).
  - UI thread execution purity (worklet boundaries, avoiding layout recalculation passes).
  - Tactile feedback heuristics (`PressableScale`, `expo-haptics`).
  - Gesture handoff, velocity preservation, and interruptibility.
* **Must NOT Do**:
  - Does NOT invent design tokens or override colors/spacing from `shared/constants/*`.
  - Does NOT recommend web libraries or CSS.
  - Does NOT impose animations on high-frequency, non-physical actions.
  - Does NOT alter business logic, data models, or repository locking.
* **Authority Hierarchy**:
  1. Active source code & `shared/constants/*`
  2. `pebble-design` (Visual constitution)
  3. `design-tokens` (Token constraints)
  4. `emil-design-eng` (Interaction craft authority)

---

## 2. The Animation Decision Framework

Before writing any Reanimated code, evaluate these three questions in order:

### 1. Should this animate at all?
**Intent first, implementation second.** Animate interaction when motion communicates state, physicality, or spatial continuity. Avoid animation when it adds latency, delay, or noise.

| Interaction Frequency | Decision Heuristic |
| :--- | :--- |
| **High (100+ times/day)**: Keyboard typing, list check toggles, search inputs | **No layout animation.** Immediate visual feedback only. Animation here introduces perceptible latency. |
| **Medium (Tens of times/day)**: List row selection, tab switches, filter chips | **Near-instantaneous feedback (<150ms)** or subtle press scale. |
| **Occasional**: Opening bottom sheets, contextual menus, modal dialogues | **Natural physical springs.** Interruptible and velocity-aware. |
| **Rare / First-Time**: Daily pebble drop milestone, achievement badge unlock | **Deliberate celebratory delight.** |

### 2. What is the purpose?
Every animation must have a concrete purpose:
- **Spatial continuity**: Explains where an element came from (e.g. bottom sheet slides up from the anchor).
- **Physical feedback**: Confirms contact with a touch target (`scale(0.97)` on press).
- **State indication**: Confirms completion (e.g. checkbox ring fill).
- **Preventing jarring cuts**: Softening a sudden removal with a fast opacity fade (<180ms).

*If the only reason is "it looks cool," do not animate.*

### 3. Which tool and thread?
- **UI Thread Purity**: Keep motion purely on the UI thread inside Reanimated worklets (`useAnimatedStyle`). Never drive layout animations via React `setState` per frame.
- **Transform & Opacity are Free**: Animate `transform` (`scale`, `translateX`, `translateY`) and `opacity`. Avoid animating layout properties (`height`, `width`, `margin`, `padding`, `gap`) on flex children because they trigger Yoga layout recalculations for the node and all its siblings on every frame.
- **Isolated Elements Exception**: Absolutely positioned elements with no children (such as a progress bar fill or sliding segment indicator) may animate `width` or `left` to preserve corner radii without causing sibling layout recalculation passes.

---

## 3. Motion Physics & Configurations

There is no central motion token object in Pebble. Authors configure Reanimated inline using these production heuristics:

### Springs for Physical Motion (`withSpring`)
Use springs for physical interactions (touches, gesture drags, sheet snapping, dial sectors):
- **Press feedback (`PressableScale`)**:
  ```typescript
  withSpring(0.97, { damping: 12, stiffness: 200 })
  ```
- **Navigation dial & bottom sheets**:
  ```typescript
  withSpring(1, { damping: 17, stiffness: 220, mass: 0.65 })
  ```
- **Interruptibility**: Springs naturally preserve momentum when gestures reverse mid-flight. Always let gesture velocity hand off into the spring:
  ```typescript
  withSpring(targetPosition, { velocity: gesture.velocityY, damping: 18, stiffness: 200 })
  ```

### Timings for Opacity & Color (`withTiming`)
Use timings only for non-physical transitions (fades, color shifts):
- **Duration**: Snappy, **under 200ms** (typically 150–180ms).
- **Easing**: Always use **out-easing** (e.g. `Easing.out(Easing.quad)` or `Easing.out(Easing.cubic)`). Never use `Easing.in` for UI entry transitions as it introduces perceptible latency.

### The `scale(0)` Anti-Pattern
**Never animate an entering element from `scale(0)`.** Real physical objects do not emerge from a mathematical point. Start from `scale(0.95)` paired with an opacity fade:
```typescript
const enteringStyle = useAnimatedStyle(() => ({
  opacity: withTiming(visible.value ? 1 : 0, { duration: 160 }),
  transform: [
    { scale: withSpring(visible.value ? 1 : 0.95, { damping: 14, stiffness: 220 }) },
  ],
}));
```

---

## 4. Interaction Heuristics (Craft over Dogma)

### 4.1 Tactile Press Feedback
* **Heuristic**: Prefer Pebble's `PressableScale` (`shared/components/ui/PressableScale.tsx`) for primary buttons, action tiles, and cards where tactile acknowledgement adds confidence.
* **Do NOT force on every control**: Static badges, passive list items without direct tap actions, or high-frequency inline text links do not require `PressableScale`.
* **Standard Pattern**:
  ```tsx
  <PressableScale
    onPress={handlePress}
    scaleTo={0.97}
    haptic={true}
    accessibilityRole="button"
  >
    <View style={styles.buttonContent}>
      <AppText style={styles.buttonLabel}>Complete</AppText>
    </View>
  </PressableScale>
  ```

### 4.2 Segmented Controls & Tabs
* **Heuristic**: A shared sliding indicator can be used when it improves spatial continuity and matches the existing component (e.g. Workspace domain tabs: Tasks · Habits · Checklists · Resources).
* **Pattern**: Animate a single indicator background with a Reanimated spring rather than flashing individual active tabs.

### 4.3 Gestural Momentum & Swipe Actions
* **Heuristic**: Swipeable list rows and bottom sheets must respect user velocity.
* If swipe velocity exceeds `500pt/s` or gesture travel exceeds 50% of the action threshold, complete the action using `withSpring` inheriting `gesture.velocityX`. Otherwise, snap back smoothly. Never use linear resets on gesture release.

### 4.4 Restrained Haptics (`expo-haptics`)
* **Heuristic**: Use restrained haptic feedback for meaningful tactile events; avoid haptics for high-frequency or continuous interactions.
* `Light` (`Haptics.ImpactFeedbackStyle.Light`): `PressableScale` touch-down, segmented control switch, picker notch.
* `Medium`: Crossing drag-to-delete threshold, radial dial sector lock.
* `Notification Success`: Completing a task, habit streak check, or earning a pebble drop.
* **Never fire haptics** on text input typing, continuous list scrolling, or high-frequency state updates.

### 4.5 Reduced Motion
Always respect the user's OS accessibility preferences using `useReducedMotion()` (`shared/hooks/useReducedMotion.ts`). When active, bypass looping, scale, or ambient springs and fall back to instant transitions or simple opacity changes.

---

## 5. Review Format (Required)

When proposing or reviewing interaction and animation code, use this markdown table format:

| Before | After | Why |
| :--- | :--- | :--- |
| `withTiming(val, { duration: 500 })` for fade | `withTiming(val, { duration: 180, easing: Easing.out(Easing.quad) })` | UI fades must stay snappy (<200ms) with out-easing |
| Animating from `scale(0)` | Animate from `scale(0.95)` with opacity `withTiming` | Physical emergence; 0.95 prevents synthetic popping |
| Linear transition on gesture release | `withSpring(target, { velocity: e.velocityY, damping: 16 })` | Gestural releases must honor physical momentum |
| Plain unstyled `Pressable` on main action | `PressableScale` (`scale(0.97)` + light haptic) | Acknowledges touch with tactile feedback |
| Animating container `height` in a list | Animate `opacity` + `transform` on item | Avoids triggering Yoga layout recalculation on siblings |
