import type { Address } from "viem";
import type { ZamaSDKEvent, ZamaSDKEventInput, ZamaSDKEventType } from "../events/sdk-events";

/** Listener narrowed to one event type. */
export type TypedListener<K extends ZamaSDKEventType> = (
  event: Extract<ZamaSDKEvent, { type: K }>,
) => void | Promise<void>;

/** Catch-all listener that receives the full event union. */
export type ZamaSDKEventListener = (event: ZamaSDKEvent) => void | Promise<void>;

/** Options accepted by `on`, `once`, and `subscribe`. */
export interface ListenerOptions {
  /**
   * Tie the subscription's lifetime to an `AbortSignal`. When the signal
   * aborts, the listener is unsubscribed. If the signal is already aborted at
   * call time, the listener is never registered.
   */
  signal?: AbortSignal;
}

export interface EventServiceConfig {
  /** Back-compat: catch-all listener wired through `subscribe`. */
  onEvent?: ZamaSDKEventListener;
}

/**
 * Multi-listener, type-narrowed, awaited event bus.
 *
 * `on(type, …)` registers per event type with a narrowed payload.
 * `subscribe(…)` registers a catch-all listener (used by the back-compat
 * `createConfig({ onEvent })` path).
 *
 * `emit` is internal: it fans out to typed + catch-all listeners in parallel
 * via `Promise.all`, awaits async returns, and swallows throws. Callers that
 * need a deadline can pass `{ signal }` when subscribing (e.g.
 * `AbortSignal.timeout(ms)`).
 */
export class EventService {
  readonly #typed = new Map<ZamaSDKEventType, Set<ZamaSDKEventListener>>();
  readonly #any = new Set<ZamaSDKEventListener>();

  constructor(config: EventServiceConfig = {}) {
    if (config.onEvent) {
      this.#any.add(config.onEvent);
    }
  }

  /**
   * Subscribe to a single event type.
   *
   * @param type - Event type key (use `ZamaSDKEvents.*`).
   * @param listener - Receives the narrowed event payload.
   * @param options - Optional `{ signal }` to bind the subscription's lifetime to an `AbortSignal`.
   * @returns Unsubscribe function; calling it removes the listener.
   */
  on<K extends ZamaSDKEventType>(
    type: K,
    listener: TypedListener<K>,
    options?: ListenerOptions,
  ): () => void {
    if (options?.signal?.aborted) {
      return () => {};
    }
    let set = this.#typed.get(type);
    if (!set) {
      set = new Set();
      this.#typed.set(type, set);
    }
    const cast = listener as ZamaSDKEventListener;
    set.add(cast);
    const unsubscribe = () => {
      const current = this.#typed.get(type);
      if (current) {
        current.delete(cast);
        if (current.size === 0) {
          this.#typed.delete(type);
        }
      }
    };
    return this.#wireSignal(unsubscribe, options?.signal);
  }

  /**
   * One-shot subscribe: auto-unsubscribes before invoking the listener for
   * the first matching event.
   *
   * @param options - Optional `{ signal }` to bind the subscription's lifetime to an `AbortSignal`.
   * @returns Unsubscribe function. No-op after auto-fire; useful if the caller needs to bail before the event ever arrives.
   */
  once<K extends ZamaSDKEventType>(
    type: K,
    listener: TypedListener<K>,
    options?: ListenerOptions,
  ): () => void {
    let unsubscribe: () => void = () => {};
    const wrapper: TypedListener<K> = (event) => {
      unsubscribe();
      return listener(event);
    };
    unsubscribe = this.on(type, wrapper, options);
    return () => unsubscribe();
  }

  /**
   * Subscribe to every emitted event regardless of type. The listener receives
   * the full {@link ZamaSDKEvent} union — narrow with `switch (event.type)`.
   *
   * @param options - Optional `{ signal }` to bind the subscription's lifetime to an `AbortSignal`.
   * @returns Unsubscribe function.
   */
  subscribe(listener: ZamaSDKEventListener, options?: ListenerOptions): () => void {
    if (options?.signal?.aborted) {
      return () => {};
    }
    this.#any.add(listener);
    const unsubscribe = () => {
      this.#any.delete(listener);
    };
    return this.#wireSignal(unsubscribe, options?.signal);
  }

  /**
   * Emit an event to all matching typed listeners and every catch-all
   * listener. Resolves once all listener promises settle or time out.
   *
   * @internal
   */
  async emit(input: ZamaSDKEventInput, tokenAddress?: Address): Promise<void> {
    const event = {
      ...input,
      tokenAddress,
      timestamp: Date.now(),
    } satisfies ZamaSDKEvent;

    const typedSet = this.#typed.get(event.type);
    const typed = typedSet ? [...typedSet] : [];
    const any = [...this.#any];
    if (typed.length === 0 && any.length === 0) {
      return;
    }

    const tag = `EventService:${event.type}`;
    const tasks: Promise<void>[] = [];
    for (const listener of typed) {
      tasks.push(this.#run(tag, () => listener(event)));
    }
    for (const listener of any) {
      tasks.push(this.#run(tag, () => listener(event)));
    }
    await Promise.all(tasks);
  }

  #wireSignal(unsubscribe: () => void, signal: AbortSignal | undefined): () => void {
    if (!signal) {
      return unsubscribe;
    }
    const onAbort = () => unsubscribe();
    signal.addEventListener("abort", onAbort, { once: true });
    return () => {
      signal.removeEventListener("abort", onAbort);
      unsubscribe();
    };
  }

  async #run(tag: string, fn: () => void | Promise<void>): Promise<void> {
    try {
      await Promise.resolve().then(fn);
    } catch (error) {
      // oxlint-disable-next-line no-console
      console.warn(`[zama-sdk] ${tag} listener threw:`, error);
    }
  }
}
