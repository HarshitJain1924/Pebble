# Todo App (Expo SDK 54)

A local-first productivity app built with Expo Router. It combines todos, habits, reminders, analytics, and a focus timer with no backend required.

## Screens

### Today
File: `app/(tabs)/index.tsx`

The Today screen is a dashboard, not just a list. It shows:
- Completion progress for all stored todos and habits
- A short motivational status message
- Category shortcuts into the rest of the app
- A preview of the next few pending todos
- A next-reminder card when scheduled alarms exist
- A floating action button for quick navigation

### Planner
File: `app/(tabs)/tasks.tsx`

The Planner screen is the main task workspace. It supports:
- Task CRUD
- Subtasks
- Multi-list organization
- Task completion and deletion
- Per-task reminders with custom time and weekday scheduling
- Deep-link focus from notifications

### Daily
File: `app/(tabs)/daily.tsx`

The Daily screen is for habits and streaks. It supports:
- Habit CRUD
- Current streak and best streak tracking
- Daily reset behavior for `completedToday`
- Reminder scheduling with optional weekdays
- Progress summary and completion banners
- Deep-link focus from notifications

### Analytics
File: `app/(tabs)/calendar.tsx`

The Analytics screen shows productivity history with:
- Calendar heatmap-style views
- Month navigation
- Daily history details
- Todo and habit history summaries

### Focus
File: `app/(tabs)/focus.tsx`

The Focus screen is a Pomodoro-style timer with:
- Preset session lengths
- Start/pause and reset controls
- Session stats
- Animated focus visuals

## Navigation

The tab layout lives in `app/(tabs)/_layout.tsx`.

Visible tabs:
- Today
- Planner
- Analytics
- Focus

The Daily screen is available as a route and is used by the app even though it is not shown as a tab.

## Reminders

Reminder logic is centralized in `services/reminders.ts`.

Current behavior:
- Native builds use `expo-notifications`
- Web uses browser notifications when available
- Web falls back to local in-app timers when needed
- Reminder payloads deep-link back into the correct todo or habit
- Reminder schedules can include custom hours, minutes, and weekdays

Important:
- Expo Go does not fully support scheduled background notifications.
- For the most reliable reminder behavior, use a development build or production build.

## Storage

The app stores everything locally in AsyncStorage.

- Todos: `todoapp:v1`
- Daily habits: `todoapp:daily:v1`

## Tech Stack

- Expo SDK 54
- Expo Router
- React Native
- AsyncStorage
- Expo Notifications
- React Native Calendars

## Run Locally

```bash
npm install
npx expo start
```

For web:

```bash
npx expo start --web
```

If Metro switches to another port such as `8082`, use that exact port in the browser.

## What’s Working Well

- Local-first storage with no backend
- Reminder scheduling with deep links
- Habit streak tracking
- Productivity history and analytics
- A stronger Today dashboard with quick navigation

## Possible Next Improvements

- Edit existing todo text
- Rename task lists
- Search and filters
- Drag-and-drop ordering
- Swipe actions for habits
- More detailed dashboard summaries
