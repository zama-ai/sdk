/**
 * Filename of the @zama-fhe/relayer-sdk UMD bundle emitted alongside the worker.
 * Used by both the build plugin (to emit the asset) and the worker client
 * (to resolve the URL at runtime).
 */
export const RELAYER_SDK_UMD_FILENAME = "relayer-sdk-js.umd.cjs";

/**
 * Filename of the browser worker IIFE bundle emitted by the build.
 * Resolved at runtime by the worker client via `resolveAssetUrl`.
 */
export const RELAYER_SDK_WORKER_FILENAME = "relayer-sdk.worker.js";
