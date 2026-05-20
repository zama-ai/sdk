import type { ZamaSDKEvent, ZamaSDKEventType } from "../events/sdk-events";

/**
 * Type map for dispatching SDK events on `window` via `CustomEvent`.
 *
 * Compose into your own `WindowEventMap` augmentation in app code to enable
 * typed `window.addEventListener("transfer:submitted", …)`.
 *
 * @example
 * ```ts
 * import type { ZamaSDKWindowEventMap } from "@zama-fhe/sdk/web";
 * declare global {
 *   interface WindowEventMap extends ZamaSDKWindowEventMap {}
 * }
 * sdk.events.subscribe((event) => {
 *   window.dispatchEvent(new CustomEvent(event.type, { detail: event }));
 * });
 * window.addEventListener("transfer:submitted", (e) => {
 *   // e.detail is typed as TransferSubmittedEvent
 * });
 * ```
 *
 * **Caveat:** `window` listeners cannot gate the wallet prompt. `dispatchEvent`
 * is synchronous and ignores listener return values, so any "wait for user
 * confirmation" flow must subscribe via `sdk.events.on/once`, not
 * `window.addEventListener`.
 */
export type ZamaSDKWindowEventMap = {
  [K in ZamaSDKEventType]: CustomEvent<Extract<ZamaSDKEvent, { type: K }>>;
};
