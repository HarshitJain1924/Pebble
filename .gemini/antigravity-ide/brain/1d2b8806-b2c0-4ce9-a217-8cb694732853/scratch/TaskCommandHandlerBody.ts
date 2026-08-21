/**
   * Create and persist a Task entity.
   */
  static async createTask(
    input: Task | ParsedProductivityItem,
    workspaceId: string = INBOX_WORKSPACE_ID,
    options?: CreateEntityOptions,
  ): Promise<Task> {
    let task: Task;
    let needsScheduling = false;
    let parsedInput: ParsedProductivityItem | undefined;

    if (isParsedProductivityItem(input)) {
      task = buildTask(input, workspaceId);
      needsScheduling = true;
      parsedInput = input;
    } else {
      const targetWorkspace = input.workspaceId || workspaceId || INBOX_WORKSPACE_ID;
      task = {
        ...input,
        workspaceId: targetWorkspace,
        createdAt: input.createdAt || Date.now(),
        updatedAt: Date.now(),
        status: input.status || "todo",
        priority: input.priority || "none",
      };

      if (task.reminder && task.reminder.notificationIds) {
        task.reminder.notificationIds = undefined; // Strip so reconciler uses fresh IDs
      }
      if (task.reminder?.enabled && task.reminder?.triggerAt) {
        needsScheduling = true;
      }
    }

    // 1. Domain persistence FIRST
    await TaskRepository.saveTask(task);

    // 2. OS Notification Scheduling SECOND (isolated)
    if (needsScheduling) {
      try {
        if (parsedInput) {
          const notificationIds = await scheduleTaskNotifications(task.id, parsedInput);
          if (notificationIds.length > 0 && task.reminder) {
            task.reminder.notificationIds = notificationIds;
            await TaskRepository.updateNotificationIds(task.id, task.workspaceId, notificationIds);
          }
        } else {
          task = await rescheduleTodoReminders(task);
          await TaskRepository.updateNotificationIds(task.id, task.workspaceId, task.reminder?.notificationIds);
        }
      } catch (e) {
        console.warn("[EntityCommandService] Failed to schedule task reminder after persistence:", e);
      }
    }

    if (!options?.skipEvents) {
      emitStateChange("tasks_changed", options?.source);
    }

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    return task;
  }

/**
   * Update an existing Task.
   * Modifies task fields and intelligently reschedules reminders only if relevant state changed.
   */
  static async updateTask(
    taskId: string,
    workspaceId: string,
    updates: Partial<Task>,
    options?: CreateEntityOptions,
  ): Promise<Task> {
    const tasksMap = await TaskRepository.getTasks(workspaceId);
    const existing = tasksMap[taskId];
    if (!existing) {
      throw new Error(`Task ${taskId} not found in workspace ${workspaceId}`);
    }

    if (updates.workspaceId && updates.workspaceId !== workspaceId) {
      throw new Error("Workspace movement is not supported in updateTask.");
    }

    let updatedTask: Task = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      workspaceId: existing.workspaceId,
      updatedAt: Date.now(),
    };

    // Reminder evaluation
    const titleChanged = updates.title !== undefined && updates.title !== existing.title;
    const categoryChanged = updates.categoryId !== undefined && updates.categoryId !== existing.categoryId;
    const recurrenceChanged = updates.recurrence !== undefined && JSON.stringify(updates.recurrence) !== JSON.stringify(existing.recurrence);
    const reminderChanged = updates.reminder !== undefined && JSON.stringify(updates.reminder) !== JSON.stringify(existing.reminder);
    const statusChanged = updates.status !== undefined && updates.status !== existing.status;
    const scheduleChanged = updates.schedule !== undefined && JSON.stringify(updates.schedule) !== JSON.stringify(existing.schedule);
    const archivedChanged = ("archivedAt" in updates) && updates.archivedAt !== existing.archivedAt;

    const needsReminderUpdate = titleChanged || categoryChanged || recurrenceChanged || reminderChanged || statusChanged || scheduleChanged || archivedChanged;

    if (needsReminderUpdate && updatedTask.reminder && updatedTask.reminder.notificationIds) {
      updatedTask.reminder = { ...updatedTask.reminder, notificationIds: undefined }; // Strip so reconciler uses fresh IDs
    }

    // 1. Domain persistence FIRST
    await TaskRepository.saveTask(updatedTask);

    // 2. OS Notification Scheduling SECOND (isolated)
    if (needsReminderUpdate) {
      // Fire and forget cancel existing
      if (existing.reminder?.notificationIds?.length) {
        cancelReminderIds(existing.reminder.notificationIds, { throwOnError: false }).catch(e => {
          console.warn("[EntityCommandService] Failed to cancel old reminder IDs during update", e);
        });
      }
      
      // Reschedule if still applicable
      const isArchived = !!updatedTask.archivedAt;
      const isCompleted = updatedTask.status === "completed";

      if (!isArchived && !isCompleted) {
        try {
          updatedTask = await rescheduleTodoReminders(updatedTask);
          await TaskRepository.updateNotificationIds(updatedTask.id, updatedTask.workspaceId, updatedTask.reminder?.notificationIds);
        } catch (e) {
          console.warn("[EntityCommandService] Failed to reschedule task reminder during update:", e);
        }
      }
    }

    if (!options?.skipEvents) {
      emitStateChange("tasks_changed", options?.source);
    }

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    void syncWidgetData().catch(() => {});

    return updatedTask;
  }

/**
   * Complete a Task.
   * Handles XP, pebbles, analytics, side effects, and state emission.
   */
  static async completeTask(
    taskId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<{ previous: Task; updated: Task }

/**
   * Uncomplete a Task.
   */
  static async uncompleteTask(
    taskId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<{ previous: Task; updated: Task }

/**
   * Move a Task from one workspace to another.
   * Modifies only the workspaceId and updatedAt.
   * Performs the correct sequence of save and delete to persist the move safely.
   */
  static async moveTask(
    taskId: string,
    sourceWorkspaceId: string,
    targetWorkspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<Task> {
    if (sourceWorkspaceId === targetWorkspaceId) {
      const tasksMap = await TaskRepository.getTasks(sourceWorkspaceId);
      const existing = tasksMap[taskId];
      if (!existing) {
        throw new Error(`Task ${taskId} not found in workspace ${sourceWorkspaceId}`);
      }
      return existing; // Nothing to do
    }

    const tasksMap = await TaskRepository.getTasks(sourceWorkspaceId);
    const existing = tasksMap[taskId];
    if (!existing) {
      throw new Error(`Task ${taskId} not found in workspace ${sourceWorkspaceId}`);
    }

    const movedTask: Task = {
      ...existing,
      workspaceId: targetWorkspaceId,
      updatedAt: Date.now(),
    };

    const operationId = `move-${generateId()}`;
    await MoveJournalRepository.addOperation({
      operationId,
      entityId: taskId,
      entityType: "task",
      sourceWorkspaceId,
      targetWorkspaceId,
      timestamp: Date.now(),
    });

    // Save in new workspace first to avoid data loss
    await TaskRepository.saveTask(movedTask);
    // Then delete from old workspace
    try {
      await TaskRepository.deleteTask(taskId, sourceWorkspaceId);
    } catch (e) {
      console.warn(`[EntityCommandService] Failed to delete source task ${taskId} during move. Target workspace ${targetWorkspaceId} contains a ghost.`, e);
      throw e;
    }

    await MoveJournalRepository.removeOperation(operationId);

    if (!options?.skipEvents) {
      emitStateChange("tasks_changed", options?.source);
    }

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    void syncWidgetData().catch(() => {});

    return movedTask;
  }

/**
   * Batch 3: recycleTask
   *
   * Safely moves a Task from active storage (TaskRepository) to the RecycleBin,
   * while cancelling any associated native OS reminders.
   *
   * Ordering:
   * 1. Load task from source workspace
   * 2. Verify existence
   * 3. Snapshot task & save to RecycleBinRepository
   * 4. Cancel native reminders
   * 5. Delete from TaskRepository
   * 6. Emit events & analytics
   */
  static async recycleTask(
    taskId: string,
    workspaceId: string,
    originalWorkspaceName: string,
    options?: { skipEvents?: boolean; skipAnalytics?: boolean; source?: string }

static async restoreTask(
    recycleBinItemId: string,
    options?: CreateEntityOptions
  ): Promise<Task> {
    const { getRecycleBinItems, saveRecycleBinItems } = await import("@/services/storage/storage.service");
    const { rescheduleTodoReminders } = await import("@/services/scheduling/reminders.service");
    const { emitStateChange } = await import("@/services/events/state-events");

    // 1. Load recycle-bin item. Resolve by either the RecycleBin item ID
    // ("rb-{entityId}") or the raw task entity ID so callers (e.g. the
    // delete-Undo in useTaskCrud, which passes the task ID) both work.
    const binItems = await getRecycleBinItems();
    const item = binItems.find(
      (i) => i.id === recycleBinItemId || i.entityId === recycleBinItemId,
    );
    if (!item) {
      throw new Error(`[EntityCommandService] RecycleBin item ${recycleBinItemId} not found.`);
    }

    // 3. Verify it's a task
    if (item.entityType !== "task") {
      throw new Error(`[EntityCommandService] Cannot restore non-task entity (${item.entityType}) via restoreTask.`);
    }

    // 4. Parse snapshot
    let parsedTask: Task;
    try {
      parsedTask = JSON.parse(item.snapshot);
    } catch (e) {
      throw new Error(`[EntityCommandService] Failed to parse RecycleBin snapshot for item ${recycleBinItemId}`);
    }

    // 5. Basic validation
    if (!parsedTask || !parsedTask.id || !parsedTask.workspaceId) {
      throw new Error(`[EntityCommandService] Parsed Task is missing required fields (id or workspaceId).`);
    }

    // 6. Notification Safety (Remove stale IDs)
    if (parsedTask.reminder && parsedTask.reminder.notificationIds) {
      parsedTask.reminder = { ...parsedTask.reminder, notificationIds: undefined };
    }

    const { generateId } = await import("@/shared/utils/id");
    const { MoveJournalRepository } = await import("@/repositories/MoveJournalRepository");
    const operationId = `restore-${generateId()}`;
    await MoveJournalRepository.addOperation({
      operationId,
      operationType: "restore",
      entityId: parsedTask.id,
      entityType: "task",
      sourceWorkspaceId: parsedTask.workspaceId,
      targetWorkspaceId: parsedTask.workspaceId,
      timestamp: Date.now(),
    });

    // 7. Persist to active storage (Throws on failure, bin untouched)
    const activeTaskToSave = { ...parsedTask };
    await TaskRepository.saveTask(activeTaskToSave);

    // 8. Safely remove from Recycle Bin ONLY AFTER successful active persistence
    try {
      const remainingBinItems = binItems.filter((i) => i.id !== item.id);
      await saveRecycleBinItems(remainingBinItems, { throwOnError: true });
    } catch (e) {
      console.warn(`[EntityCommandService] Failed to remove task from Recycle Bin after restore. Recycle Bin contains a ghost.`, e);
    }
    
    await MoveJournalRepository.removeOperation(operationId);

    // 9. Reschedule reminders (Tolerance: do not fail restoration on reminder error)
    if (parsedTask.reminder && parsedTask.reminder.enabled && parsedTask.reminder.triggerAt) {
      try {
        const taskWithReminders = await rescheduleTodoReminders(parsedTask);
        await TaskRepository.updateNotificationIds(taskWithReminders.id, taskWithReminders.workspaceId, taskWithReminders.reminder?.notificationIds);
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to reschedule reminders during restore of Task ${parsedTask.id}. Task will be restored without active native notifications.`, e);
      }
    }

    // 10. Emit events
    if (!options?.skipEvents) {
      emitStateChange("tasks_changed", options?.source);
    }

    // 11. Analytics & Widget sync
    // 11. Analytics & Widget sync
    if (!options?.skipAnalytics) {
      const { recordDailyHistorySnapshot } = await import("@/services/analytics/productivity-history.service");
      void recordDailyHistorySnapshot().catch(() => {});
    }
    void syncWidgetData().catch(() => {});

    return activeTaskToSave;
  }

  /**
   * Batch 7E: restoreTasks
   *
   * Bulk restores multiple Tasks from the RecycleBin back into the active TaskRepository.
   *
   * Ordering:
   * 1. Separate valid Task items from input array.
   * 2. Parse/validate each Task and verify workspaceId.
   * 3. Remove stale notificationIds before rescheduling.
   * 4. Sequentially reschedule reminders (tolerating failures).
   * 5. Group by workspaceId.
   * 6. Batch persist per workspace.
   * 7. Return IDs of successfully persisted tasks so the caller can remove them from the Recycle Bin.
   */
  static async restoreTasks(
    itemsToRestore: any[],
    options?: CreateEntityOptions
  ): Promise<{ restoredCount: number; successfulItemIds: string[]; failedItemIds: string[] }> {
    const { rescheduleTodoReminders } = await import("@/services/scheduling/reminders.service");
    const { emitStateChange } = await import("@/services/events/state-events");
    const { WorkspaceRepository } = await import("@/repositories");

    const workspaces = await WorkspaceRepository.getWorkspaces();
    const validWorkspaceIds = new Set(workspaces.map((w) => w.id));

    const tasksByWorkspace = new Map<string, { task: Task; itemId: string }[]>();
    const successfulItemIds: string[] = [];
    const failedItemIds: string[] = [];

    // 0. Resolve raw entity/bin IDs to RecycleBin items. Callers may pass either
    //    full RecycleBinItem objects (Recycle Bin screen) or plain task entity IDs
    //    (bulk-delete Undo in useTasksState.handleBulkDelete).
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    const resolvedItems: any[] = [];
    for (const entry of itemsToRestore) {
      if (typeof entry === "string") {
        const match = binItems.find(
          (i) => i.id === entry || i.entityId === entry,
        );
        if (match && match.entityType === "task") {
          resolvedItems.push(match);
        } else {
          console.warn(
            `[EntityCommandService] No RecycleBin task entry found for "${entry}"; skipping restore.`
          );
          failedItemIds.push(entry);
        }
      } else {
        resolvedItems.push(entry);
      }
    }

    // 1. Parse and group valid tasks
    for (const item of resolvedItems) {
      if (item.entityType !== "task") continue;

      let parsedTask: Task;
      try {
        parsedTask = JSON.parse(item.snapshot);
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to parse snapshot for item ${item.id}`);
        failedItemIds.push(item.id);
        continue;
      }

      if (!parsedTask || !parsedTask.id) {
        failedItemIds.push(item.id);
        continue;
      }

      let workspaceId = parsedTask.workspaceId || "inbox";
      if (!validWorkspaceIds.has(workspaceId)) {
        workspaceId = "inbox";
        parsedTask.workspaceId = "inbox";
      }

      if (parsedTask.reminder && parsedTask.reminder.notificationIds) {
        parsedTask.reminder = { ...parsedTask.reminder, notificationIds: undefined };
      }

      let taskToSave = parsedTask;

      if (!tasksByWorkspace.has(workspaceId)) {
        tasksByWorkspace.set(workspaceId, []);
      }
      tasksByWorkspace.get(workspaceId)!.push({ task: taskToSave, itemId: item.id });
    }

    // 2. Batch save per workspace (DOMAIN PERSISTENCE FIRST)
    let restoredCount = 0;
    const tasksToReschedule: Task[] = [];
    
    const { generateId } = await import("@/shared/utils/id");
    const { MoveJournalRepository } = await import("@/repositories/MoveJournalRepository");
    const operations: MoveJournalEntry[] = [];
    for (const [workspaceId, wrappedTasks] of tasksByWorkspace.entries()) {
      for (const w of wrappedTasks) {
        operations.push({
          operationId: `restore-${generateId()}`,
          operationType: "restore",
          entityId: w.task.id,
          entityType: "task",
          sourceWorkspaceId: workspaceId,
          targetWorkspaceId: workspaceId,
          timestamp: Date.now(),
        });
      }
    }
    await MoveJournalRepository.addOperations(operations);

    for (const [workspaceId, wrappedTasks] of tasksByWorkspace.entries()) {
      try {
        const tasks = wrappedTasks.map((w) => w.task);
        await TaskRepository.saveTasks(tasks, workspaceId);
        restoredCount += tasks.length;
        successfulItemIds.push(...wrappedTasks.map((w) => w.itemId));
        tasksToReschedule.push(...tasks.filter(t => t.reminder?.enabled && t.reminder?.triggerAt));
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to batch save tasks in workspace ${workspaceId}`, e);
        failedItemIds.push(...wrappedTasks.map((w) => w.itemId));
      }
    }

    // 2.5 Reschedule reminders (Isolated)
    for (const task of tasksToReschedule) {
      try {
        const rescheduled = await rescheduleTodoReminders(task);
        await TaskRepository.updateNotificationIds(rescheduled.id, rescheduled.workspaceId, rescheduled.reminder?.notificationIds);
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to reschedule reminders for Task ${task.id}`, e);
      }
    }

    // 3. Remove successfully restored entries from the Recycle Bin (best-effort,
    //    never fail the restore because bin cleanup failed).
    if (successfulItemIds.length > 0) {
      try {
        const remainingBinItems = binItems.filter(
          (i) => !successfulItemIds.includes(i.id),
        );
        await RecycleBinRepository.saveRecycleBinItems(remainingBinItems, { throwOnError: true });
      } catch (e) {
        console.warn(
          `[EntityCommandService] Tasks restored, but failed to remove their Recycle Bin entries. Duplicate state may exist.`,
          e,
        );
      }
    }

    await MoveJournalRepository.removeOperations(operations.map(op => op.operationId));

    // 4. Side effects
    if (restoredCount > 0 && !options?.skipEvents) {
      emitStateChange("tasks_changed", options?.source);
    }
    if (restoredCount > 0 && !options?.skipAnalytics) {
      const { recordDailyHistorySnapshot } = await import("@/services/analytics/productivity-history.service");
      void recordDailyHistorySnapshot().catch(() => {});
    }
    if (restoredCount > 0) {
      void syncWidgetData().catch(() => {});
    }

    return { restoredCount, successfulItemIds, failedItemIds };
  }

  static async restoreChecklist(recycleBinItemId: string, options?: CreateEntityOptions): Promise<Checklist> {
    return restoreEntityFromBin<Checklist>(
      recycleBinItemId,
      "checklist",
      "checklists_changed",
      options,
      (checklist) => ChecklistRepository.saveChecklist(checklist),
      (checklist) => ChecklistRepository.deleteChecklist(checklist.id, checklist.workspaceId || INBOX_WORKSPACE_ID),
    );
  }

  static async restoreResource(recycleBinItemId: string, options?: CreateEntityOptions): Promise<Resource> {
    return restoreEntityFromBin<Resource>(
      recycleBinItemId,
      "resource",
      "resources_changed",
      options,
      (resource) => ResourceRepository.saveResource(resource),
      (resource) => ResourceRepository.deleteResource(resource.id, resource.workspaceId || INBOX_WORKSPACE_ID),
    );
  }

  /**
   * Restore a Workspace from the Recycle Bin.
   *
   * Workspaces are snapshotted as a package `{ list: Workspace, todos: Task[],
   * habits: Habit[] }` (see WorkspaceModal's delete flow) — NOT as a bare
   * Workspace. Restoring the raw package through saveWorkspace would persist a
   * corrupt entity (`id: undefined`, `name: "Untitled Workspace"`), so this
   * restore unwraps `snapshot.list` and persists the real workspace through the
   * canonical WorkspaceRepository.
   *
   * The contained tasks/habits are re-persisted best-effort into their
   * partitioned storage keys (they normally already live there — the workspace
   * delete flow does not purge them — so this is idempotent and purely
   * defensive). The bin entry is removed only after the workspace persist
   * succeeds; saveWorkspace swallows errors, so the persisted workspace is
   * read back to verify the restore actually happened.
   */
  static async restoreWorkspace(
    recycleBinItemId: string,
    options?: CreateEntityOptions,
  ): Promise<Workspace> {
    const { getRecycleBinItems, saveRecycleBinItems } = await import("@/services/storage/storage.service");
    const { emitStateChange } = await import("@/services/events/state-events");

    // 1. Resolve the bin item by its RecycleBin item id ("rb-<workspaceId>") or
    // the raw workspace id so callers that pass either work.
    const binItems = await getRecycleBinItems();
    const item = binItems.find(
      (i) => i.id === recycleBinItemId || i.entityId === recycleBinItemId,
    );
    if (!item || item.entityType !== "workspace") {
      throw new Error(`RecycleBin item not found or not workspace`);
    }

    // 2. Parse the snapshot package and unwrap the actual Workspace. Tolerate a
    // bare Workspace snapshot (backward compatibility).
    let parsed: any;
    try {
      parsed = JSON.parse(item.snapshot);
    } catch (e) {
      throw new Error(`[EntityCommandService] Failed to parse workspace snapshot for ${recycleBinItemId}`);
    }
    const workspace: Workspace = parsed?.list ?? parsed;
    if (!workspace || !workspace.id) {
      throw new Error(`[EntityCommandService] Invalid workspace snapshot for ${recycleBinItemId}`);
    }

    const { withLock } = await import("@/shared/utils/mutex");
    return withLock(`ws_lifecycle_${workspace.id}`, async () => {
      // 3. Persist the workspace through the canonical repository.
      await WorkspaceRepository.saveWorkspace(workspace);

    // 4. saveWorkspace swallows storage errors, so verify the workspace actually
    // persisted. If it did not, abort WITHOUT removing the bin item.
    const persistedWorkspaces = await WorkspaceRepository.getWorkspaces();
    if (!persistedWorkspaces.some((w) => w.id === workspace.id)) {
      throw new Error(`[EntityCommandService] Workspace ${workspace.id} failed to persist during restore`);
    }

    // 5. Best-effort restore of the contained tasks/habits into their canonical
    // partitioned keys (idempotent — they normally already exist in storage).
    let childRestoreSuccess = true;

    if (Array.isArray(parsed?.todos) && parsed.todos.length > 0) {
      try {
        await TaskRepository.saveTasks(parsed.todos, workspace.id);
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to restore tasks for workspace ${workspace.id}`, e);
        childRestoreSuccess = false;
      }
    }
    if (Array.isArray(parsed?.habits) && parsed.habits.length > 0) {
      try {
        for (const habit of parsed.habits) {
          await HabitRepository.saveHabit({ ...habit, workspaceId: workspace.id });
        }
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to restore habits for workspace ${workspace.id}`, e);
        childRestoreSuccess = false;
      }
    }
    if (Array.isArray(parsed?.checklists) && parsed.checklists.length > 0) {
      try {
        const { ChecklistRepository } = await import("@/repositories/ChecklistRepository");
        for (const checklist of parsed.checklists) {
          await ChecklistRepository.saveChecklist({ ...checklist, workspaceId: workspace.id });
        }
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to restore checklists for workspace ${workspace.id}`, e);
        childRestoreSuccess = false;
      }
    }
    if (Array.isArray(parsed?.resources) && parsed.resources.length > 0) {
      try {
        const { ResourceRepository } = await import("@/repositories/ResourceRepository");
        for (const resource of parsed.resources) {
          await ResourceRepository.saveResource({ ...resource, workspaceId: workspace.id });
        }
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to restore resources for workspace ${workspace.id}`, e);
        childRestoreSuccess = false;
      }
    }

    if (!childRestoreSuccess) {
      throw new Error(`[EntityCommandService] Workspace ${workspace.id} restored partially. Recovery snapshot retained.`);
    }

    // 6. Remove the bin entry only after active persistence succeeded.
    try {
      const remainingBinItems = binItems.filter((i) => i.id !== item.id);
      await saveRecycleBinItems(remainingBinItems, { throwOnError: true });
    } catch (e) {
      console.warn(`[EntityCommandService] Failed to remove workspace from Recycle Bin after restore. Recycle Bin contains a ghost.`, e);
    }

    // 7. Emit the workspace state event.
    if (!options?.skipEvents) {
      emitStateChange("workspace_mode_changed", options?.source);
    }

    return workspace;
    });
  }

  // ============================================================================
  // Additional Update & Move Methods (Phase 9 Bypasses)
  // ============================================================================

  static async updateChecklist(
    checklistId: string,
    workspaceId: string,
    updates: Partial<Omit<Checklist, "id" | "workspaceId">>,
    options?: CreateEntityOptions,
  ): Promise<Checklist> {
    const map = await ChecklistRepository.getChecklists(workspaceId);
    const existing = map[checklistId];
    if (!existing) throw new Error(`Checklist ${checklistId} not found`);
    const updated = { ...existing, ...updates, updatedAt: Date.now() };
    await ChecklistRepository.saveChecklist(updated);
    if (!options?.skipEvents) emitStateChange("checklists_changed", options?.source);
    if (!options?.skipAnalytics) void recordDailyHistorySnapshot().catch(() => {});
    return updated;
  }

  static async updateResource(
    resourceId: string,
    workspaceId: string,
    updates: Partial<Omit<Resource, "id" | "workspaceId">>,
    options?: CreateEntityOptions,
  ): Promise<Resource> {
    const map = await ResourceRepository.getResources(workspaceId);
    const existing = map[resourceId];
    if (!existing) throw new Error(`Resource ${resourceId} not found`);
    const updated = { ...existing, ...updates, updatedAt: Date.now() };
    await ResourceRepository.saveResource(updated);
    if (!options?.skipEvents) emitStateChange("resources_changed", options?.source);
    if (!options?.skipAnalytics) void recordDailyHistorySnapshot().catch(() => {});
    return updated;
  }

  static async toggleArchiveResource(
    resourceId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<{ resource: Resource, isArchived: boolean }> {
    const map = await ResourceRepository.getResources(workspaceId);
    const existing = map[resourceId];
    if (!existing) throw new Error(`Resource ${resourceId} not found`);
    
    const isArchived = !!existing.archivedAt;
    const updated = await this.updateResource(
      resourceId,
      workspaceId,
      { archivedAt: isArchived ? undefined : Date.now() },
      options
    );

    return { resource: updated, isArchived: !isArchived };
  }

  static async moveHabit(
    habitId: string,
    sourceWorkspaceId: string,
    targetWorkspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<Habit> {
    if (sourceWorkspaceId === targetWorkspaceId) {
      const map = await HabitRepository.getHabits(sourceWorkspaceId);
      if (!map[habitId]) throw new Error(`Habit ${habitId} not found`);
      return map[habitId];
    }
    const map = await HabitRepository.getHabits(sourceWorkspaceId);
    const existing = map[habitId];
    if (!existing) throw new Error(`Habit ${habitId} not found`);
    const moved: Habit = { ...existing, workspaceId: targetWorkspaceId, updatedAt: Date.now() };

    const operationId = `move-${generateId()}`;
    await MoveJournalRepository.addOperation({
      operationId,
      entityId: habitId,
      entityType: "habit",
      sourceWorkspaceId,
      targetWorkspaceId,
      timestamp: Date.now(),
    });

    await HabitRepository.saveHabit(moved);
    try {
      await HabitRepository.deleteHabit(habitId, sourceWorkspaceId);
    } catch (e) {
      console.warn(`[EntityCommandService] Failed to delete source habit ${habitId} during move. Target workspace ${targetWorkspaceId} contains a ghost.`, e);
      throw e;
    }

    await MoveJournalRepository.removeOperation(operationId);
    if (!options?.skipEvents) emitStateChange("habits_changed", options?.source);
    if (!options?.skipAnalytics) void recordDailyHistorySnapshot().catch(() => {});
    void syncWidgetData().catch(() => {});
    return moved;
  }

  static async moveChecklist(
    checklistId: string,
    sourceWorkspaceId: string,
    targetWorkspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<Checklist> {
    if (sourceWorkspaceId === targetWorkspaceId) {
      const map = await ChecklistRepository.getChecklists(sourceWorkspaceId);
      if (!map[checklistId]) throw new Error(`Checklist ${checklistId} not found`);
      return map[checklistId];
    }
    const map = await ChecklistRepository.getChecklists(sourceWorkspaceId);
    const existing = map[checklistId];
    if (!existing) throw new Error(`Checklist ${checklistId} not found`);
    const moved: Checklist = { ...existing, workspaceId: targetWorkspaceId, updatedAt: Date.now() };

    const operationId = `move-${generateId()}`;
    await MoveJournalRepository.addOperation({
      operationId,
      entityId: checklistId,
      entityType: "checklist",
      sourceWorkspaceId,
      targetWorkspaceId,
      timestamp: Date.now(),
    });

    await ChecklistRepository.saveChecklist(moved);
    try {
      await ChecklistRepository.deleteChecklist(checklistId, sourceWorkspaceId);
    } catch (e) {
      console.warn(`[EntityCommandService] Failed to delete source checklist ${checklistId} during move. Target workspace ${targetWorkspaceId} contains a ghost.`, e);
      throw e;
    }

    await MoveJournalRepository.removeOperation(operationId);
    if (!options?.skipEvents) emitStateChange("checklists_changed", options?.source);
    if (!options?.skipAnalytics) void recordDailyHistorySnapshot().catch(() => {});
    return moved;
  }

  static async moveResource(
    resourceId: string,
    sourceWorkspaceId: string,
    targetWorkspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<Resource> {
    if (sourceWorkspaceId === targetWorkspaceId) {
      const map = await ResourceRepository.getResources(sourceWorkspaceId);
      if (!map[resourceId]) throw new Error(`Resource ${resourceId} not found`);
      return map[resourceId];
    }
    const map = await ResourceRepository.getResources(sourceWorkspaceId);
    const existing = map[resourceId];
    if (!existing) throw new Error(`Resource ${resourceId} not found`);
    const moved: Resource = { ...existing, workspaceId: targetWorkspaceId, updatedAt: Date.now() };

    const operationId = `move-${generateId()}`;
    await MoveJournalRepository.addOperation({
      operationId,
      entityId: resourceId,
      entityType: "resource",
      sourceWorkspaceId,
      targetWorkspaceId,
      timestamp: Date.now(),
    });

    await ResourceRepository.saveResource(moved);
    try {
      await ResourceRepository.deleteResource(resourceId, sourceWorkspaceId);
    } catch (e) {
      console.warn(`[EntityCommandService] Failed to delete source resource ${resourceId} during move. Target workspace ${targetWorkspaceId} contains a ghost.`, e);
      throw e;
    }

    await MoveJournalRepository.removeOperation(operationId);
    if (!options?.skipEvents) emitStateChange("resources_changed", options?.source);
    if (!options?.skipAnalytics) void recordDailyHistorySnapshot().catch(() => {});
    return moved;
  }

  static async reorderTasks(
    orderedTasks: Task[],
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<void> {
    await TaskRepository.saveTasks(orderedTasks, workspaceId);
    if (!options?.skipEvents) emitStateChange("tasks_changed", options?.source);
    if (!options?.skipAnalytics) void recordDailyHistorySnapshot().catch(() => {});
    void syncWidgetData().catch(() => {});
  }


  static async recordFocusSession(
    durationSeconds: number,
    taskId?: string,
    itemType?: "task" | "habit" | "checklist",
    options?: { sessionId?: string; startedAt?: number; endedAt?: number }
  ): Promise<void> {
    const sessionId = options?.sessionId || `focus_${Date.now()}`;
    const endedAt = options?.endedAt || Date.now();
    const startedAt =
      options?.startedAt || endedAt - Math.floor(durationSeconds * 1000);
    const session = {
      id: sessionId,
      taskId,
      startedAt,
      endedAt,
      duration: Math.floor(durationSeconds),
      completedAt: endedAt,
    };

    await GraphRepository.saveFocusSession(session);
    await earnPebble("focus", `focus:${sessionId}`);

    if (taskId && itemType) {
      await GraphRepository.saveRelationship({
        id: `rel_${Date.now()}`,
        source: { id: sessionId, type: "focus" },
        target: { id: taskId, type: itemType as any },
        relationType: "focuses_on",
        createdAt: Date.now(),
      });
    }

    // emitStateChange("graph_changed", "EntityCommandService");
  }

  static async logSystemEvent(eventName: string, details?: any): Promise<void> {
    await GraphRepository.logSystemEvent({
      id: `evt_${Date.now()}`,
      eventType: eventName,
      timestamp: Date.now(),
      details: details || {},
    });
  }

  static async reorderWorkspaces(
    orderedWorkspaces: Workspace[],
    options?: CreateEntityOptions,
  ): Promise<void> {
    await WorkspaceRepository.saveWorkspaces(orderedWorkspaces);
    if (!options?.skipEvents) emitStateChange("workspace_changed", options?.source);
    if (!options?.skipAnalytics) void recordDailyHistorySnapshot().catch(() => {});
  }
}

/**
   * Bulk-complete Tasks with the same side effects as completeTask.
   */
  static async completeTasks(
    items: { taskId: string; workspaceId: string }

/**
   * Bulk-archive Tasks with the same side effects as updateTask({ archivedAt }) —
   * reminder cancellation + notification-ID clearing, events and analytics.
   */
  static async archiveTasks(
    items: { taskId: string; workspaceId: string }

/**
   * Batch 5: bulk Task recycling
   *
   * Safely moves multiple Tasks from active storage (TaskRepository) to the RecycleBin,
   * while cancelling any associated native OS reminders.
   */
  static async recycleTasks(
    items: { taskId: string; workspaceId: string }

/**
   * Clears all completed tasks in a given workspace, moving them to the recycle bin safely.
   */
  static async clearCompletedTasks(
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<void> {
    const tasks = await TaskRepository.getTasks(workspaceId);
    const completedTasks = Object.values(tasks).filter(
      (t) => t.status === "completed" || !!t.completedAt,
    );
    if (completedTasks.length === 0) return;

    await this.recycleTasks(
      completedTasks.map((t) => ({ taskId: t.id, workspaceId })),
      { source: options?.source || "clear_completed" },
    );
  }

/**
   * Batch 4: permanentlyDeleteTask
   *
   * Permanently destroys an ACTIVE TaskRepository task.
   * This is NOT for recycle bin items.
   *
   * Ordering:
   * 1. Load task from source workspace
   * 2. Verify existence
   * 3. Cancel native reminders
   * 4. Delete from TaskRepository
   * 5. Emit events & analytics
   */
  static async permanentlyDeleteTask(
    taskId: string,
    workspaceId: string,
    options?: { skipEvents?: boolean; skipAnalytics?: boolean; source?: string }

