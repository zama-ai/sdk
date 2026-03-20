/**
 * Pinned version of @zama-fhe/relayer-sdk used for the CDN URLs.
 * Must match the installed devDependency version.
 *
 * Update with: pnpm --filter @zama-fhe/sdk update-relayer-sdk-cdn-version
 */
export const RELAYER_SDK_VERSION = "0.4.2";

/**
 * Filename of the @zama-fhe/relayer-sdk UMD bundle on the CDN.
 */
export const RELAYER_SDK_UMD_FILENAME = "relayer-sdk-js.umd.cjs";

/**
 * CDN base URL for relayer-sdk assets.
 */
export const RELAYER_SDK_CDN_BASE =
  `https://cdn.zama.org/relayer-sdk-js/${RELAYER_SDK_VERSION}` as const;

/**
 * CDN URL for the relayer-sdk UMD bundle.
 */
export const RELAYER_SDK_CDN_URL = `${RELAYER_SDK_CDN_BASE}/${RELAYER_SDK_UMD_FILENAME}` as const;

/**
 * CDN URL for the worker IIFE bundle.
 */
export const RELAYER_SDK_WORKER_CDN_URL = `${RELAYER_SDK_CDN_BASE}/relayer-sdk.worker.js` as const;

/**
 * Expected SHA-384 hash (hex-encoded) of the @zama-fhe/relayer-sdk UMD bundle.
 * Verified at build time and at runtime (in the worker) to guard against
 * supply-chain tampering.
 *
 * Update with: pnpm --filter @zama-fhe/sdk update-relayer-sdk-cdn-version
 */
export const RELAYER_SDK_UMD_INTEGRITY =
  "114438b01d518b53a447fa3e8bfbe6e71031cb42ac43219bb9f53488456fdfa4bbc8989628366d436e68f6526c7647eb";
