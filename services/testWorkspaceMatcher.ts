import { getWorkspaceSuggestions } from "./workspaceSuggestions";
import { detectTaskTopic } from "./workspaceTopics";

// Mock Workspaces
const mockWorkspaces = [
  { id: "ws-1", name: "Learning" },
  { id: "ws-2", name: "Fitness" },
];

// Mock Todos
const mockTodos = {
  "ws-1": [{ title: "study react hooks" }],
  "ws-2": [{ title: "gym session" }],
};

async function runTests() {
  console.log("=== Pebble Workspace Intelligence Tests ===\n");

  const testCases = [
    // 1. Existing Workspace Matches (React/JavaScript/Node)
    {
      title: "Write Node API backend",
      category: "work",
      expectedTopic: "LEARNING",
      expectedFriendly: "Learning"
    },
    // 2. DevOps topic (doesn't exist in mockWorkspaces, should offer creation)
    {
      title: "Set up Docker container for Kubernetes CI/CD",
      category: "work",
      expectedTopic: "DEVOPS",
      expectedFriendly: "DevOps"
    },
    // 3. Placement prep (doesn't exist, should offer creation)
    {
      title: "Prepare DSA leetcode question for placement interview",
      category: "learning",
      expectedTopic: "PLACEMENT",
      expectedFriendly: "Placement Prep"
    },
    // 4. Fitness match (exists in mockWorkspaces)
    {
      title: "Running workout protein drink",
      category: "health",
      expectedTopic: "FITNESS",
      expectedFriendly: "Fitness"
    }
  ];

  for (const tc of testCases) {
    console.log(`Input Task: "${tc.title}"`);
    
    // Test direct topic detection
    const topic = detectTaskTopic(tc.title);
    console.log(`  -> Detected Topic: ${topic ? topic.topic : "None"} (${topic ? topic.friendlyName : ""})`);

    // Test workspace suggestions scoring
    const suggestions = await getWorkspaceSuggestions(
      tc.title,
      tc.category,
      mockWorkspaces,
      mockTodos
    );

    const top = suggestions[0];
    if (top && top.score >= 15) {
      const matchWs = mockWorkspaces.find(w => w.id === top.workspaceId);
      console.log(`  -> Suggested Workspace: "${matchWs?.name}" (Score: ${top.score}, Confidence: ${top.confidence})`);
      if (top.score >= 70) {
        console.log("     [Action] Auto-select workspace.");
      } else {
        console.log("     [Action] Show suggestion chip.");
      }
    } else {
      console.log("  -> No suitable workspace found (Score < 15)");
      if (topic) {
        const exists = mockWorkspaces.some(w => w.name.toLowerCase() === topic.friendlyName.toLowerCase());
        if (!exists) {
          console.log(`     [Action] Suggest one-tap creation of: "${topic.friendlyName}" workspace.`);
        }
      }
    }
    console.log("");
  }
}

runTests().catch(console.error);
