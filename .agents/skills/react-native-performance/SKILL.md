---
name: react-native-performance
description: Performance guidelines for React Native applications. Optimizes list rendering, memoization, thread synchronization, and layout animation boundaries.
---

# React Native Performance Guide

This skill governs codebase performance, rendering efficiency, and list optimization in React Native. Use these rules to ensure Pebble is fast and does not drop frames.

---

## 1. List Rendering Optimization

When rendering long lists of tasks, workspaces, or logs, avoid standard `ScrollView.map` arrays if the list can grow beyond **20 items**. Instead, use `FlatList` or `FlashList` with these optimization parameters:

*   **Key Extractor**: Always provide a stable, unique `keyExtractor` (e.g. `item.id`) to prevent layout rebuilds.
*   **Item Dimensions**: Use fixed-height rows if possible and specify `getItemLayout` to bypass layout measuring passes.
*   **Batch Tuning**:
    ```typescript
    initialNumToRender={8}
    maxToRenderPerBatch={10}
    windowSize={5}
    removeClippedSubviews={true}
    ```
*   **Prevent Arrow Functions in Props**: Never pass inline arrow functions to `renderItem` or buttons inside lists, as they recreate function instances on every render pass. Use `useCallback` to memoize event callbacks.

---

## 2. Memoization Strategy

Prevent unnecessary JavaScript thread overhead by memoizing expensive operations:
*   **useMemo**: Memoize sorting, filtering, and data transformations (e.g. compiled Today action preview lists).
*   **useCallback**: Memoize layout measurement callbacks and toggle click handlers.
*   **React.memo**: Wrap heavy list item components (like card rows) in `React.memo` to prevent re-evaluation if their parent re-renders.

---

## 3. Reanimated & Gesture Thread Balance

Keep the UI thread and JS thread in sync:
*   **Native Driver**: For standard React Native `Animated` utilities, always configure `useNativeDriver: true`.
*   **Worklet Execution**: Ensure all reanimated values and configurations run purely on the UI thread inside style worklets.
*   **Layout Animation Cost**: Use `layout` transitions (`Layout.springify()`) sparingly. Too many parallel layout transitions in a list can cause frame drops on older Android devices. Group layout updates inside layout boundaries.
*   **Offscreen Rendering**: Avoid using layout configurations like `shouldRasterizeIOS` or `renderToHardwareTextureAndroid` unless the component is static and contains complex nested vectors.
