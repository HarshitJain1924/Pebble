import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ConversionJournalEntry } from "@/shared/types/domain.types";

export class ConversionJournalRepository {
  private static readonly JOURNAL_KEY = "pebble:v1:conversion_journal";
  private static readonly SEQUENCE_KEY = "pebble:v1:conversion_journal_seq";

  static async getNextSequence(): Promise<number> {
    const raw = await AsyncStorage.getItem(this.SEQUENCE_KEY);
    const current = raw ? parseInt(raw, 10) : 0;
    const next = current + 1;
    await AsyncStorage.setItem(this.SEQUENCE_KEY, String(next));
    return next;
  }

  /**
   * Get all pending conversion operations ordered by creation time.
   */
  static async getOperations(): Promise<ConversionJournalEntry[]> {
    try {
      const raw = await AsyncStorage.getItem(this.JOURNAL_KEY);
      if (!raw) return [];
      const parsed: ConversionJournalEntry[] = JSON.parse(raw);
      // Sort ascending by sequence / timestamp to ensure chronological replay
      return parsed.sort((a, b) => {
        if (a.sequence !== undefined && b.sequence !== undefined && a.sequence !== b.sequence) {
          return a.sequence - b.sequence;
        }
        if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
        return a.operationId.localeCompare(b.operationId);
      });
    } catch (e) {
      console.error("[ConversionJournalRepository] Failed to read journal", e);
      throw e;
    }
  }

  /**
   * Append a new conversion operation to the journal without acquiring a lock.
   * Useful when the caller already holds the conversion_journal lock.
   */
  static async addOperationUnlocked(entry: ConversionJournalEntry): Promise<void> {
    const current = await this.getOperations();
    
    // Deduplicate: if an operation with this ID already exists, do not duplicate it
    if (current.some((op) => op.operationId === entry.operationId)) {
      return;
    }

    if (entry.sequence === undefined) {
      entry.sequence = await this.getNextSequence();
    }

    current.push(entry);
    await AsyncStorage.setItem(this.JOURNAL_KEY, JSON.stringify(current));
  }

  /**
   * Update the phase of an existing operation without acquiring a lock.
   */
  static async updateOperationUnlocked(operationId: string, updates: Partial<ConversionJournalEntry>): Promise<void> {
    const current = await this.getOperations();
    let updated = false;

    const mapped = current.map((op) => {
      if (op.operationId === operationId) {
        updated = true;
        return { ...op, ...updates };
      }
      return op;
    });

    if (updated) {
      await AsyncStorage.setItem(this.JOURNAL_KEY, JSON.stringify(mapped));
    }
  }

  /**
   * Remove a completed conversion operation from the journal without acquiring a lock.
   */
  static async removeOperationUnlocked(operationId: string): Promise<void> {
    const current = await this.getOperations();
    const filtered = current.filter((op) => op.operationId !== operationId);
    
    if (filtered.length !== current.length) {
      if (filtered.length === 0) {
        await AsyncStorage.removeItem(this.JOURNAL_KEY);
      } else {
        await AsyncStorage.setItem(this.JOURNAL_KEY, JSON.stringify(filtered));
      }
    }
  }
}
