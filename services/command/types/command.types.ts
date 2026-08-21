import type { ParsedProductivityItem } from "@/features/capture/services/nlp-parser.service";

export interface CreateEntityOptions {
  /** Skip state event emission (useful for batch operations) */
  skipEvents?: boolean;
  /** Skip analytics snapshot trigger */
  skipAnalytics?: boolean;
  /** Origin identifier for state event emission to prevent self-reload loops */
  source?: string;
}

/**
 * Type guard to check if input is a ParsedProductivityItem vs pre-built entity object.
 */
export function isParsedProductivityItem(
  input: any,
): input is ParsedProductivityItem {
  return (
    typeof input === "object" &&
    input !== null &&
    typeof input.type === "string" &&
    typeof input.confidence === "number"
  );
}
