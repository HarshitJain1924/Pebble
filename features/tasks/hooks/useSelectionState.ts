import { useState, useCallback } from "react";

export function useSelectionState() {
  const [isBulkSelectActive, setIsBulkSelectActive] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  const clearSelection = useCallback(() => {
    setIsBulkSelectActive(false);
    setSelectedItemIds(new Set());
  }, []);

  const toggleItemSelection = useCallback((id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedItemIds(new Set(ids));
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedItemIds(new Set());
  }, []);

  const isItemSelected = useCallback((id: string) => {
    return selectedItemIds.has(id);
  }, [selectedItemIds]);

  const selectionCount = selectedItemIds.size;

  return {
    isBulkSelectActive,
    setIsBulkSelectActive,
    selectedItemIds,
    setSelectedItemIds,
    clearSelection,
    toggleItemSelection,
    selectAll,
    deselectAll,
    isItemSelected,
    selectionCount,
  };
}