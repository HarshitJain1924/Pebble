import { useCallback, useState } from "react";

import type { Checklist, ChecklistItem } from "@/shared/types/domain.types";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";

export interface ChecklistFormState {
  title: string;
  description: string;
  workspaceId: string;
  items: ChecklistItem[];
  linkedCollectionIds: string[];
  newItemText: string;
}

const INITIAL_FORM: ChecklistFormState = {
  title: "",
  description: "",
  workspaceId: INBOX_WORKSPACE_ID,
  items: [],
  linkedCollectionIds: [],
  newItemText: "",
};

const newItemId = () =>
  `checklist-item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

/**
 * Owns the Checklist Detail edit-form state group (title, description,
 * workspace, items, linked resources, add-item draft) plus the derived item
 * interactions: re-initializing from a loaded checklist (`reset`), partial
 * updates (`update`), adding/renaming/deleting items, reordering items, and
 * toggling linked resources.
 *
 * This is Checklist-specific: item ordering and editing semantics are owned
 * here so the shared Detail primitives stay entity-agnostic.
 */
export function useChecklistDetailForm() {
  const [form, setForm] = useState<ChecklistFormState>(INITIAL_FORM);

  const update = useCallback((patch: Partial<ChecklistFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  }, []);

  const reset = useCallback((data: Checklist) => {
    setForm({
      title: data.title || "",
      description: data.description || "",
      workspaceId: data.workspaceId || INBOX_WORKSPACE_ID,
      items: data.items || [],
      linkedCollectionIds: data.resourceIds || [],
      newItemText: "",
    });
  }, []);

  const addItem = useCallback(() => {
    setForm((current) => {
      const text = current.newItemText.trim();
      if (!text) return current;
      const newItem: ChecklistItem = {
        id: newItemId(),
        title: text,
        completed: false,
      };
      return { ...current, items: [...current.items, newItem], newItemText: "" };
    });
  }, []);

  const setNewItemText = useCallback((text: string) => {
    setForm((current) => ({ ...current, newItemText: text }));
  }, []);

  const deleteItem = useCallback((id: string) => {
    setForm((current) => ({
      ...current,
      items: current.items.filter((it) => it.id !== id),
    }));
  }, []);

  const renameItem = useCallback((id: string, text: string) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((it) =>
        it.id === id ? { ...it, title: text } : it,
      ),
    }));
  }, []);

  const moveItemUp = useCallback((index: number) => {
    if (index === 0) return;
    setForm((current) => {
      const next = [...current.items];
      const temp = next[index];
      next[index] = next[index - 1];
      next[index - 1] = temp;
      return { ...current, items: next };
    });
  }, []);

  const moveItemDown = useCallback((index: number) => {
    setForm((current) => {
      if (index === current.items.length - 1) return current;
      const next = [...current.items];
      const temp = next[index];
      next[index] = next[index + 1];
      next[index + 1] = temp;
      return { ...current, items: next };
    });
  }, []);

  const toggleResource = useCallback((resId: string) => {
    setForm((current) => ({
      ...current,
      linkedCollectionIds: current.linkedCollectionIds.includes(resId)
        ? current.linkedCollectionIds.filter((id) => id !== resId)
        : [...current.linkedCollectionIds, resId],
    }));
  }, []);

  return {
    form,
    update,
    reset,
    addItem,
    setNewItemText,
    deleteItem,
    renameItem,
    moveItemUp,
    moveItemDown,
    toggleResource,
  };
}
