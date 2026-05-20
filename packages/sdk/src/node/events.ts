import type { ZamaSDKEvent, ZamaSDKEventType } from "../events/sdk-events";

/**
 * Type map for re-emitting SDK events through a Node `EventEmitter<EventMap>`
 * (Node 18+). Tuple-args shape per `node:events` conventions.
 *
 * @example
 * ```ts
 * import type { ZamaSDKNodeEventMap } from "@zama-fhe/sdk/node";
 * import { EventEmitter } from "node:events";
 *
 * const emitter = new EventEmitter<ZamaSDKNodeEventMap>();
 * sdk.events.onAny((event) => emitter.emit(event.type, event));
 * emitter.on("transfer:submitted", (event) => {
 *   // event is typed as TransferSubmittedEvent
 * });
 * ```
 */
export type ZamaSDKNodeEventMap = {
  [K in ZamaSDKEventType]: [Extract<ZamaSDKEvent, { type: K }>];
};
