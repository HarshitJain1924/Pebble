// Topic detection for workspace suggestions — matches task keywords to topic domains

export interface TopicMatch {
  topic: string;
  friendlyName: string;
  score: number;
}

// Topic keyword map: maps topic key → display name and keyword set
const TOPIC_DEFINITIONS: { topic: string; friendlyName: string; keywords: string[] }[] = [
  { topic: "devops",      friendlyName: "DevOps",      keywords: ["kubernetes", "docker", "aws", "gcp", "azure", "terraform", "ci", "cd", "jenkins", "pipeline", "deployment", "container", "helm"] },
  { topic: "development", friendlyName: "Development", keywords: ["react", "nextjs", "typescript", "javascript", "python", "api", "backend", "frontend", "code", "debug", "refactor", "component", "hook"] },
  { topic: "fitness",     friendlyName: "Fitness",     keywords: ["gym", "workout", "exercise", "run", "jog", "lift", "yoga", "stretch", "cardio", "protein", "diet", "weight"] },
  { topic: "study",       friendlyName: "Study",       keywords: ["exam", "dsa", "leetcode", "study", "course", "lecture", "revision", "assignment", "homework", "learn", "quiz", "chapter"] },
  { topic: "finance",     friendlyName: "Finance",     keywords: ["rent", "bill", "pay", "tax", "invoice", "budget", "expense", "savings", "investment", "bank", "loan", "salary"] },
  { topic: "health",      friendlyName: "Health",      keywords: ["doctor", "appointment", "medicine", "health", "checkup", "therapy", "prescription", "hospital", "clinic"] },
  { topic: "shopping",    friendlyName: "Shopping",    keywords: ["buy", "purchase", "order", "shop", "amazon", "grocery", "food", "supplies", "market"] },
  { topic: "reading",     friendlyName: "Reading",     keywords: ["read", "book", "chapter", "novel", "page", "article", "blog", "newsletter"] },
  { topic: "social",      friendlyName: "Social",      keywords: ["call", "meet", "friend", "family", "mom", "dad", "birthday", "party", "dinner", "catch up"] },
];

/**
 * Detect the primary topic of a task title.
 * Returns the best match or null if confidence is too low.
 */
export function detectTaskTopic(title: string): { topic: string; friendlyName: string } | null {
  const lower = title.toLowerCase();
  let best: { topic: string; friendlyName: string; score: number } | null = null;

  for (const def of TOPIC_DEFINITIONS) {
    let score = 0;
    for (const kw of def.keywords) {
      if (lower.includes(kw)) {
        score += kw.length; // longer keyword = higher confidence
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { topic: def.topic, friendlyName: def.friendlyName, score };
    }
  }

  return best && best.score >= 3 ? { topic: best.topic, friendlyName: best.friendlyName } : null;
}

/**
 * Return a numeric boost score (0–40) for how well a task title matches a workspace name
 * based on topic domain overlap.
 */
export function getTopicMatchScore(
  taskTitle: string,
  workspaceName: string,
  _workspaceTasks: { title: string }[]
): number {
  const topic = detectTaskTopic(taskTitle);
  if (!topic) return 0;

  const wsLower = workspaceName.toLowerCase();
  const topicWords = topic.topic.split(/[_\s]+/);
  const friendlyWords = topic.friendlyName.toLowerCase().split(/\s+/);

  const hasMatch =
    topicWords.some((w) => wsLower.includes(w)) ||
    friendlyWords.some((w) => wsLower.includes(w));

  return hasMatch ? 40 : 0;
}
