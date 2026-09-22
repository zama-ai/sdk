import type { WalletAccountListener } from "../types/signer";
import type { ZamaSDK } from "../zama-sdk";

/** Subscribe after the SDK's wallet cleanup, through the internal integration entry point. */
export function subscribeWalletAccountChanges(
  sdk: ZamaSDK,
  listener: WalletAccountListener,
): () => void {
  return sdk.onWalletAccountChange(listener);
}
