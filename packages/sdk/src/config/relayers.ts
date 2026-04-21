import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { ExtendedFhevmInstanceConfig } from "../relayer/relayer-utils";
import type { TransportConfig } from "./transports";

export type RelayerSDKFn = (
  chain: ExtendedFhevmInstanceConfig,
  transport: TransportConfig,
) => Promise<RelayerSDK>;

export const relayersMap = new Map<string, RelayerSDKFn>();

/** Register a transport handler. Called by transport factories on first use. */
export function registerRelayer(type: string, handler: RelayerSDKFn): void {
  relayersMap.set(type, handler);
}
