import AsyncStorage from "@react-native-async-storage/async-storage";
import { withLock } from "@/shared/utils/mutex";
import type { MoveJournalEntry } from "@/shared/types/domain.types";

export class MoveJournalRepository {
  private static readonly JOURNAL_KEY = "pebble:v1:move_journal";

  /**
   * Get all pending move operations ordered by creation time.
   */
  static async getOperations(): Promise<MoveJournalEntry[]> {
    try {
      const raw = await AsyncStorage.getItem(this.JOURNAL_KEY);
      if (!raw) return [];
      const parsed: MoveJournalEntry[] = JSON.parse(raw);
      // Sort ascending by timestamp to ensure chronological replay
      return parsed.sort((a, b) => a.timestamp - b.timestamp);
    } catch (e) {
      console.error("[MoveJournalRepository] Failed to read journal", e);
      return [];
    }
  }

  /**
   * Append a new move operation to the journal.
   * Uses mutex lock to safely update the journal array.
   */
  static async addOperation(entry: MoveJournalEntry): Promise<void> {
    await withLock(this.JOURNAL_KEY, async () => {
      const current = await this.getOperations();
      
      // Deduplicate: if an operation with this ID already exists, do not duplicate it
      if (current.some((op) => op.operationId === entry.operationId)) {
        return;
      }

      current.push(entry);
      await AsyncStorage.setItem(this.JOURNAL_KEY, JSON.stringify(current));
    });
  }

  /**
   * Append multiple new move operations to the journal.
   */
  static async addOperations(entries: MoveJournalEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await withLock(this.JOURNAL_KEY, async () => {
      const current = await this.getOperations();
      
      const newEntries = entries.filter(
        (entry) => !current.some((op) => op.operationId === entry.operationId)
      );

      if (newEntries.length === 0) return;

      current.push(...newEntries);
      await AsyncStorage.setItem(this.JOURNAL_KEY, JSON.stringify(current));
    });
  }

  /**
   * Remove a completed move operation from the journal.
   */
  static async removeOperation(operationId: string): Promise<void> {
    await this.removeOperations([operationId]);
  }

  /**
   * Remove multiple completed move operations from the journal.
   */
  static async removeOperations(operationIds: string[]): Promise<void> {
    if (operationIds.length === 0) return;
    await withLock(this.JOURNAL_KEY, async () => {
      const current = await this.getOperations();
      const idsSet = new Set(operationIds);
      const filtered = current.filter((op) => !idsSet.has(op.operationId));
      
      if (filtered.length !== current.length) {
        if (filtered.length === 0) {
          await AsyncStorage.removeItem(this.JOURNAL_KEY);
        } else {
          await AsyncStorage.setItem(this.JOURNAL_KEY, JSON.stringify(filtered));
        }
      }
    });
  }
}
