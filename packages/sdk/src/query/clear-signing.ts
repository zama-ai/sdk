import type { Address } from "viem";
import type { ClearSigningIntent } from "../clear-signing";
import type { Handle } from "../relayer/relayer-sdk.types";
import type { Token } from "../token/token";
import type { WrappedToken } from "../token/wrapped-token";
import type { ShieldOptions } from "../types";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link allowClearSigningIntentMutationOptions}. */
export interface AllowClearSigningIntentParams {
  contracts: Address[];
}

/** Variables for {@link allowAsClearSigningIntentMutationOptions}. */
export interface AllowAsClearSigningIntentParams extends AllowClearSigningIntentParams {
  delegator: Address;
}

/** Variables for {@link delegateDecryptionClearSigningIntentMutationOptions}. */
export interface DelegateDecryptionClearSigningIntentParams {
  contractAddress: Address;
  delegateAddress: Address;
  expirationDate?: Date;
}

/** Variables for {@link confidentialTransferClearSigningIntentMutationOptions}. */
export interface ConfidentialTransferClearSigningIntentParams {
  to: Address;
  amount: bigint;
}

/** Variables for {@link shieldClearSigningIntentMutationOptions}. */
export interface ShieldClearSigningIntentParams extends ShieldOptions {
  amount: bigint;
}

/** Variables for {@link unwrapClearSigningIntentMutationOptions}. */
export interface UnwrapClearSigningIntentParams {
  amount: bigint;
}

/** Variables for {@link finalizeUnwrapClearSigningIntentMutationOptions}. */
export interface FinalizeUnwrapClearSigningIntentParams {
  unwrapRequestIdOrAmount: Handle;
  clearAmount?: bigint;
}

export function allowClearSigningIntentMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<
  readonly ["zama.clearSigningIntent.allow"],
  AllowClearSigningIntentParams,
  ClearSigningIntent
> {
  return {
    mutationKey: ["zama.clearSigningIntent.allow"] as const,
    mutationFn: async ({ contracts }) => sdk.createAllowClearSigningIntent(contracts),
  };
}

export function allowAsClearSigningIntentMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<
  readonly ["zama.clearSigningIntent.allowAs"],
  AllowAsClearSigningIntentParams,
  ClearSigningIntent
> {
  return {
    mutationKey: ["zama.clearSigningIntent.allowAs"] as const,
    mutationFn: async ({ delegator, contracts }) =>
      sdk.createAllowAsClearSigningIntent(delegator, contracts),
  };
}

export function delegateDecryptionClearSigningIntentMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<
  readonly ["zama.clearSigningIntent.delegateDecryption"],
  DelegateDecryptionClearSigningIntentParams,
  ClearSigningIntent
> {
  return {
    mutationKey: ["zama.clearSigningIntent.delegateDecryption"] as const,
    mutationFn: async (params) => sdk.createDelegateDecryptionClearSigningIntent(params),
  };
}

export function confidentialTransferClearSigningIntentMutationOptions(
  token: Token,
): MutationFactoryOptions<
  readonly ["zama.clearSigningIntent.confidentialTransfer", Address],
  ConfidentialTransferClearSigningIntentParams,
  ClearSigningIntent
> {
  return {
    mutationKey: ["zama.clearSigningIntent.confidentialTransfer", token.address] as const,
    mutationFn: async ({ to, amount }) =>
      token.createConfidentialTransferClearSigningIntent(to, amount),
  };
}

export function shieldClearSigningIntentMutationOptions(
  token: WrappedToken,
): MutationFactoryOptions<
  readonly ["zama.clearSigningIntent.shield", Address],
  ShieldClearSigningIntentParams,
  ClearSigningIntent
> {
  return {
    mutationKey: ["zama.clearSigningIntent.shield", token.address] as const,
    mutationFn: async ({ amount, ...options }) =>
      token.createShieldClearSigningIntent(amount, options),
  };
}

export function unwrapClearSigningIntentMutationOptions(
  token: WrappedToken,
): MutationFactoryOptions<
  readonly ["zama.clearSigningIntent.unwrap", Address],
  UnwrapClearSigningIntentParams,
  ClearSigningIntent
> {
  return {
    mutationKey: ["zama.clearSigningIntent.unwrap", token.address] as const,
    mutationFn: async ({ amount }) => token.createUnwrapClearSigningIntent(amount),
  };
}

export function unwrapAllClearSigningIntentMutationOptions(
  token: WrappedToken,
): MutationFactoryOptions<
  readonly ["zama.clearSigningIntent.unwrapAll", Address],
  void,
  ClearSigningIntent
> {
  return {
    mutationKey: ["zama.clearSigningIntent.unwrapAll", token.address] as const,
    mutationFn: async () => token.createUnwrapAllClearSigningIntent(),
  };
}

export function finalizeUnwrapClearSigningIntentMutationOptions(
  token: WrappedToken,
): MutationFactoryOptions<
  readonly ["zama.clearSigningIntent.finalizeUnwrap", Address],
  FinalizeUnwrapClearSigningIntentParams,
  ClearSigningIntent
> {
  return {
    mutationKey: ["zama.clearSigningIntent.finalizeUnwrap", token.address] as const,
    mutationFn: async ({ unwrapRequestIdOrAmount, clearAmount }) =>
      token.createFinalizeUnwrapClearSigningIntent(unwrapRequestIdOrAmount, clearAmount),
  };
}
