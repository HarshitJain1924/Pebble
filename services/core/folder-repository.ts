/**
 * folder-repository.ts
 * ─────────────────────
 * Folder persistence — CRUD for workspace folders.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { type Folder } from "./models";

const FOLDERS_KEY = "pebble:core:folders";

export class FolderRepository {
  static async getFolders(): Promise<Folder[]> {
    try {
      const raw = await AsyncStorage.getItem(FOLDERS_KEY);
      if (!raw) return [];
      const folders: Folder[] = JSON.parse(raw);
      return folders.sort((a, b) => a.sortOrder - b.sortOrder);
    } catch (e) {
      console.warn("Failed to get folders", e);
      return [];
    }
  }

  static async saveFolder(folder: Folder): Promise<void> {
    try {
      const folders = await this.getFolders();
      const idx = folders.findIndex((f) => f.id === folder.id);
      if (idx >= 0) {
        folders[idx] = { ...folder, updatedAt: Date.now() };
      } else {
        folders.push({ ...folder, updatedAt: Date.now() });
      }
      await AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
    } catch (e) {
      console.warn("Failed to save folder", e);
    }
  }

  static async saveFolders(folders: Folder[]): Promise<void> {
    try {
      await AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
    } catch (e) {
      console.warn("Failed to save folders batch", e);
    }
  }

  static async deleteFolder(id: string): Promise<void> {
    try {
      let folders = await this.getFolders();
      folders = folders.filter((f) => f.id !== id);
      await AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
    } catch (e) {
      console.warn("Failed to delete folder", e);
    }
  }
}