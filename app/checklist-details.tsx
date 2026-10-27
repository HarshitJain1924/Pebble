import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";

import { ChecklistDetailContent } from "@/features/details/checklist/ChecklistDetailContent";

/**
 * Route orchestrator for the Checklist detail screen. Reads the route
 * parameters and dispatches to the ChecklistDetailContent implementation. All
 * checklist-specific state, presentation, and mutations live in the
 * DetailContent component (which routes mutations through
 * EntityCommandService).
 */
export default function ChecklistDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    workspaceId?: string;
    edit?: string;
    date?: string;
  }>();

  return (
    <ChecklistDetailContent
      checklistId={params.id || ""}
      workspaceId={params.workspaceId}
      initialEdit={params.edit === "true"}
      occurrenceDate={params.date}
      onBack={() => router.back()}
    />
  );
}
