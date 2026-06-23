# UI Debt Audit Report: Pebble Productivity App

This document details the UI debt, visual clutter, and duplicate functionality identified across the four major screens of the Pebble app. The goal of this audit is to streamline user flows, establish a clean visual hierarchy, and remove redundant entry points before implementing future features.

---

## Screen Inventory

Below is a complete inventory of the visible components on each major tab screen, classified by their necessity:
*   🟢 **Essential**: Core functional components critical to the primary purpose of the screen.
*   🟡 **Optional**: Secondary components that provide value (e.g., gamification, context) but are not strictly required for execution.
*   🔴 **Redundant**: Components that duplicate existing functionality or add visual noise with minimal utility.

### 1. Today Dashboard (`app/(tabs)/index.tsx`)
*   🟢 **AppHeader** — Displays greeting, next alarm preview, unread notifications indicator, lifetime pebble count, and gems balance.
*   🟢 **Overdue Tasks Section** — Displays outstanding tasks scheduled for previous dates.
*   🟢 **Today's Tasks Section** — Core list for today's active tasks.
*   🟢 **Today's Habits Section (`HabitStreakCards`)** — Core checklist for daily habit consistency.
*   🟡 **Streak Banner & Gem Restorer** — Displays streak count and motivation, along with a button to recover broken streaks using 1 Gem.
*   🟡 **Continue Working In Card** — Dynamic recommendation card pointing to the user's most active workspace.
*   🟡 **Pebble Sanctuary Modal (Pebble Jar Modal)** — Interactive jar visualization, milestone stage breakdown, and pebble sources.
*   🔴 **Search and Filter Bar** — Full-text search and sliders filter button located at the top of the dashboard.
*   🔴 **Filters & Sorting Modal** — The slide-up modal that configures workspace filters, priority filters, and item sorting for the Today screen.

### 2. Workspace / Planner (`app/(tabs)/tasks.tsx`)
*   🟢 **AppHeader** — Screen title, with quick links to the Archive and Recycle Bin.
*   🟢 **SegmentedSwitcher** — Tab switcher toggling between **Workspaces**, **All Habits**, and **Vault**.
*   🟢 **Workspace Grid** — Grid of folders/workspace folders.
*   🟢 **Add Task Card / Input Bar** — Context-specific entry input when a workspace folder is open.
*   🟢 **Task List (Overdue, Today, Upcoming, Inbox)** — Task categorizations within a workspace.
*   🟢 **Bulk Selection Bar & Target Workspace Selector** — Action bar (Complete, Archive, Move, Delete) appearing during bulk selection.
*   🟢 **Add Habit Card / Input Bar** — Text input + add button inside the habits tab.
*   🟢 **Habit Priority Selector** — Priority tags (High, Medium, Low) visible during habit creation.
*   🟢 **Vault Section** — Interactive grid/list of saved links, notes, and ideas with actions to delete, archive, or convert to tasks.
*   🟢 **TaskEditorSheet** — Modal sheet for granular editing of tasks and habits.
*   🟢 **WorkspaceModal** — Workspace creator/edit sheet.
*   🟡 **Progress Section** — Header card in the Habits tab showing completion percentage and longest streak.
*   🟡 **Habit Priority Filter Row** — Tab-level filter pills (All, High, Medium, Low) for habits.
*   🔴 **Heuristic "Pebble Capture" Pill Button** — Prominent text button at the top of the Planner area triggering the NLP capture sheet.
*   🔴 **Floating Action Button (Zap FAB)** — Floating button at the bottom right corner triggering the NLP capture sheet.

### 3. Scheduler (`app/(tabs)/calendar.tsx`)
*   🟢 **Screen Header** — Screen title and "SCHEDULE" kicker.
*   🟢 **SegmentedSwitcher** — Switcher toggling between **Month View** and **Week Agenda**.
*   🟢 **Month Navigation Header** — Previous/next chevrons and month/year indicator.
*   🟢 **Weekday Headers & Days Grid** — Interactive grid showing completion heatmap indicators on dates.
*   🟢 **Week Days Strip** — Horizontal 7-day strip layout for week view.
*   🟢 **Selected Date Info Strip** — Inline date indicator with item counts and an inline "Add Task" (+) button.
*   🟢 **Anytime / All Day Tasks Scroll View** — Horizontal container for non-timed items scheduled for the selected date.
*   🟢 **Hourly Timeline Grid Rows** — 24-hour timeline slots that can be tapped to schedule tasks directly.
*   🟢 **Timed Block Cards & Snap Outlines** — Interactive blocks reflecting scheduled tasks and habits with layout calculation.
*   🟡 **Peak Focus Active Banner** — Dynamic bar explaining optimal cognitive hours and highlight colors.

### 4. Focus Screen (`app/(tabs)/focus.tsx`)
*   🟢 **FocusHeader** — Top controls for ambient soundtrack player and focus glow toggles.
*   🟢 **ModeSelector** — Toggles focus engine between Pomodoro and Stopwatch.
*   🟢 **TimerCockpit** — Breathing timer rings, duration shortcuts, stopwatch lap controls, and custom minute inputs.
*   🟢 **FocusTargetCard** — Link/unlink selector attaching a task or habit to the current focus session.
*   🟢 **TaskPickerModal** — Full task and habit selection sheet.
*   🟢 **MusicPlayerModal** — Ambient audio deck, volume sliders, track tags, liked items, and custom import button.
*   🟡 **FocusStatsCard** — Session counts and total duration metrics card.
*   🟡 **Laps List** — Scrollable lap lists displayed in stopwatch mode.
*   🟡 **ScreenSwipeWrapper** — Horizontal swiping shell container.

---

## Redundancies

### 1. Capture Entry Points
On the **Workspace / Planner Screen**, a user has three separate pathways to trigger the same Natural Language Parsing (NLP) capture sheet:
1.  **Tab Bar Center Button**: The static "+" button on the global tab navigator is always visible and opens the Quick Add sheet.
2.  **Heuristic "Pebble Capture" Pill**: A large pill button centered at the top of the workspaces/habits switcher.
3.  **Floating Action Button (Zap FAB)**: A floating primary color button positioned in the bottom right corner.
Having three identical entry points on a single view causes visual clutter and decision fatigue.

### 2. Search Bars & Filtering Logic
Search and filter inputs are heavily fragmented across different screens:
1.  **Today Screen**: Has its own search bar and a multi-tiered sorting/filtering sheet (item types, priorities, workspaces, alphabetical/priority sorting).
2.  **Workspace Grid**: Features a search bar to filter workspaces.
3.  **Inside Workspace**: Features a search bar to filter tasks inside that specific folder.
Today's search bar is redundant; the Today screen should act as a clean, pre-filtered dashboard focused on immediate daily execution. Searching and sorting are core planner operations and should be consolidated on the Workspaces tab.

### 3. Duplicated Visualizations (Pebble Jar)
*   **The Mascot overlay** floats globally in the bottom corner of the tab bar layout, visually representing current pebbles and streaks.
*   Tapping the Today screen header opens the **Pebble Sanctuary Modal**, which renders the `InteractivePebbleJar` in "view" mode, duplicating the visual representation of the jar and adding a separate overlay modal.

---

## Visual Hierarchy Issues

### 1. Header Crowding
*   **Today Screen**: The area above the fold is extremely crowded. It packs the AppHeader, the streak count motivation strip, the gem restoration callout, a full search input bar, a filter sliders button, and the "Continue Working In" recommendation banner. This leaves very little screen estate for today's actual tasks.
*   **Workspace Screen**: Stacked headers (AppHeader -> Switcher Segment -> Pebble Capture Pill -> Search Bar) consume nearly `300px` of vertical height before listing any folders or items, compressing the core viewport.

### 2. Touch Target Conflicts
*   On the Workspace tab, the **Floating Action Button (Zap FAB)** is positioned in the bottom-right corner, directly adjacent to the global **Crow Mascot Overlay**. On smaller devices or when the mascot displays recommendation cards, these touch zones overlap, resulting in accidental mascot interactions when trying to quick-add tasks.

### 3. Chrono-Visual Noise (Scheduler Screen)
*   The **Scheduler** screen displays a large volume of visual indicators. Colored heatmap circles (green/yellow/gray) on the calendar cells, highlighted hourly optimal focus blocks (purple/green/orange depending on flow types), and multi-colored timeline cards create a high-contrast layout that is difficult to scan quickly.

---

## Quick Wins

These high-impact, low-risk cleanups can be executed immediately:
1.  **Prune Redundant Capture Points**: Remove the heuristic "Pebble Capture" pill button and the bottom-right floating Zap FAB from `app/(tabs)/tasks.tsx`. The center tab bar "+" button should be the single, unified entry point for quick-adding tasks, habits, and vault items.
2.  **Remove Search/Filter from Today**: Eliminate the search bar and sliders button from `app/(tabs)/index.tsx`. Today's dashboard should remain a simple, distraction-free agenda for the current day.
3.  **Resolve Mascot/FAB Clash**: Removing the bottom-right FAB on the Workspace screen immediately resolves the touch target overlap with the Crow Mascot overlay.
4.  **Consolidate Dashboard Metadata**: Merge the streak recovery gems strip and the next reminder preview into the core AppHeader to reclaim vertical screen space on the Today tab.

---

## Long-Term Cleanup Opportunities

1.  **Refactor Monolithic Files**: Both `app/(tabs)/index.tsx` (~2,200 lines) and `app/(tabs)/_layout.tsx` (~2,400 lines) are oversized. Extract sub-components (such as the Pebble Sanctuary modal, time picker dial, and folder picker sheets) into modular files inside `/components/` or `/modules/`.
2.  **Consolidate Gamification Screens**: Instead of presenting the Pebble Sanctuary as an overlay modal triggered from the Today dashboard, integrate it into a dedicated "Profile & Sanctuary" subscreen, keeping the daily execution hub clean.
3.  **Establish a Unified Search/Command Hub**: Replace individual screen-level search inputs with a central command hub (similar to a launcher) that handles global searches for tasks, habits, vault items, and workspaces in a single interface.
4.  **Audit Focus Screen Actions**: Move the FocusStatsCard to the profile tab, and simplify stopwatch lap lists to keep the Focus screen strictly centered on Pomodoro execution.
