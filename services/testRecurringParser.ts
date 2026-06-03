import { parseProductivityText } from "./nlpParser";
import { getWorkspaceSuggestions } from "./workspaceSuggestions";

// Mock Workspaces
const mockWorkspaces = [
  { id: "ws-learning", name: "Learning" },
  { id: "ws-fitness", name: "Fitness" },
  { id: "ws-devops", name: "DevOps" },
  { id: "ws-placement", name: "Placement Prep" },
];

const mockTodos = {
  "ws-learning": [],
  "ws-fitness": [],
  "ws-devops": [],
  "ws-placement": [],
};

async function runTests() {
  console.log("=== Pebble Natural Language Recurring Scheduling Tests ===\n");

  const testCases = [
    {
      input: "Gym every weekday at 7am",
      expectedType: "habit",
      expectedTitle: "Gym",
      expectedRecurrence: {
        type: "weekdays",
        days: [1, 2, 3, 4, 5]
      },
      expectedTime: "07:00",
    },
    {
      input: "Read 10 pages daily",
      expectedType: "habit",
      expectedTitle: "Read 10 pages",
      expectedRecurrence: {
        type: "daily"
      },
      expectedTime: undefined,
    },
    {
      input: "Call parents every Sunday",
      expectedType: "habit",
      expectedTitle: "Call parents",
      expectedRecurrence: {
        type: "weekly",
        days: [0]
      },
      expectedTime: undefined,
    },
    {
      input: "Pay rent every month on the 1st",
      expectedType: "task",
      expectedTitle: "Pay rent",
      expectedRecurrence: {
        type: "monthly",
        dayOfMonth: 1
      },
      expectedTime: undefined,
    },
    {
      input: "Drink water every 2 hours",
      expectedType: "habit",
      expectedTitle: "Drink water",
      expectedRecurrence: {
        type: "interval",
        interval: 2,
        unit: "hours"
      },
      expectedTime: undefined,
    },
    {
      input: "Backup laptop every 7 days",
      expectedType: "task",
      expectedTitle: "Backup laptop",
      expectedRecurrence: {
        type: "interval",
        interval: 7,
        unit: "days"
      },
      expectedTime: undefined,
    },
    {
      input: "Study Kubernetes every weekday at 8pm",
      expectedType: "task",
      expectedTitle: "Study Kubernetes",
      expectedRecurrence: {
        type: "weekdays",
        days: [1, 2, 3, 4, 5]
      },
      expectedTime: "20:00",
    },
    {
      input: "Go hiking every weekend",
      expectedType: "habit",
      expectedTitle: "Go hiking",
      expectedRecurrence: {
        type: "weekly",
        days: [0, 6]
      },
    },
    {
      input: "Clean room every saturday and sunday",
      expectedType: "habit",
      expectedTitle: "Clean room",
      expectedRecurrence: {
        type: "weekly",
        days: [0, 6]
      },
    },
    {
      input: "Workout every monday and thursday",
      expectedType: "habit",
      expectedTitle: "Workout",
      expectedRecurrence: {
        type: "weekly",
        days: [1, 4]
      },
    }
  ];

  let failures = 0;

  for (const tc of testCases) {
    console.log(`Input: "${tc.input}"`);
    const parsed = parseProductivityText(tc.input);

    // Verify Title
    const titleMatch = parsed.title === tc.expectedTitle;
    console.log(`  -> Title: "${parsed.title}" ${titleMatch ? "✅" : `❌ (Expected: "${tc.expectedTitle}")`}`);
    if (!titleMatch) failures++;

    // Verify Type
    const typeMatch = parsed.type === tc.expectedType;
    console.log(`  -> Type:  "${parsed.type}" ${typeMatch ? "✅" : `❌ (Expected: "${tc.expectedType}")`}`);
    if (!typeMatch) failures++;

    // Verify Time
    if (tc.expectedTime !== undefined) {
      const timeMatch = parsed.time === tc.expectedTime;
      console.log(`  -> Time:  "${parsed.time}" ${timeMatch ? "✅" : `❌ (Expected: "${tc.expectedTime}")`}`);
      if (!timeMatch) failures++;
    }

    // Verify Recurrence
    if (parsed.recurrence) {
      const rec = parsed.recurrence;
      const exp = tc.expectedRecurrence;
      const typeOk = rec.type === exp.type;
      const intervalOk = exp.interval === undefined || rec.interval === exp.interval;
      const unitOk = exp.unit === undefined || rec.unit === exp.unit;
      const dayOfMonthOk = exp.dayOfMonth === undefined || rec.dayOfMonth === exp.dayOfMonth;
      const daysOk = exp.days === undefined || (
        Array.isArray(rec.days) && Array.isArray(exp.days) &&
        rec.days.length === exp.days.length &&
        rec.days.every((v, i) => v === exp.days[i])
      );

      const allRecOk = typeOk && intervalOk && unitOk && dayOfMonthOk && daysOk;
      console.log(`  -> Recurrence: ${JSON.stringify(rec)} ${allRecOk ? "✅" : "❌"}`);
      if (!allRecOk) {
        failures++;
        console.log(`     Expected: ${JSON.stringify(exp)}`);
      }
    } else {
      console.log(`  -> Recurrence: None ❌ (Expected: ${JSON.stringify(tc.expectedRecurrence)})`);
      failures++;
    }

    // Workspace matching integration test
    const suggestions = await getWorkspaceSuggestions(
      parsed.title,
      parsed.category || "work",
      mockWorkspaces,
      mockTodos
    );
    const top = suggestions[0];
    if (top && top.score >= 15) {
      const match = mockWorkspaces.find(w => w.id === top.workspaceId);
      console.log(`  -> Workspace suggestion: "${match?.name}" (Score: ${top.score}, Confidence: ${top.confidence})`);
    } else {
      console.log("  -> Workspace suggestion: None");
    }

    console.log("");
  }

  if (failures === 0) {
    console.log("🎉 ALL RECURRENCE PARSING TESTS PASSED SUCCESSFULY!");
  } else {
    console.log(`❌ FAILED WITH ${failures} ASSERTION ERRORS.`);
    process.exit(1);
  }
}

runTests().catch(console.error);
