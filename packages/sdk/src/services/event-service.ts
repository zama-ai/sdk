import type { Address } from "viem";
import type { ZamaSDKEvent, ZamaSDKEventInput, ZamaSDKEventType } from "../events/sdk-events";

/** Listener narrowed to one event type. */
export type TypedListener<K extends ZamaSDKEventType> = (
  event: Extract<ZamaSDKEvent, { type: K }>,
) => void | Promise<void>;

/** Catch-all listener that receives the full event union. */
export type AnyListener = (event: ZamaSDKEvent) => void | Promise<void>;

export interface EventServiceConfig {
  /** Back-compat: catch-all listener wired through `onAny`. */
  onEvent?: AnyListener;
  /** Per-listener timeout for awaited `emit`. Default 5_000ms. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Multi-listener, type-narrowed, awaited event bus.
 *
 * `on(type, …)` registers per event type with a narrowed payload.
 * `onAny(…)` registers a catch-all listener (used by the back-compat
 * `createConfig({ onEvent })` path).
 *
 * `emit` is internal: it fans out to typed + catch-all listeners in parallel
 * via `Promise.all`, awaits async returns, swallows throws, and times each
 * listener out at `timeoutMs` (default 5000).
 */
export class EventService {
  readonly #typed = new Map<ZamaSDKEventType, Set<TypedListener<ZamaSDKEventType>>>();
  readonly #any = new Set<AnyListener>();
  readonly #timeoutMs: number;

  constructor(config: EventServiceConfig = {}) {
    this.#timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (config.onEvent) {
      this.#any.add(config.onEvent);
    }
  }

  /**
   * Subscribe to a single event type.
   *
   * @param type - Event type key (use `ZamaSDKEvents.*`).
   * @param listener - Receives the narrowed event payload.
   * @returns Unsubscribe function; calling it removes the listener.
   */
  on<K extends ZamaSDKEventType>(type: K, listener: TypedListener<K>): () => void {
    let set = this.#typed.get(type);
    if (!set) {
      set = new Set();
      this.#typed.set(type, set);
    }
    const cast = listener as unknown as TypedListener<ZamaSDKEventType>;
    set.add(cast);
    return () => {
      const current = this.#typed.get(type);
      if (current) {
        current.delete(cast);
        if (current.size === 0) {
          this.#typed.delete(type);
        }
      }
    };
  }

  /**
   * One-shot subscribe: auto-unsubscribes before invoking the listener for
   * the first matching event.
   *
   * @returns Unsubscribe function. No-op after auto-fire; useful if the caller
   *   needs to bail before the event ever arrives.
   */
  once<K extends ZamaSDKEventType>(type: K, listener: TypedListener<K>): () => void {
    let unsubscribe: () => void = () => {};
    const wrapper: TypedListener<K> = (event) => {
      unsubscribe();
      return listener(event);
    };
    unsubscribe = this.on(type, wrapper);
    return () => unsubscribe();
  }

  /**
   * Catch-all subscribe: receives every emitted event regardless of type.
   *
   * @returns Unsubscribe function.
   */
  onAny(listener: AnyListener): () => void {
    this.#any.add(listener);
    return () => {
      this.#any.delete(listener);
    };
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
    } as ZamaSDKEvent;

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

  async #run(tag: string, fn: () => void | Promise<void>): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve().then(fn),
        new Promise<void>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error(`listener exceeded ${this.#timeoutMs}ms`)),
            this.#timeoutMs,
          );
        }),
      ]);
    } catch (error) {
      // oxlint-disable-next-line no-console
      console.warn(`[zama-sdk] ${tag} listener failed:`, error);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}
