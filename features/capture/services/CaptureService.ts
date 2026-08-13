/**
 * CaptureService
 * ─────────────────
 * Orchestrator for Quick Capture.
 *
 * Delegates entity construction, reminder scheduling, persistence, and state events
 * to EntityCommandService. CaptureService owns the analytics snapshot call and
 * provides the duplicate validation gateway.
 *
 * This is the SINGLE entry point for creating entities from capture.
 * No screen, component, or hook should duplicate this workflow.
 */

import {
  INBOX_WORKSPACE_ID,
  type Task,
  type Habit,
  type Checklist,
  type Resource,
} from "@/shared/types/domain.types";
import { type ParsedProductivityItem } from "@/features/capture/services/nlp-parser.service";
import {
  analyzeDuplicate,
  type DuplicateAnalysisResult,
} from "@/features/capture/services/duplicate-detection.service";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { recordDailyHistorySnapshot } from "@/services/analytics/productivity-history.service";

// ─── Public API ─────────────────────────────────────────────────────────────

export type SavedEntity = Task | Habit | Checklist | Resource;

export interface SaveParsedItemOptions {
  bypassDuplicateCheck?: boolean;
}

/**
 * Validates a parsed productivity item against existing entities for potential duplicates.
 * Strictly read-only analysis.
 */
export async function validateCaptureItem(
  item: ParsedProductivityItem,
  workspaceId: string = INBOX_WORKSPACE_ID,
): Promise<DuplicateAnalysisResult> {
  return analyzeDuplicate(item, workspaceId);
}

/**
 * Save a parsed productivity item through the complete capture pipeline.
 *
 * Delegates to EntityCommandService which orchestrates:
 *   Entity construction → Reminder scheduling → Persistence → State events
 *
 * Analytics snapshot is handled here (awaited, non-blocking).
 *
 * @returns The saved canonical entity.
 */
export async function saveParsedItem(
  item: ParsedProductivityItem,
  workspaceId: string = INBOX_WORKSPACE_ID,
  _options?: SaveParsedItemOptions,
): Promise<SavedEntity> {
  let entity: SavedEntity;

  switch (item.type) {
    case "task": {
      entity = await EntityCommandService.createTask(item, workspaceId, {
        skipAnalytics: true,
      });
      break;
    }

    case "habit": {
      entity = await EntityCommandService.createHabit(item, workspaceId, {
        skipAnalytics: true,
      });
      break;
    }

    case "checklist": {
      entity = await EntityCommandService.createChecklist(item, workspaceId, {
        skipAnalytics: true,
      });
      break;
    }

    case "note":
    case "idea":
    case "link":
    case "file": {
      entity = await EntityCommandService.createResource(item, workspaceId, {
        skipAnalytics: true,
      });
      break;
    }

    default: {
      // Fallback: treat as task
      entity = await EntityCommandService.createTask(item, workspaceId, {
        skipAnalytics: true,
      });
    }
  }

  // Record analytics snapshot (fire-and-forget)
  try {
    await recordDailyHistorySnapshot();
  } catch {
    // Analytics failure is non-blocking
  }

  return entity;
}
