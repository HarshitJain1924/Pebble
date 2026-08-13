/**
 * DuplicateDetectionService
 * ──────────────────────────
 * Read-only analysis service for Quick Capture.
 *
 * Evaluates candidate capture items against existing repository entities to identify:
 *   1. Exact normalized duplicates (e.g., "Buy Milk" vs "buy milk!")
 *   2. Near duplicates with minor temporal/filler variations (e.g., "Buy milk" vs "Buy milk tomorrow")
 *   3. Habit conversion candidates (e.g., existing "Exercise" Task vs new "Exercise every morning" Habit)
 *   4. Related but distinct entities (e.g., "Buy groceries" vs "Buy groceries for Sunday dinner")
 *
 * INVARIANTS:
 *   - Strictly READ-ONLY: Never creates, mutates, archives, deletes, or merges entities.
 *   - Never blocks capture: Analysis produces a diagnostic signal, not an execution gate.
 *   - Current workspace preferred: Cross-workspace matches receive substantially lower confidence.
 */

import {
  type Task,
  type Habit,
  type Checklist,
  type Resource,
  INBOX_WORKSPACE_ID,
} from "@/shared/types/domain.types";
import { type ParsedProductivityItem } from "@/features/capture/services/nlp-parser.service";
import { TaskRepository } from "@/repositories/TaskRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { ChecklistRepository } from "@/repositories/ChecklistRepository";
import { ResourceRepository } from "@/repositories/ResourceRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";

// ─── Types ───────────────────────────────────────────────────────────────────

export type DuplicateRelationship =
  | "exact_duplicate"
  | "near_duplicate"
  | "related_different"
  | "habit_conversion_candidate";

export type MatchedEntitySummary = {
  id: string;
  title: string;
  type: "task" | "habit" | "checklist" | "resource";
  workspaceId: string;
  status?: string;
  schedule?: any;
  recurrence?: any;
  updatedAt?: number;
};

export type DuplicateAnalysisResult = {
  isPotentialDuplicate: boolean;
  confidence: number; // 0.0 to 1.0
  matchedEntity?: MatchedEntitySummary;
  reason?: string;
  relationship?: DuplicateRelationship;
};

export type AnyEntity = Task | Habit | Checklist | Resource;

// ─── Normalization & Token Utilities ─────────────────────────────────────────

const STOP_WORDS = new Set([
  "a", "an", "the", "to", "for", "in", "on", "at", "with", "and", "or", "of",
  "from", "by", "is", "it", "my", "our", "your", "this", "that",
  // Temporal filler words
  "today", "tomorrow", "tonight", "yesterday", "every", "daily", "weekly",
  "monthly", "morning", "evening", "night", "pm", "am", "urgent", "asap",
]);

/**
 * Normalizes title by removing punctuation, collapsing whitespace, and lowercasing.
 * E.g., "BUY MILK!" -> "buy milk"
 */
export function normalizeTitle(title: string): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts core semantic keywords by normalizing and filtering stop words.
 */
export function extractKeywords(title: string): string[] {
  const norm = normalizeTitle(title);
  if (!norm) return [];
  return norm
    .split(/\s+/)
    .filter(token => token.length > 0 && !STOP_WORDS.has(token));
}

function getEntityType(entity: AnyEntity): "task" | "habit" | "checklist" | "resource" {
  if ("items" in entity && Array.isArray((entity as any).items)) {
    return "checklist";
  }
  if ("recurrence" in entity && (entity as any).recurrence) {
    return "habit";
  }
  if ("resourceType" in entity || "url" in entity || (entity as any).type === "note" || (entity as any).type === "link" || (entity as any).type === "idea" || (entity as any).type === "file") {
    return "resource";
  }
  return "task";
}

// ─── Core Comparison Logic ───────────────────────────────────────────────────

/**
 * Compares a parsed candidate capture item against a single existing entity.
 */
export function compareEntities(
  candidate: ParsedProductivityItem,
  candidateWorkspaceId: string,
  existing: AnyEntity,
): DuplicateAnalysisResult | null {
  const candidateNorm = normalizeTitle(candidate.title);
  const existingNorm = normalizeTitle(existing.title);

  if (!candidateNorm || !existingNorm) {
    return null;
  }

  const isSameWorkspace = (existing.workspaceId || INBOX_WORKSPACE_ID) === candidateWorkspaceId;
  const existingType = getEntityType(existing);
  const candidateGeneralType =
    candidate.type === "note" || candidate.type === "idea" || candidate.type === "link" || candidate.type === "file"
      ? "resource"
      : candidate.type;

  const matchedSummary: MatchedEntitySummary = {
    id: existing.id,
    title: existing.title,
    type: existingType,
    workspaceId: existing.workspaceId || INBOX_WORKSPACE_ID,
    status: (existing as any).status,
    schedule: (existing as any).schedule,
    recurrence: (existing as any).recurrence,
    updatedAt: (existing as any).updatedAt || (existing as any).createdAt,
  };

  // 1. Exact Normalized Title Match
  if (candidateNorm === existingNorm) {
    // Check Task vs Habit conversion
    if (
      (candidateGeneralType === "habit" && existingType === "task") ||
      (candidate.recurrence && existingType === "task")
    ) {
      return {
        isPotentialDuplicate: false,
        confidence: isSameWorkspace ? 0.70 : 0.40,
        matchedEntity: matchedSummary,
        reason: isSameWorkspace
          ? "Existing task with the same title found (potential habit conversion opportunity)"
          : "Existing task in another workspace with the same title",
        relationship: "habit_conversion_candidate",
      };
    }

    if (candidateGeneralType === "task" && existingType === "habit") {
      return {
        isPotentialDuplicate: false,
        confidence: isSameWorkspace ? 0.65 : 0.35,
        matchedEntity: matchedSummary,
        reason: isSameWorkspace
          ? "Existing habit with the same title already active"
          : "Existing habit in another workspace with the same title",
        relationship: "habit_conversion_candidate",
      };
    }

    // Check if dates differ between candidate and existing entity
    const candidateDate = candidate.date;
    const existingDate = (existing as any).schedule?.date || (existing as any).scheduledDate || (existing as any).dueDate;

    const hasDateDifference =
      (candidateDate && !existingDate) ||
      (!candidateDate && existingDate) ||
      (candidateDate && existingDate && candidateDate !== existingDate);

    if (hasDateDifference) {
      return {
        isPotentialDuplicate: true,
        confidence: isSameWorkspace ? 0.75 : 0.40,
        matchedEntity: matchedSummary,
        reason: isSameWorkspace
          ? "Same title with different date/schedule in current workspace"
          : "Same title with different date in another workspace",
        relationship: "near_duplicate",
      };
    }

    // Exact title and schedule duplicate
    return {
      isPotentialDuplicate: true,
      confidence: isSameWorkspace ? 1.0 : 0.50,
      matchedEntity: matchedSummary,
      reason: isSameWorkspace
        ? "Exact title match in current workspace"
        : `Exact title match found in another workspace (${existing.workspaceId})`,
      relationship: "exact_duplicate",
    };
  }

  // 2. Strong Lexical Similarity (Keywords & Tokens)
  const candidateKeywords = extractKeywords(candidate.title);
  const existingKeywords = extractKeywords(existing.title);

  if (candidateKeywords.length > 0 && existingKeywords.length > 0) {
    const candKeyStr = candidateKeywords.join(" ");
    const existKeyStr = existingKeywords.join(" ");

    // Same core keywords (only differed by temporal/filler words)
    if (candKeyStr === existKeyStr) {
      // Habit vs Task distinction
      if (
        (candidateGeneralType === "habit" && existingType === "task") ||
        (candidate.recurrence && existingType === "task")
      ) {
        return {
          isPotentialDuplicate: false,
          confidence: isSameWorkspace ? 0.65 : 0.35,
          matchedEntity: matchedSummary,
          reason: "Existing task has matching core routine action",
          relationship: "habit_conversion_candidate",
        };
      }

      return {
        isPotentialDuplicate: true,
        confidence: isSameWorkspace ? 0.75 : 0.40,
        matchedEntity: matchedSummary,
        reason: isSameWorkspace
          ? "Near duplicate with identical core action in current workspace"
          : "Near duplicate found in another workspace",
        relationship: "near_duplicate",
      };
    }

    // Subset with additional context (e.g. "Buy groceries" vs "Buy groceries for Sunday dinner")
    const commonTokens = candidateKeywords.filter(t => existingKeywords.includes(t));
    const isSubset =
      commonTokens.length === Math.min(candidateKeywords.length, existingKeywords.length) &&
      commonTokens.length >= 1;

    if (isSubset && candidateKeywords.length !== existingKeywords.length) {
      return {
        isPotentialDuplicate: false,
        confidence: isSameWorkspace ? 0.35 : 0.20,
        matchedEntity: matchedSummary,
        reason: "Related title with distinct contextual modifier",
        relationship: "related_different",
      };
    }
  }

  return null;
}

// ─── Public Duplicate Detection API ──────────────────────────────────────────

/**
 * Pure, synchronous duplicate analysis against an in-memory list of entities.
 * Deterministically ranks candidates and returns the strongest match.
 */
export function analyzeDuplicateAgainstEntities(
  candidate: ParsedProductivityItem,
  targetWorkspaceId: string,
  existingEntities: AnyEntity[],
): DuplicateAnalysisResult {
  if (!candidate || !candidate.title || candidate.title.trim().length === 0) {
    return { isPotentialDuplicate: false, confidence: 0 };
  }

  const results: DuplicateAnalysisResult[] = [];

  for (const entity of existingEntities) {
    const res = compareEntities(candidate, targetWorkspaceId, entity);
    if (res) {
      results.push(res);
    }
  }

  if (results.length === 0) {
    return { isPotentialDuplicate: false, confidence: 0 };
  }

  // Deterministic Ranking Hierarchy:
  // 1. Highest confidence
  // 2. Same workspace preferred
  // 3. Active status preferred over completed
  // 4. Most recently updated
  results.sort((a, b) => {
    // 1. Confidence comparison
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }

    // 2. Workspace preference
    const aSameWs = a.matchedEntity?.workspaceId === targetWorkspaceId ? 1 : 0;
    const bSameWs = b.matchedEntity?.workspaceId === targetWorkspaceId ? 1 : 0;
    if (bSameWs !== aSameWs) {
      return bSameWs - aSameWs;
    }

    // 3. Active vs Completed
    const aActive = a.matchedEntity?.status !== "completed" ? 1 : 0;
    const bActive = b.matchedEntity?.status !== "completed" ? 1 : 0;
    if (bActive !== aActive) {
      return bActive - aActive;
    }

    // 4. Recency
    const aTime = a.matchedEntity?.updatedAt || 0;
    const bTime = b.matchedEntity?.updatedAt || 0;
    return bTime - aTime;
  });

  return results[0];
}

/**
 * Asynchronously loads entities from repositories and performs duplicate analysis.
 * Strictly read-only.
 */
export async function analyzeDuplicate(
  candidate: ParsedProductivityItem,
  targetWorkspaceId: string = INBOX_WORKSPACE_ID,
  options?: { checkAllWorkspaces?: boolean },
): Promise<DuplicateAnalysisResult> {
  if (!candidate || !candidate.title || candidate.title.trim().length === 0) {
    return { isPotentialDuplicate: false, confidence: 0 };
  }

  try {
    const workspacesToScan = [targetWorkspaceId];

    if (options?.checkAllWorkspaces) {
      const allWorkspaces = await WorkspaceRepository.getWorkspaces();
      for (const ws of allWorkspaces) {
        if (!workspacesToScan.includes(ws.id)) {
          workspacesToScan.push(ws.id);
        }
      }
    }

    const allEntities: AnyEntity[] = [];

    for (const wsId of workspacesToScan) {
      const [tasksMap, habitsMap, checklistsMap, resourcesMap] = await Promise.all([
        TaskRepository.getTasks(wsId).catch(() => ({})),
        HabitRepository.getHabits(wsId).catch(() => ({})),
        ChecklistRepository.getChecklists(wsId).catch(() => ({})),
        ResourceRepository.getResources(wsId).catch(() => ({})),
      ]);

      allEntities.push(...Object.values(tasksMap));
      allEntities.push(...Object.values(habitsMap));
      allEntities.push(...Object.values(checklistsMap));
      allEntities.push(...Object.values(resourcesMap));
    }

    return analyzeDuplicateAgainstEntities(candidate, targetWorkspaceId, allEntities);
  } catch (error) {
    console.warn("DuplicateDetectionService.analyzeDuplicate error:", error);
    return { isPotentialDuplicate: false, confidence: 0 };
  }
}
