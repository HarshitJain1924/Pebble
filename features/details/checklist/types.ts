import type { Checklist } from "@/shared/types/domain.types";

/**
 * Entity shape used by the Checklist Detail screen. Widens the stored
 * `resourceIds` to a mutable id list for the form (the pre-existing screen
 * keeps linked-resource ids in separate form state).
 */
export type ChecklistDetailItem = Checklist;
