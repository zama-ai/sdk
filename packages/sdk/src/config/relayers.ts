import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { CleartextConfig } from "../relayer/cleartext/types";
import type { ExtendedFhevmInstanceConfig } from "../relayer/relayer-utils";
import { assertCondition } from "../utils";
import type { TransportConfig } from "./transports";

export type RelayerSDKFn = (
  chain: ExtendedFhevmInstanceConfig,
  transport: TransportConfig,
) => Promise<RelayerSDK>;

export const relayersMap = new Map<string, RelayerSDKFn>();

/** Register a transport handler. Called by sub-path modules (e.g. `@zama-fhe/sdk/node`). */
export function registerRelayer(type: string, handler: RelayerSDKFn): void {
  relayersMap.set(type, handler);
}

// Built-in handlers (browser-safe — no node:worker_threads references)
// Built-in handlers (browser-safe — no node:worker_threads references).
registerRelayer("web", async (chain, transport) => {
  assertCondition(transport.type === "web", "Transport config must be of type `web`");
  const merged = { ...chain, ...transport.chain };
  const m = await import("../relayer/relayer-web");
  return new m.RelayerWeb({ chain: merged, ...transport.relayer });
});

registerRelayer("cleartext", async (chain, transport) => {
  assertCondition(transport.type === "cleartext", "Transport config must be of type `cleartext`");
  const merged = { ...chain, ...transport.chain } as CleartextConfig;
  const m = await import("../relayer/cleartext/relayer-cleartext");
  return new m.RelayerCleartext(merged);
});
