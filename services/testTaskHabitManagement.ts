import { isRecurringOccurrenceForDate, getRecurrenceLabel } from "./recurrence";
import { type Todo, type Habit } from "../modules/types";

// Mock workspaces list
const mockWorkspaces = [
  { id: "default", name: "My Pebbles" },
  { id: "ws-work", name: "Work Stuff" },
  { id: "ws-health", name: "Health Center" }
];

// Mock Todo items
const mockTodos: Todo[] = [
  {
    id: "1",
    title: "Read Chapter 1",
    completed: false,
    category: "learning",
    folderId: "default",
    scheduledDate: "2026-06-01",
    recurrence: { type: "daily" }
  },
  {
    id: "2",
    title: "Study React",
    completed: false,
    category: "work",
    folderId: "ws-work",
    scheduledDate: "2026-06-01",
    recurrence: { type: "weekdays" },
    recurrenceExceptions: ["2026-06-03"] // Wednesday exception
  },
  {
    id: "3",
    title: "Gym session",
    completed: false,
    category: "health",
    folderId: "ws-health",
    scheduledDate: "2026-06-01",
    recurrence: { type: "weekly", days: [1, 4] } // Monday, Thursday
  },
  {
    id: "4",
    title: "Pay rent",
    completed: false,
    category: "personal",
    folderId: "default",
    scheduledDate: "2026-06-01",
    recurrence: { type: "monthly", dayOfMonth: 5 }
  },
  {
    id: "5",
    title: "Water plants",
    completed: false,
    category: "personal",
    folderId: "default",
    scheduledDate: "2026-06-01",
    recurrence: { type: "interval", interval: 3, unit: "days" }
  }
];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
  console.log(`✓ Passed: ${message}`);
}

async function runTests() {
  console.log("=== Pebble Task & Habit Management Polish Tests ===\n");

  // --- 1. Test Recurrence Matching ---
  console.log("--- Testing Recurrence Matching ---");

  // Daily matching
  assert(
    isRecurringOccurrenceForDate(mockTodos[0], "2026-06-03"),
    "Daily task matches on Wednesday"
  );
  assert(
    isRecurringOccurrenceForDate(mockTodos[0], "2026-06-06"),
    "Daily task matches on Saturday"
  );

  // Weekday matching
  assert(
    isRecurringOccurrenceForDate(mockTodos[1], "2026-06-01"), // Monday
    "Weekday task matches on Monday"
  );
  assert(
    !isRecurringOccurrenceForDate(mockTodos[1], "2026-06-06"), // Saturday
    "Weekday task does NOT match on Saturday"
  );

  // Weekday exceptions
  assert(
    !isRecurringOccurrenceForDate(mockTodos[1], "2026-06-03"), // Wednesday with exception
    "Weekday task does NOT match on Wednesday exception date"
  );

  // Weekly matching
  assert(
    isRecurringOccurrenceForDate(mockTodos[2], "2026-06-04"), // Thursday
    "Weekly task (Mon/Thu) matches on Thursday"
  );
  assert(
    !isRecurringOccurrenceForDate(mockTodos[2], "2026-06-03"), // Wednesday
    "Weekly task (Mon/Thu) does NOT match on Wednesday"
  );

  // Monthly matching
  assert(
    isRecurringOccurrenceForDate(mockTodos[3], "2026-06-05"),
    "Monthly task matches on the 5th of June"
  );
  assert(
    !isRecurringOccurrenceForDate(mockTodos[3], "2026-06-06"),
    "Monthly task does NOT match on the 6th of June"
  );

  // Interval matching
  assert(
    isRecurringOccurrenceForDate(mockTodos[4], "2026-06-04"), // +3 days
    "Interval task (every 3 days) matches 3 days later"
  );
  assert(
    !isRecurringOccurrenceForDate(mockTodos[4], "2026-06-03"),
    "Interval task (every 3 days) does NOT match 2 days later"
  );

  // --- 2. Test Upgraded Search Matching ---
  console.log("\n--- Testing Search Upgrades ---");

  const searchIndex = (query: string, items: Todo[]) => {
    return items.filter((todo) => {
      const matchesTitle = todo.title
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesDesc =
        todo.description?.toLowerCase().includes(query.toLowerCase()) ||
        false;
      const matchesCategory =
        todo.category?.toLowerCase().includes(query.toLowerCase()) ||
        false;
      const wsName = mockWorkspaces.find((l) => l.id === todo.folderId)?.name || "";
      const matchesWorkspace = wsName.toLowerCase().includes(query.toLowerCase());
      const recLabel = getRecurrenceLabel(todo.recurrence) || "";
      const matchesRecurrence = recLabel.toLowerCase().includes(query.toLowerCase());
      return matchesTitle || matchesDesc || matchesCategory || matchesWorkspace || matchesRecurrence;
    });
  };

  // Search by category key/label (e.g. "health")
  const healthResults = searchIndex("health", mockTodos);
  assert(
    healthResults.length === 1 && healthResults[0].id === "3",
    "Search for 'health' matches category 'health'"
  );

  // Search by workspace/folder name (e.g. "work")
  const workResults = searchIndex("work", mockTodos);
  assert(
    workResults.some(t => t.id === "2"),
    "Search for 'work' matches item in workspace 'Work Stuff'"
  );

  // Search by recurrence label (e.g. "daily" or "weekly")
  const dailyResults = searchIndex("daily", mockTodos);
  assert(
    dailyResults.length === 1 && dailyResults[0].id === "1",
    "Search for 'daily' matches recurrence 'Daily'"
  );

  const weeklyResults = searchIndex("weekly", mockTodos);
  assert(
    weeklyResults.some(t => t.id === "3"),
    "Search for 'weekly' matches recurrence 'Weekly'"
  );

  console.log("\n🎉 ALL TASK & HABIT MANAGEMENT POLISH TESTS PASSED SUCCESSFULLY!");
}

runTests().catch(console.error);
