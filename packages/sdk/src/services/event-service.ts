import type { Address } from "viem";
import type {
  ZamaSDKEvent,
  ZamaSDKEventInput,
  ZamaSDKEventListener,
  ZamaSDKEventType,
} from "../events/sdk-events";
import type { GenericLogger } from "../worker/worker.types";

/** A listener scoped to a single event type via {@link EventService.on}/{@link EventService.once}. */
export type TypedZamaSDKEventListener<K extends ZamaSDKEventType> = (
  event: Extract<ZamaSDKEvent, { type: K }>,
) => void;

export interface EventServiceConfig {
  /** Convenience sugar: registered as a catch-all listener at construction time. */
  onEvent?: ZamaSDKEventListener;
  logger: GenericLogger;
}

/**
 * Multi-listener, typed pub/sub for the unified SDK event stream, exposed as `sdk.events`.
 *
 * Subscribe to a single event type ({@link on}), a single occurrence ({@link once}),
 * or every event regardless of type ({@link subscribe}). Each returns an unsubscribe
 * function. A listener that throws is caught and logged — it can never break SDK
 * operations or the delivery of the same event to other listeners.
 */
export class EventService {
  readonly #typedListeners = new Map<ZamaSDKEventType, Set<ZamaSDKEventListener>>();
  readonly #catchAllListeners = new Set<ZamaSDKEventListener>();
  readonly #logger: GenericLogger;

  constructor(config: EventServiceConfig) {
    this.#logger = config.logger;
    if (config.onEvent) {
      this.subscribe(config.onEvent);
    }
  }

  /**
   * Subscribe to a single event type.
   * @returns An unsubscribe function; calling it removes the listener.
   */
  on<K extends ZamaSDKEventType>(type: K, listener: TypedZamaSDKEventListener<K>): () => void {
    const typedListener = listener as unknown as ZamaSDKEventListener;
    const listeners = this.#typedListeners.get(type) ?? new Set();
    listeners.add(typedListener);
    this.#typedListeners.set(type, listeners);
    return () => {
      listeners.delete(typedListener);
    };
  }

  /**
   * Subscribe to a single event type for one occurrence only, then auto-unsubscribe.
   * @returns An unsubscribe function; calling it before the event fires cancels delivery.
   */
  once<K extends ZamaSDKEventType>(type: K, listener: TypedZamaSDKEventListener<K>): () => void {
    const wrapped: TypedZamaSDKEventListener<K> = (event) => {
      unsubscribe();
      listener(event);
    };
    const unsubscribe = this.on(type, wrapped);
    return unsubscribe;
  }

  /**
   * Subscribe to every event, regardless of type. Backs the `onEvent` config
   * option's catch-all sugar.
   * @returns An unsubscribe function; calling it removes the listener.
   */
  subscribe(listener: ZamaSDKEventListener): () => void {
    this.#catchAllListeners.add(listener);
    return () => {
      this.#catchAllListeners.delete(listener);
    };
  }

  /**
   * Emit a structured SDK event to every matching listener.
   *
   * @internal
   */
  emit(input: ZamaSDKEventInput, tokenAddress?: Address): void {
    const event = { ...input, tokenAddress, timestamp: Date.now() } as ZamaSDKEvent;
    const listeners = [...(this.#typedListeners.get(event.type) ?? []), ...this.#catchAllListeners];
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        this.#logger.warn(`${event.type} event listener silently failed`, { error });
      }
    }
  }

  /**
   * Remove every listener. Called from {@link ZamaSDK.dispose} so listeners don't
   * leak across SDK instance recreation (e.g. a React provider rebuilding the SDK
   * when its config changes).
   */
  dispose(): void {
    this.#typedListeners.clear();
    this.#catchAllListeners.clear();
  }
}
