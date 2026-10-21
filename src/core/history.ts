/** Bounded undo/redo stack of opaque snapshots. */
export class History<T> {
  private undoStack: T[] = [];
  private redoStack: T[] = [];

  constructor(private readonly limit = 20) {}

  /** Records the state *before* a change. Clears redo. */
  push(before: T): void {
    this.undoStack.push(before);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  /**
   * Pops the last snapshot. `capture` must return the live state matching
   * that snapshot, which is saved so redo can return to it.
   */
  undo(capture: (target: T) => T): T | undefined {
    const prev = this.undoStack.pop();
    if (prev !== undefined) this.redoStack.push(capture(prev));
    return prev;
  }

  redo(capture: (target: T) => T): T | undefined {
    const next = this.redoStack.pop();
    if (next !== undefined) this.undoStack.push(capture(next));
    return next;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
