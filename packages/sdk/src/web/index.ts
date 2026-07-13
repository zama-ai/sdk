/**
 * Browser transport for `@zama-fhe/sdk` — provides the {@link web} factory
 * that drives `@fhevm/sdk` on the calling thread.
 *
 * Import from `@zama-fhe/sdk/web` to keep browser-only dependencies out of
 * Node.js entry points.
 *
 * @packageDocumentation
 */

export { web } from "../config/web";
export type { WebRelayerConfig, RelayerConfig } from "../config/types";

// SDK-209: re-export types already public at the main `@zama-fhe/sdk` entry point —
// referenced structurally by this entry point's own public signatures.
export type { FheChain, FheChainAuth } from "../chains/types";
export type { FhevmRelayerSDK } from "../relayer/types";
