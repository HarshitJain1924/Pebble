// Duplicate detection service for tasks and habits using Jaccard similarity and title matching rules.

export type DuplicateKind = "exact" | "contains" | "contained" | "near";

export interface DuplicateMatch<T> {
  kind: DuplicateKind;
  item: T;
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // strip punctuation
    .replace(/\s+/g, " ")     // collapse spaces
    .trim();
}

export function similarity(a: string, b: string): number {
  const normA = normalizeTitle(a);
  const normB = normalizeTitle(b);
  if (!normA && !normB) return 1;
  if (!normA || !normB) return 0;

  const wordsA = new Set(normA.split(" "));
  const wordsB = new Set(normB.split(" "));

  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);

  return intersection.size / union.size;
}

export function findDuplicateTask<T extends { id: string; title: string; completed?: boolean; archived?: boolean }>(
  title: string,
  todos: Record<string, T[]>
): DuplicateMatch<T> | null {
  const normNew = normalizeTitle(title);
  if (!normNew) return null;

  // Flatten and filter active (non-completed, non-archived) todos
  const activeTodos: T[] = [];
  for (const list of Object.values(todos)) {
    for (const todo of list) {
      if (!todo.completed && !todo.archived) {
        activeTodos.push(todo);
      }
    }
  }

  for (const todo of activeTodos) {
    const normExisting = normalizeTitle(todo.title);
    if (!normExisting) continue;

    if (normNew === normExisting) {
      return { kind: "exact", item: todo };
    }
    if (normNew.includes(normExisting)) {
      return { kind: "contains", item: todo };
    }
    if (normExisting.includes(normNew)) {
      return { kind: "contained", item: todo };
    }
    // threshold Jaccard similarity of >= 0.5 is a "near" match (e.g. "Study K8s Kubernetes" and "Study Kubernetes" has 2/3 similarity)
    if (similarity(normNew, normExisting) >= 0.5) {
      return { kind: "near", item: todo };
    }
  }

  return null;
}

export function findDuplicateHabit<T extends { id: string; title: string; archived?: boolean }>(
  title: string,
  habits: T[]
): DuplicateMatch<T> | null {
  const normNew = normalizeTitle(title);
  if (!normNew) return null;

  const activeHabits = habits.filter(h => !h.archived);

  for (const habit of activeHabits) {
    const normExisting = normalizeTitle(habit.title);
    if (!normExisting) continue;

    if (normNew === normExisting) {
      return { kind: "exact", item: habit };
    }
    if (normNew.includes(normExisting)) {
      return { kind: "contains", item: habit };
    }
    if (normExisting.includes(normNew)) {
      return { kind: "contained", item: habit };
    }
    if (similarity(normNew, normExisting) >= 0.5) {
      return { kind: "near", item: habit };
    }
  }

  return null;
}

export function getDuplicateSuggestions(kind: DuplicateKind, newTitle: string, existingTitle: string): string {
  switch (kind) {
    case "exact":
      return `"${existingTitle}" already exists`;
    case "contains":
      return `"${existingTitle}" is part of your new entry`;
    case "contained":
      return `"${existingTitle}" already covers "${newTitle}"`;
    case "near":
      return `"${existingTitle}" looks very similar`;
    default:
      return "";
  }
}
