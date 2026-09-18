import type { Address } from "@zama-fhe/sdk";
import type * as rpc from "./generated/zama/sdk/v1alpha1/sidecar.js";
import type { ContextSdk } from "./runtime.js";
import { address, safeInteger, transactionResult } from "./encoding.js";
import { invalidArgument } from "./errors.js";

export interface DelegateDecryptionParams {
  contractAddress: Address;
  delegateAddress: Address;
  expirationDate?: Date;
}
export interface RevokeDelegationParams {
  contractAddress: Address;
  delegateAddress: Address;
}

export function delegateDecryptionParams(value: rpc.DelegateDecryption): DelegateDecryptionParams {
  return {
    contractAddress: address(value.contractAddress),
    delegateAddress: address(value.delegateAddress),
    // An omitted expiry requests a permanent delegation.
    ...(value.expirationDateMs === undefined
      ? {}
      : { expirationDate: expirationDate(value.expirationDateMs) }),
  };
}
function expirationDate(ms: bigint): Date {
  const date = new Date(safeInteger(ms, "Expiration date"));
  // A safe integer can still exceed the range a Date represents.
  if (Number.isNaN(date.getTime())) {
    throw invalidArgument("Expiration date is outside the representable range.");
  }
  return date;
}
export function revokeDelegationParams(value: rpc.RevokeDelegation): RevokeDelegationParams {
  return {
    contractAddress: address(value.contractAddress),
    delegateAddress: address(value.delegateAddress),
  };
}

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw invalidArgument("Delegation details are required.");
  }
  return value;
}
function query(request: rpc.DelegationQuery) {
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
  request: rpc.DelegationQuery,
): Promise<rpc.IsDelegationActiveResponse> {
  return { isActive: await sdk.delegations.isActive(query(request)) };
}
export async function getDelegationExpiry(
  sdk: ContextSdk,
  request: rpc.DelegationQuery,
): Promise<rpc.GetDelegationExpiryResponse> {
  return { expiryTimestamp: await sdk.delegations.getExpiry(query(request)) };
}
export async function getDelegationStatus(
  sdk: ContextSdk,
  request: rpc.DelegationQuery,
): Promise<rpc.GetDelegationStatusResponse> {
  const { isActive, expiryTimestamp } = await sdk.delegations.getStatus(query(request));
  return { isActive, expiryTimestamp };
}
