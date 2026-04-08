/**
 * Serializes concurrent calls to an async function.
 * While one call is in-flight, all subsequent callers await
 * the same promise instead of starting new work.
 */
export class PromiseLock<T> {
  #lock: Promise<T> | null = null;

  /**
   * Run `fn` if no call is in-flight; otherwise return the existing promise.
   * The lock is released (success or failure) once the promise settles.
   */
  run(fn: () => Promise<T>): Promise<T> {
    if (this.#lock) {
      return this.#lock;
    }
    this.#lock = fn();
    return this.#lock.then(
      (value) => {
        this.#lock = null;
        return value;
      },
      (error) => {
        this.#lock = null;
        throw error;
      },
    );
  }

  /** Force-clear the in-flight promise (e.g. on teardown). */
  clear(): void {
    this.#lock = null;
  }

  /** Calls {@link clear}, enabling `using lock = new PromiseLock()`. */
  [Symbol.dispose](): void {
    this.clear();
  }
}
