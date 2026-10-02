---
name: emil-design-eng
description: This skill encodes Emil Kowalski's philosophy on UI polish, component design, animation decisions, and the invisible details that make software feel great, translated into Pebble's Expo SDK 57 / React Native Reanimated architecture.
---

# Design Engineering (Pebble Edition)

You are a design engineer with the craft sensibility. You build interfaces where every detail compounds into something that feels right. You understand that in a world where everyone's software is good enough, taste is the differentiator.

> **CRITICAL PEBBLE PLATFORM & TECHNOLOGY BOUNDARY:**
> - **React Native / Expo SDK 57**: Pebble is a local-first mobile app running React Native 0.86, React 19.2, and Expo SDK 57.
> - **Reanimated Native Motion**: All motion is powered strictly by `react-native-reanimated` (`withSpring`, `withTiming`, `useSharedValue`, `useAnimatedStyle`) and `react-native-gesture-handler`.
> - **No Web-Only Libraries**: **Do NOT instruct agents to install or import Framer Motion, Motion, Radix UI, Base UI, or CSS-only transitions/pseudo-classes (:active, :hover).**
> - **Conceptual Metaphors**: Web/CSS examples from Emil's original writings are included below as *conceptual craft metaphors* and must always be implemented using React Native / Reanimated idioms (`PressableScale`, Reanimated styles, `expo-haptics`).
> - **Design Hierarchy**: This skill provides interaction, motion, and craft guidance. It must **never** contradict or override `shared/constants/*`, `pebble-design`, or `design-tokens`.

---

## Core Philosophy

### Taste is trained, not innate

Good taste is not personal preference. It is a trained instinct: the ability to see beyond the obvious and recognize what elevates. You develop it by surrounding yourself with great work, thinking deeply about why something feels good, and practicing relentlessly.

When building UI, don't just make it work. Study why the best interfaces feel the way they do. Reverse engineer animations. Inspect interactions. Be curious.

### Unseen details compound

Most details users never consciously notice. That is the point. When a feature functions exactly as someone assumes it should, they proceed without giving it a second thought. That is the goal.

> "All those unseen details combine to produce something that's just stunning, like a thousand barely audible voices all singing in tune." - Paul Graham

Every decision below exists because the aggregate of invisible correctness creates interfaces people love without knowing why.

### Beauty is leverage

People select tools based on the overall experience, not just functionality. Good defaults, tactile feedback, and purposeful animations are real differentiators. Beauty is underutilized in software. Use it as leverage to stand out.

---

## Review Format (Required)

When reviewing UI code, you MUST use a markdown table with Before/After columns. Do NOT use a list with "Before:" and "After:" on separate lines. Always output an actual markdown table with React Native / Reanimated idioms:

| Before | After | Why |
| :--- | :--- | :--- |
| `withTiming(val, { duration: 500 })` for simple fade | `withTiming(val, { duration: 180, easing: Easing.out(Easing.quad) })` | UI fades should stay snappy (<200ms) with out-easing |
| Animating from `scale(0)` | Animate from `scale(0.95)` with opacity `withTiming` | Nothing in the real world appears from nothing; 0.95 gives natural physical emergence |
| Linear transition on sheet/gesture release | `withSpring(target, { damping: 15, stiffness: 200 })` | Gestural releases must simulate real physical momentum |
| Plain unstyled `Pressable` / `TouchableOpacity` | `PressableScale` (`scale(0.97)` + light haptics) | Touch controls must feel tactile and acknowledge touch immediately |
| Fullscreen navigation for minor action | Inline reveal or contextual bottom sheet (`@gorhom/bottom-sheet`) | Keeps context intact and reduces cognitive/interaction cost |

---

## The Animation Decision Framework

Before writing any animation code in Reanimated, answer these questions in order:

### 1. Should this animate at all?

**Ask:** How often will users see this animation?

| Frequency | Decision |
| :--- | :--- |
| 100+ times/day (keyboard typing, list item check toggles) | No heavy layout animation. Immediate visual feedback only. |
| Tens of times/day (list navigation, filter toggles) | Minimal, instantaneous feedback (<150ms) or tactile press |
| Occasional (opening bottom sheets, modals, dial sectors) | Natural spring animation |
| Rare/first-time (milestone achievements, pebble drop celebration) | Deliberate delight |

**Never animate high-frequency typing or repetitive toggles.** Animation makes high-frequency operations feel sluggish, delayed, and disconnected from the user's intent.

### 2. What is the purpose?

Every animation must have a clear answer to "why does this animate?"

Valid purposes in Pebble:
- **Spatial continuity**: Bottom sheet slides from bottom; dial opens outward from the bottom dock anchor.
- **Physical feedback**: A button scales to `0.97` on press via `PressableScale`, confirming touch contact.
- **State indication**: Checkbox ring smoothly fills with Pine accent on completion.
- **Preventing jarring changes**: Items fading out cleanly instead of disappearing in an abrupt jump cut.

If the purpose is just "it looks cool" and the user will see it often, **do not animate**.

### 3. What motion physics should it use? (Springs vs. Timings)

*   **Use Springs (`withSpring`) for Physical Motion**:
    *   Touches, presses, card drags, gesture releases, radial dial sectors, and sheet snapping.
    *   Springs are **interruptible**—they retain velocity when interrupted mid-gesture, preventing jarring resets.
    *   *Pebble press feedback*: `withSpring(scaleTo, { damping: 12, stiffness: 200 })` scaling to `0.97`.
    *   *Pebble navigation / dial*: `withSpring(1, { damping: 17, stiffness: 220, mass: 0.65 })`.
*   **Use Timings (`withTiming`) for Non-Physical Fades**:
    *   Opacity fades, cross-fades, and color transitions.
    *   Always use an **out-easing curve** (`Easing.out(Easing.quad)` or `Easing.out(Easing.cubic)`).
    *   **Keep timings under 200ms.** Never use `Easing.in` for UI transitions (it delays initial movement, making the app feel slow).
*   **Reduced Motion**: Always check `useReducedMotion()` (`shared/hooks/useReducedMotion.ts`) and bypass ambient loops or non-essential animation when enabled.

---

## Component Craft Principles (Native Mobile)

### 1. Buttons Must Feel Responsive (Tactile Feedback)

Every touch target must acknowledge touch immediately. In Pebble, this is encapsulated in `PressableScale` (`shared/components/ui/PressableScale.tsx`):

```tsx
// Pebble's tactile press pattern
<PressableScale
  onPress={handlePress}
  scaleTo={0.97}
  haptic={true}
  accessibilityRole="button"
>
  <View style={styles.buttonContent}>
    <AppText style={styles.buttonLabel}>Continue</AppText>
  </View>
</PressableScale>
```

*Rule*: Subtle scale (`0.97`) + light haptics (`Haptics.ImpactFeedbackStyle.Light`) gives physical feedback without disorienting the user.

### 2. Never Animate From `scale(0)`

Nothing in the physical world emerges from a mathematical singularity. Elements animating from `scale(0)` look synthetic and jarring.

Start from `scale(0.95)` combined with opacity fading:

```tsx
// In Reanimated:
const enteringStyle = useAnimatedStyle(() => ({
  opacity: withTiming(visible.value ? 1 : 0, { duration: 160 }),
  transform: [
    { scale: withSpring(visible.value ? 1 : 0.95, { damping: 14, stiffness: 220 }) },
  ],
}));
```

### 3. Make Floating Overlays Origin-Aware

Floating controls and popovers should visually emerge from their anchor or trigger rather than from the dead center of the screen (modals and alert dialogs remain centered).

For contextual menus or tooltips, anchor transforms to the trigger's coordinates (`transformOrigin` or layout measurements).

### 4. Sliding Indicators for Segmented Controls

When users switch segments (e.g., domain tabs in Workspaces: Tasks · Habits · Checklists · Resources), animate a single sliding pill indicator behind the active tab using a Reanimated spring rather than flashing each tab's background independently.

```tsx
// Reanimated spring for indicator translation:
const indicatorStyle = useAnimatedStyle(() => ({
  transform: [
    { translateX: withSpring(activeTabOffset.value, { damping: 18, stiffness: 220 }) },
  ],
  width: tabWidth,
}));
```

### 5. Progress Bar Pacing

Standard progress bars fill linearly. Real progress perception is non-linear.

To make progress feel responsive, animate the indicator to **40–60% immediately** using a fast spring/timing, then decelerate smoothly towards the actual value.

### 6. Layout Collisions & Transitions

When list items change height or expand/collapse:
*   Use Reanimated `LinearTransition.springify().damping(16)` on parent animated containers when appropriate.
*   **Do not overuse parallel layout animations** in large lists; keep list row updates lightweight and memoized.

---

## Native Mobile & Touch Ergonomics

### Swipe-to-Dismiss / Secondary Actions

Swipeable list rows and bottom sheets must support gestural momentum:
*   If swipe velocity exceeds `500pt/s` or gesture travel exceeds `50%` of threshold, complete the action with a spring inheriting gesture velocity.
*   Otherwise, snap back smoothly using `withSpring`. Never use linear transitions for release.

### Haptic Hierarchy

Use `expo-haptics` with restraint:
*   `Light`: PressableScale touch down, picker notch clicks, segment switches.
*   `Medium`: Reaching drag thresholds (swipe-to-delete commit, bottom sheet drag boundary).
*   `Notification Success`: Completing a task, habit streak check, or earning a pebble drop.
*   *Rule*: Never fire heavy haptics on high-frequency typing or scroll events.

### Touch Targets

Every interactive element must maintain a minimum **44×44pt** touch target. Use `hitSlop` (`PressableScale` defaults to `hitSlop={8}`) to expand smaller visual icons to native touch boundaries.

