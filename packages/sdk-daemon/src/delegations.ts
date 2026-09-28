import type * as rpc from "./generated/zama/sdk/v1beta1/daemon.js";
import type { ContextSdk } from "./runtime.js";
import {
  address,
  delegateDecryptionParams,
  revokeDelegationParams,
  transactionResult,
} from "./encoding.js";
import { invalidArgument } from "./errors.js";

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw invalidArgument("Delegation details are required.");
  }
  return value;
}
function query(request: rpc.DelegationQueryRequest) {
  return {
    contractAddress: address(request.contractAddress),
    delegatorAddress: address(request.delegatorAddress),
    delegateAddress: address(request.delegateAddress),
  };
}

export async function delegateDecryption(
  sdk: ContextSdk,
  request: rpc.DelegateDecryptionRequest,
): Promise<rpc.DelegateDecryptionResponse> {
  const result = await sdk.delegations.delegateDecryption(
    delegateDecryptionParams(required(request.delegation)),
  );
  return { transaction: transactionResult(result) };
}
export async function revokeDelegation(
  sdk: ContextSdk,
  request: rpc.RevokeDelegationRequest,
): Promise<rpc.RevokeDelegationResponse> {
  const result = await sdk.delegations.revokeDelegation(
    revokeDelegationParams(required(request.delegation)),
  );
  return { transaction: transactionResult(result) };
}
export async function isDelegationActive(
  sdk: ContextSdk,
  request: rpc.DelegationQueryRequest,
): Promise<rpc.IsDelegationActiveResponse> {
  return { isActive: await sdk.delegations.isActive(query(request)) };
}
export async function getDelegationExpiry(
  sdk: ContextSdk,
  request: rpc.DelegationQueryRequest,
): Promise<rpc.GetDelegationExpiryResponse> {
  return { expiryTimestamp: await sdk.delegations.getExpiry(query(request)) };
}
export async function getDelegationStatus(
  sdk: ContextSdk,
  request: rpc.DelegationQueryRequest,
): Promise<rpc.GetDelegationStatusResponse> {
  const { isActive, expiryTimestamp } = await sdk.delegations.getStatus(query(request));
  return { isActive, expiryTimestamp };
}
