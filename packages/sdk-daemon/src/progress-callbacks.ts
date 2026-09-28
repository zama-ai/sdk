import type {
  ShieldCallbacks,
  TransferCallbacks,
  UnshieldCallbacks,
  WrapOptions,
} from "@zama-fhe/sdk";
import { bytes } from "./encoding.js";
import { ProgressKind } from "./generated/zama/sdk/v1beta1/daemon.js";
import type { RemoteEvents } from "./remote-events.js";

type ProgressCallbacks = TransferCallbacks &
  ShieldCallbacks &
  UnshieldCallbacks &
  Pick<WrapOptions, "onWrapSubmitted">;

export function progressCallbacks(events: RemoteEvents): Required<ProgressCallbacks> {
  const notify = (kind: ProgressKind, txHash?: `0x${string}`): void =>
    events.notify({
      $case: "progress",
      progress: { kind, txHash: txHash === undefined ? undefined : bytes(txHash) },
    });
  return {
    onEncryptComplete: () => notify(ProgressKind.PROGRESS_KIND_ENCRYPT_COMPLETE),
    onTransferSubmitted: (hash) => notify(ProgressKind.PROGRESS_KIND_TRANSFER_SUBMITTED, hash),
    onApprovalSubmitted: (hash) => notify(ProgressKind.PROGRESS_KIND_APPROVAL_SUBMITTED, hash),
    onShieldSubmitted: (hash) => notify(ProgressKind.PROGRESS_KIND_SHIELD_SUBMITTED, hash),
    onWrapSubmitted: (hash) => notify(ProgressKind.PROGRESS_KIND_WRAP_SUBMITTED, hash),
    onUnwrapSubmitted: (hash) => notify(ProgressKind.PROGRESS_KIND_UNWRAP_SUBMITTED, hash),
    onFinalizing: () => notify(ProgressKind.PROGRESS_KIND_FINALIZING),
    onFinalizeSubmitted: (hash) => notify(ProgressKind.PROGRESS_KIND_FINALIZE_SUBMITTED, hash),
  };
}
