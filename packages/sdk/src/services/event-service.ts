import type { Address } from "viem";
import type { ZamaSDKEvent, ZamaSDKEventInput, ZamaSDKEventType } from "../events/sdk-events";

/** Listener narrowed to one event type. */
export type TypedListener<K extends ZamaSDKEventType> = (
  event: Extract<ZamaSDKEvent, { type: K }>,
) => void;

/** Catch-all listener that receives the full event union. */
export type AnyListener = (event: ZamaSDKEvent) => void;

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
  onEvent?: AnyListener;
}

/**
 * Returned by `on`, `once`, and `subscribe`. Calling it unsubscribes the
 * listener; it also implements {@link Disposable} so it can be bound to a
 * `using` declaration for scope-local subscriptions.
 */
export type DisposableFn<T extends () => void> = T & Disposable;

function makeDisposableFn<T extends () => void>(callback: T): DisposableFn<T> {
  const fn = callback as DisposableFn<T>;
  fn[Symbol.dispose] = callback;
  return fn;
}

/**
 * Multi-listener, type-narrowed event bus.
 *
 * `on(type, …)` registers per event type with a narrowed payload.
 * `subscribe(…)` registers a catch-all listener (used by the back-compat
 * `createConfig({ onEvent })` path).
 *
 * `emit` is internal: it dispatches synchronously to typed + catch-all
 * listeners. A listener throw never propagates back to the SDK caller; it
 * is re-thrown on a fresh microtask so the platform's normal error
 * pipeline (`window.onerror` / `uncaughtException` / Sentry) sees it.
 * Listeners are expected to be synchronous — returned promises are not
 * awaited or tracked.
 */
export class EventService {
  readonly #typed = new Map<ZamaSDKEventType, Set<AnyListener>>();
  readonly #any = new Set<AnyListener>();

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
   * @returns {@link DisposableFn} — a function that removes the listener when called, also usable with `using` for scope-local subscriptions.
   */
  on<K extends ZamaSDKEventType>(
    type: K,
    listener: TypedListener<K>,
    options?: ListenerOptions,
  ): DisposableFn<() => void> {
    if (options?.signal?.aborted) {
      return makeDisposableFn(() => {});
    }
    let set = this.#typed.get(type);
    if (!set) {
      set = new Set();
      this.#typed.set(type, set);
    }
    const cast = listener as AnyListener;
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
    return makeDisposableFn(this.#wireSignal(unsubscribe, options?.signal));
  }

  /**
   * One-shot subscribe: auto-unsubscribes before invoking the listener for
   * the first matching event.
   *
   * @param options - Optional `{ signal }` to bind the subscription's lifetime to an `AbortSignal`.
   * @returns {@link DisposableFn} — no-op after auto-fire; useful if the caller needs to bail before the event ever arrives. Also usable with `using`.
   */
  once<K extends ZamaSDKEventType>(
    type: K,
    listener: TypedListener<K>,
    options?: ListenerOptions,
  ): DisposableFn<() => void> {
    let unsubscribe: () => void = () => {};
    const wrapper: TypedListener<K> = (event) => {
      unsubscribe();
      listener(event);
    };
    unsubscribe = this.on(type, wrapper, options);
    return makeDisposableFn(() => unsubscribe());
  }

  /**
   * Subscribe to every emitted event regardless of type. The listener receives
   * the full {@link ZamaSDKEvent} union — narrow with `switch (event.type)`.
   *
   * @param options - Optional `{ signal }` to bind the subscription's lifetime to an `AbortSignal`.
   * @returns {@link DisposableFn} — call it to remove the listener; also usable with `using` for scope-local subscriptions.
   */
  subscribe(listener: AnyListener, options?: ListenerOptions): DisposableFn<() => void> {
    if (options?.signal?.aborted) {
      return makeDisposableFn(() => {});
    }
    this.#any.add(listener);
    const unsubscribe = () => {
      this.#any.delete(listener);
    };
    return makeDisposableFn(this.#wireSignal(unsubscribe, options?.signal));
  }

  /**
   * Emit an event to all matching typed listeners and every catch-all
   * listener. Dispatches inline; returns once every listener has been
   * invoked. A listener throw (or returned-thenable rejection) is logged
   * and swallowed.
   *
   * @internal
   */
  emit(input: ZamaSDKEventInput, tokenAddress?: Address): void {
    const event = {
      ...input,
      tokenAddress,
      timestamp: Date.now(),
    } satisfies ZamaSDKEvent;

    // Snapshot before dispatch so a listener that subscribes during emit
    // doesn't gain a turn in this round (Set iteration would pick it up).
    const typedSet = this.#typed.get(event.type);
    const typed = typedSet ? Array.from(typedSet) : undefined;
    const any = Array.from(this.#any);
    if (typed) {
      for (const listener of typed) {
        this.#run(listener, event);
      }
    }
    for (const listener of any) {
      this.#run(listener, event);
    }
  }

  #wireSignal(unsubscribe: () => void, signal: AbortSignal | undefined): () => void {
    if (!signal) {
      return unsubscribe;
    }
    const ctrl = new AbortController();
    signal.addEventListener("abort", () => unsubscribe(), {
      once: true,
      signal: ctrl.signal,
    });
    return () => {
      ctrl.abort();
      unsubscribe();
    };
  }

  #run(listener: AnyListener, event: ZamaSDKEvent): void {
    try {
      listener(event);
    } catch (error) {
      // Isolate the SDK caller from a buggy listener, but surface the error
      // to the platform's normal error pipeline instead of silencing it.
      queueMicrotask(() => {
        throw error;
      });
    }
  }
}
