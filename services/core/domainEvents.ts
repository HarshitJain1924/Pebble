/**
 * domainEvents.ts
 * ───────────────
 * In-Memory Domain Event Bus with memory-safe subscriptions.
 */
import { Task, Habit, Resource, FocusSession } from "./models";

export type DomainEvent =
  | { type: "task.created"; payload: { task: Task } }
  | { type: "task.completed"; payload: { task: Task } }
  | { type: "habit.completed"; payload: { habit: Habit; date: string } }
  | { type: "focus.session_ended"; payload: { session: FocusSession } }
  | { type: "resource.created"; payload: { resource: Resource } };

export type DomainEventListener<T extends DomainEvent["type"]> = 
  (event: Extract<DomainEvent, { type: T }>) => void | Promise<void>;

export class DomainEventBus {
  private static listeners: { [K in DomainEvent["type"]]?: Set<any> } = {};

  /**
   * Subscribes to a runtime domain event.
   * Returns a cleanup function to unsubscribe and prevent memory leaks.
   */
  static subscribe<T extends DomainEvent["type"]>(
    type: T,
    listener: DomainEventListener<T>,
  ): () => void {
    if (!this.listeners[type]) {
      this.listeners[type] = new Set();
    }
    this.listeners[type]!.add(listener);

    return () => {
      const set = this.listeners[type];
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          delete this.listeners[type];
        }
      }
    };
  }

  /**
   * Emits a runtime domain event to all active subscribers.
   */
  static emit<T extends DomainEvent["type"]>(
    type: T,
    event: Extract<DomainEvent, { type: T }>,
  ): void {
    const list = this.listeners[type];
    if (list) {
      list.forEach((listener) => {
        try {
          listener(event);
        } catch (err) {
          console.error(`Error executing event listener for ${type}:`, err);
        }
      });
    }
  }

  /**
   * Cleans up all listeners (primarily for tests)
   */
  static clearAll(): void {
    this.listeners = {};
  }
}
