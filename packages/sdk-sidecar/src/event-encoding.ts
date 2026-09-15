import type { WalletAccount, WalletAccountChange, ZamaSDKEvent } from "@zama-fhe/sdk";
import type * as rpc from "./generated/zama/sdk/v1alpha1/sidecar.js";
import { bytes, entries } from "./encoding.js";
import { errorDetails } from "./errors.js";

export function sdkEvent(event: ZamaSDKEvent): rpc.SdkEvent {
  return {
    type: event.type,
    timestamp: event.timestamp,
    tokenAddress: event.tokenAddress === undefined ? undefined : bytes(event.tokenAddress),
    sdkOperationId: event.operationId,
    durationMs: "durationMs" in event ? event.durationMs : undefined,
    encryptedValues: "encryptedValues" in event ? event.encryptedValues.map(bytes) : [],
    result: "result" in event ? entries(event.result) : [],
    error: "error" in event ? errorDetails(event.error) : undefined,
    operation: "operation" in event ? event.operation : undefined,
    txHash: "txHash" in event ? bytes(event.txHash) : undefined,
    shieldPath: "shieldPath" in event ? event.shieldPath : undefined,
    step: "step" in event ? event.step : undefined,
  };
}

function account(value: WalletAccount | undefined): rpc.WalletAccount | undefined {
  return value === undefined
    ? undefined
    : { address: bytes(value.address), chainId: BigInt(value.chainId) };
}

export function walletChange(change: WalletAccountChange): rpc.WalletAccountChanged {
  return { previous: account(change.previous), next: account(change.next) };
}
