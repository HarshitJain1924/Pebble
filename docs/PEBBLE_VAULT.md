# Pebble Knowledge Collections Specification (formerly Pebble Vault)

This document outlines the user flows, UX layouts, data models, and integration strategies for the **Knowledge Collections** system, which allows users to organize passive reference links, notes, images, and files in project-centric folders.

---

## 1. Product Philosophy
Pebble’s mental model balances active and passive cognitive load:
* **Tasks** = Things to do (active, short-term)
* **Habits** = Things to repeat (active, long-term)
* **Collections** = Things to keep and revisit (passive, contextual references)

**The Core Goal**: Solve forgetting, not storage. Instead of acting as a dumping ground for raw bookmarks, the Knowledge Collections system acts as a structured memory drawer inside project folders.

---

## 2. User Flows

### 2.1 Save Item (Quick Add Modal)
1. Tap the global **Quick Add bottom sheet modal** (the center `+` button in the navigation bar).
2. Toggling the segment to `Reference` configures the item type tags (`🔗 Link`, `📝 Note`, `🖼️ Image`).
3. NLP auto-classification triggers:
   * Pasting `http://` or `www.` pre-selects `🔗 Link` and pre-fills the URL field.
   * Typing keywords (e.g. `note:`, `remember`) pre-selects `📝 Note`.
4. **Folder and Collection Assignment**:
   * Workspace Picker: Defaults to `"unassigned"` (Inbox).
   * Collection Picker: Displays active Collections within that Workspace folder. Defaults to an auto-generated `"Quick Captures"` collection.

### 2.2 Browse & Sort
1. Open the **Workspace / Planner Tab**.
2. Unassigned items appear under the **Inbox** folder card at the top of the grid.
3. Open a Workspace folder (e.g. "College") and toggle the sub-segment switcher from `[Tasks]` to `[Collections]`.
4. Tap any collection card (e.g. `📚 DBMS Notes`) to expand/collapse its contents inline.

### 2.3 Non-Destructive Task Conversion
* A card action button **"To Task"** copy-projects the collection item into the active task list, schedules the task, awards **+10 XP** (represented as dropping a pebble), and leaves the source item intact in the collection for future reference.

---

## 3. UX Design

### 3.1 Folder Segment Switcher
Workspace folders utilize a three-way SegmentedSwitcher to partition folder scopes:
```
+--------------------------------------------+
|     Tasks    |    Habits    |  Collections |
+--------------------------------------------+
```
* **Layout**: Collections are rendered as premium parchment cards (`rgba(253, 251, 242, 0.96)` for light mode, `rgba(30, 29, 27, 0.96)` for dark mode), matching the Mascot's suggestion card.
* **Recycle Bin Integration**:
  * Deleting a Collection or Collection Item places it in the Recycle Bin under the "Collections" tab.
  * Restoring a Collection or Collection Item from the Recycle Bin automatically populates it back into its original Workspace Folder and emits a `vault_changed` event to update the UI instantly.
* **Gestures**:
  * Swipe Right on Collection: Rename/Archive the collection.
  * Swipe Left on Collection: Delete the collection to the Recycle Bin.
  * Swipe Item Row: Delete/Archive individual items.

---

## 4. Information Architecture

### 4.1 Data Models
The types are defined in [types.ts](file:///c:/Users/harsh/OneDrive/Desktop/todoapp/modules/types.ts):
```typescript
export type CollectionItemType = "link" | "note" | "image" | "file";

export type CollectionItem = {
  id: string;
  type: CollectionItemType;
  title: string;
  content?: string;
  url?: string;
  mediaUri?: string;
  createdAt: number;
  archived?: boolean;
};

export type Collection = {
  id: string;
  workspaceId: string;
  name: string;
  emoji: string;
  createdAt: number;
  items: CollectionItem[];
  archived?: boolean;
};
```

### 4.2 Storage Key
* Persisted under key: `todoapp:collections:v1`.
* Stored as a Record grouped by workspace ID: `Record<string, Collection[]>`, using `"unassigned"` for inbox items.
