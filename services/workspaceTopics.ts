export const TOPICS = {
  DEVOPS: [
    "docker", "kubernetes", "k8s", "terraform", "aws", "azure", "gcp", "linux", "ansible", "jenkins", "helm", "argocd", "containers", "cloud", "devops", "ci/cd", "cicd"
  ],
  PLACEMENT: [
    "dsa", "leetcode", "aptitude", "interview", "resume", "placement", "oa", "coding", "round", "placement prep"
  ],
  LEARNING: [
    "react", "nextjs", "node", "express", "mongodb", "frontend", "backend", "fullstack", "javascript", "typescript", "web", "development", "study", "course", "tutorial", "revision", "practice", "learning"
  ],
  FITNESS: [
    "gym", "workout", "cardio", "exercise", "running", "protein", "fitness"
  ]
};

export const TOPIC_FRIENDLY_NAMES: Record<string, string> = {
  DEVOPS: "DevOps",
  PLACEMENT: "Placement Prep",
  LEARNING: "Learning",
  FITNESS: "Fitness"
};

/**
 * Detect topic associations of a workspace based on its name and existing tasks.
 */
export function detectWorkspaceTopics(workspaceName: string, tasks: { title: string }[]): string[] {
  const detected: string[] = [];
  const nameLower = workspaceName.toLowerCase();

  Object.entries(TOPICS).forEach(([topic, keywords]) => {
    // 1. Analyze workspace name
    const matchesName = keywords.some(k => nameLower.includes(k));
    if (matchesName) {
      detected.push(topic);
      return;
    }

    // 2. Scan existing tasks in the workspace
    const matchesTasks = tasks.some(task => {
      const titleLower = task.title.toLowerCase();
      return keywords.some(k => titleLower.includes(k));
    });
    if (matchesTasks) {
      detected.push(topic);
    }
  });

  return detected;
}

/**
 * Calculate topic-based matching boost score (+40 if overlapping topic matched).
 */
export function getTopicMatchScore(taskTitle: string, workspaceName: string, wsTasks: { title: string }[]): number {
  const taskLower = taskTitle.toLowerCase();
  const wsTopics = detectWorkspaceTopics(workspaceName, wsTasks);

  let hasTopicMatch = false;

  Object.entries(TOPICS).forEach(([topic, keywords]) => {
    // Check if the task title contains any keyword from this topic dictionary
    const taskHasKeyword = keywords.some(k => taskLower.includes(k));
    // Check if the workspace is associated with this same topic
    if (taskHasKeyword && wsTopics.includes(topic)) {
      hasTopicMatch = true;
    }
  });

  return hasTopicMatch ? 40 : 0;
}

/**
 * Detect task topic from title keywords directly.
 */
export function detectTaskTopic(taskTitle: string): { topic: string; friendlyName: string } | null {
  const taskLower = taskTitle.toLowerCase();

  for (const [topic, keywords] of Object.entries(TOPICS)) {
    const hasMatch = keywords.some(k => taskLower.includes(k));
    if (hasMatch) {
      return {
        topic,
        friendlyName: TOPIC_FRIENDLY_NAMES[topic] || topic
      };
    }
  }

  return null;
}
