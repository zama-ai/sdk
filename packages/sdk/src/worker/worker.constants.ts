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

/**
 * Expected SHA-384 hash (hex-encoded) of the @zama-fhe/relayer-sdk UMD bundle.
 * Verified at build time by the relayer-sdk-umd-plugin to guard against
 * supply-chain tampering (compromised registry, malicious postinstall, etc.).
 *
 * Update with: pnpm --filter @zama-fhe/sdk update-relayer-sdk-umd-hash
 */
export const RELAYER_SDK_UMD_INTEGRITY =
  "758105a42afca35ef1a0607fc2b61d1401acb1ab0e59440854089e5504f2209f277c2c886bb680260a46363d66a403b2";
