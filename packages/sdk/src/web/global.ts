/**
 * Side-effect module: augments the ambient `WindowEventMap` so SDK event
 * types narrow on `window.addEventListener("transfer:submitted", …)` after a
 * single `import "@zama-fhe/sdk/web/global"`.
 *
 * For apps that prefer no implicit augmentation, import the bare type
 * (`ZamaSDKWindowEventMap`) from `@zama-fhe/sdk/web` and merge it locally.
 */
import type { ZamaSDKWindowEventMap } from "./events";

declare global {
  interface WindowEventMap extends ZamaSDKWindowEventMap {}
}

/**
 * Sentinel export so the bundled module ships a runtime export in both ESM and
 * CJS. The augmentation itself is type-only; this constant gives bundlers (and
 * CJS smoke tests) a non-empty module after compilation.
 */
export const ZAMA_SDK_WEB_GLOBAL_LOADED = true;
