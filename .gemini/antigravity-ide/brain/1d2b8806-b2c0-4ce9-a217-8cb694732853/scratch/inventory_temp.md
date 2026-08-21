### createWorkspace
- **Domain**: Workspace
- **Repositories**: WorkspaceRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: No
- **Transaction Boundary**: No

### updateWorkspace
- **Domain**: Workspace
- **Repositories**: WorkspaceRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: No
- **Transaction Boundary**: No

### deleteWorkspace
- **Domain**: Workspace
- **Repositories**: WorkspaceRepository, TaskRepository, HabitRepository, ChecklistRepository, ResourceRepository, RecycleBinRepository, GraphRepository
- **Services**: shared/utils/mutex, reminders.service
- **Locking**: Yes
- **Journaling**: No
- **Graph**: Yes
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: Yes

### archiveWorkspace
- **Domain**: Workspace
- **Repositories**: WorkspaceRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: No
- **Transaction Boundary**: No

### restoreWorkspaceArchive
- **Domain**: Workspace
- **Repositories**: WorkspaceRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: No
- **Transaction Boundary**: No

### createTask
- **Domain**: Task
- **Repositories**: TaskRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### createHabit
- **Domain**: Habit
- **Repositories**: HabitRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### convertTaskToHabit
- **Domain**: Task
- **Repositories**: TaskRepository
- **Services**: shared/utils/id
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: Yes
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### convertHabitToTask
- **Domain**: Task
- **Repositories**: HabitRepository
- **Services**: shared/utils/id
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: Yes
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### createChecklist
- **Domain**: Checklist
- **Repositories**: ChecklistRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### mergeChecklistItems
- **Domain**: Checklist
- **Repositories**: ChecklistRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### createResource
- **Domain**: Resource
- **Repositories**: ResourceRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### completeTask
- **Domain**: Task
- **Repositories**: TaskRepository
- **Services**: pluginManager
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: Yes
- **Events Emitted**: Yes
- **Widget Sync**: Yes
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### uncompleteTask
- **Domain**: Task
- **Repositories**: TaskRepository
- **Services**: pluginManager
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: Yes
- **Events Emitted**: Yes
- **Widget Sync**: Yes
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### updateTask
- **Domain**: Task
- **Repositories**: TaskRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: Yes
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### updateHabit
- **Domain**: Habit
- **Repositories**: HabitRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### completeTasks
- **Domain**: Task
- **Repositories**: None
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### completeHabits
- **Domain**: Habit
- **Repositories**: None
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### archiveTasks
- **Domain**: Task
- **Repositories**: None
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### archiveHabits
- **Domain**: Habit
- **Repositories**: None
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### moveTask
- **Domain**: Task
- **Repositories**: TaskRepository, MoveJournalRepository
- **Services**: None
- **Locking**: No
- **Journaling**: Yes
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: Yes
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### completeHabit
- **Domain**: Habit
- **Repositories**: HabitRepository
- **Services**: pluginManager
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: Yes
- **Events Emitted**: Yes
- **Widget Sync**: Yes
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### uncompleteHabit
- **Domain**: Habit
- **Repositories**: HabitRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: Yes
- **Events Emitted**: Yes
- **Widget Sync**: Yes
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### toggleChecklistItem
- **Domain**: Checklist
- **Repositories**: ChecklistRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: Yes
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### addChecklistItem
- **Domain**: Checklist
- **Repositories**: ChecklistRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### deleteChecklistItem
- **Domain**: Checklist
- **Repositories**: ChecklistRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### recoverHabitStreak
- **Domain**: Habit
- **Repositories**: HabitRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: No
- **Transaction Boundary**: No

### recycleHabit
- **Domain**: Habit
- **Repositories**: RecycleBinRepository, HabitRepository, MoveJournalRepository
- **Services**: reminders.service, shared/utils/id
- **Locking**: No
- **Journaling**: Yes
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: No
- **Transaction Boundary**: No

### restoreHabit
- **Domain**: Habit
- **Repositories**: RecycleBinRepository, MoveJournalRepository
- **Services**: shared/utils/id
- **Locking**: No
- **Journaling**: Yes
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: No
- **Widget Sync**: No
- **Analytics Snapshot**: No
- **Transaction Boundary**: No

### recycleChecklist
- **Domain**: Checklist
- **Repositories**: RecycleBinRepository, ChecklistRepository, MoveJournalRepository
- **Services**: shared/utils/id
- **Locking**: No
- **Journaling**: Yes
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: No
- **Transaction Boundary**: No

### recycleResource
- **Domain**: Resource
- **Repositories**: RecycleBinRepository, ResourceRepository, MoveJournalRepository
- **Services**: shared/utils/id
- **Locking**: No
- **Journaling**: Yes
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: No
- **Transaction Boundary**: No

### recycleTask
- **Domain**: Task
- **Repositories**: TaskRepository, MoveJournalRepository
- **Services**: storage.service, reminders.service, events/state-events, shared/utils/id, analytics/productivity-history
- **Locking**: No
- **Journaling**: Yes
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### recycleTasks
- **Domain**: Task
- **Repositories**: RecycleBinRepository, TaskRepository, MoveJournalRepository
- **Services**: reminders.service, events/state-events, shared/utils/id, analytics/productivity-history
- **Locking**: No
- **Journaling**: Yes
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### clearCompletedTasks
- **Domain**: Task
- **Repositories**: TaskRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: No
- **Widget Sync**: No
- **Analytics Snapshot**: No
- **Transaction Boundary**: No

### permanentlyDeleteTask
- **Domain**: Task
- **Repositories**: TaskRepository
- **Services**: reminders.service, events/state-events, analytics/productivity-history
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### permanentlyDeleteHabit
- **Domain**: Habit
- **Repositories**: HabitRepository
- **Services**: reminders.service, events/state-events, analytics/productivity-history
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### permanentlyDeleteChecklist
- **Domain**: Checklist
- **Repositories**: ChecklistRepository
- **Services**: events/state-events, analytics/productivity-history
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### permanentlyDeleteResource
- **Domain**: Resource
- **Repositories**: ResourceRepository
- **Services**: events/state-events, analytics/productivity-history
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### restoreTask
- **Domain**: Task
- **Repositories**: MoveJournalRepository, TaskRepository
- **Services**: storage.service, reminders.service, events/state-events, shared/utils/id, analytics/productivity-history
- **Locking**: No
- **Journaling**: Yes
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: Yes
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### restoreTasks
- **Domain**: Task
- **Repositories**: WorkspaceRepository, RecycleBinRepository, MoveJournalRepository, TaskRepository
- **Services**: reminders.service, events/state-events, shared/utils/id, analytics/productivity-history
- **Locking**: No
- **Journaling**: Yes
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: Yes
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### restoreChecklist
- **Domain**: Checklist
- **Repositories**: ChecklistRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: No
- **Widget Sync**: No
- **Analytics Snapshot**: No
- **Transaction Boundary**: No

### restoreResource
- **Domain**: Resource
- **Repositories**: ResourceRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: No
- **Widget Sync**: No
- **Analytics Snapshot**: No
- **Transaction Boundary**: No

### restoreWorkspace
- **Domain**: Workspace
- **Repositories**: WorkspaceRepository, TaskRepository, HabitRepository, ChecklistRepository, ResourceRepository
- **Services**: storage.service, events/state-events, shared/utils/mutex
- **Locking**: Yes
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: No
- **Transaction Boundary**: No

### updateChecklist
- **Domain**: Checklist
- **Repositories**: ChecklistRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### updateResource
- **Domain**: Resource
- **Repositories**: ResourceRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### toggleArchiveResource
- **Domain**: Resource
- **Repositories**: ResourceRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: No
- **Widget Sync**: No
- **Analytics Snapshot**: No
- **Transaction Boundary**: No

### moveHabit
- **Domain**: Habit
- **Repositories**: HabitRepository, MoveJournalRepository
- **Services**: None
- **Locking**: No
- **Journaling**: Yes
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: Yes
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### moveChecklist
- **Domain**: Checklist
- **Repositories**: ChecklistRepository, MoveJournalRepository
- **Services**: None
- **Locking**: No
- **Journaling**: Yes
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### moveResource
- **Domain**: Resource
- **Repositories**: ResourceRepository, MoveJournalRepository
- **Services**: None
- **Locking**: No
- **Journaling**: Yes
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### reorderTasks
- **Domain**: Task
- **Repositories**: TaskRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: Yes
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No

### recordFocusSession
- **Domain**: Other
- **Repositories**: GraphRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: Yes
- **Rewards**: Yes
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: No
- **Transaction Boundary**: No

### logSystemEvent
- **Domain**: Other
- **Repositories**: GraphRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: Yes
- **Rewards**: No
- **Events Emitted**: No
- **Widget Sync**: No
- **Analytics Snapshot**: No
- **Transaction Boundary**: No

### reorderWorkspaces
- **Domain**: Workspace
- **Repositories**: WorkspaceRepository
- **Services**: None
- **Locking**: No
- **Journaling**: No
- **Graph**: No
- **Rewards**: No
- **Events Emitted**: Yes
- **Widget Sync**: No
- **Analytics Snapshot**: Yes
- **Transaction Boundary**: No
