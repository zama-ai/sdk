"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { Address, ClearSigningIntent } from "@zama-fhe/sdk";
import {
  allowAsClearSigningIntentMutationOptions,
  allowClearSigningIntentMutationOptions,
  confidentialTransferClearSigningIntentMutationOptions,
  delegateDecryptionClearSigningIntentMutationOptions,
  finalizeUnwrapClearSigningIntentMutationOptions,
  shieldClearSigningIntentMutationOptions,
  unwrapAllClearSigningIntentMutationOptions,
  unwrapClearSigningIntentMutationOptions,
  type AllowAsClearSigningIntentParams,
  type AllowClearSigningIntentParams,
  type ConfidentialTransferClearSigningIntentParams,
  type DelegateDecryptionClearSigningIntentParams,
  type FinalizeUnwrapClearSigningIntentParams,
  type ShieldClearSigningIntentParams,
  type UnwrapClearSigningIntentParams,
} from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useToken } from "../token/use-token";
import { useWrappedToken } from "../token/use-wrapped-token";

/** Configuration for token-scoped clear-signing intent hooks. */
export interface UseTokenClearSigningIntentConfig {
  /** Address of the confidential token or wrapper contract. */
  address: Address;
}

/** Generate clear-signing intents for direct decrypt authorization. */
export function useAllowClearSigningIntent<TContext = unknown>(
  options?: UseMutationOptions<ClearSigningIntent, Error, AllowClearSigningIntentParams, TContext>,
): UseMutationResult<ClearSigningIntent, Error, AllowClearSigningIntentParams, TContext> {
  const sdk = useZamaSDK();
  return useMutation({ ...allowClearSigningIntentMutationOptions(sdk), ...options });
}

/** Generate clear-signing intents for delegated decrypt credential authorization. */
export function useAllowAsClearSigningIntent<TContext = unknown>(
  options?: UseMutationOptions<
    ClearSigningIntent,
    Error,
    AllowAsClearSigningIntentParams,
    TContext
  >,
): UseMutationResult<ClearSigningIntent, Error, AllowAsClearSigningIntentParams, TContext> {
  const sdk = useZamaSDK();
  return useMutation({ ...allowAsClearSigningIntentMutationOptions(sdk), ...options });
}

/** Generate clear-signing intents for granting delegated decryption rights. */
export function useDelegateDecryptionClearSigningIntent<TContext = unknown>(
  options?: UseMutationOptions<
    ClearSigningIntent,
    Error,
    DelegateDecryptionClearSigningIntentParams,
    TContext
  >,
): UseMutationResult<
  ClearSigningIntent,
  Error,
  DelegateDecryptionClearSigningIntentParams,
  TContext
> {
  const sdk = useZamaSDK();
  return useMutation({ ...delegateDecryptionClearSigningIntentMutationOptions(sdk), ...options });
}

/** Generate clear-signing intents for confidential transfers. */
export function useConfidentialTransferClearSigningIntent<TContext = unknown>(
  config: UseTokenClearSigningIntentConfig,
  options?: UseMutationOptions<
    ClearSigningIntent,
    Error,
    ConfidentialTransferClearSigningIntentParams,
    TContext
  >,
): UseMutationResult<
  ClearSigningIntent,
  Error,
  ConfidentialTransferClearSigningIntentParams,
  TContext
> {
  const token = useToken(config.address);
  return useMutation({
    ...confidentialTransferClearSigningIntentMutationOptions(token),
    ...options,
  });
}

/** Generate clear-signing intents for shielding public ERC-20 into confidential tokens. */
export function useShieldClearSigningIntent<TContext = unknown>(
  config: UseTokenClearSigningIntentConfig,
  options?: UseMutationOptions<ClearSigningIntent, Error, ShieldClearSigningIntentParams, TContext>,
): UseMutationResult<ClearSigningIntent, Error, ShieldClearSigningIntentParams, TContext> {
  const token = useWrappedToken(config.address);
  return useMutation({ ...shieldClearSigningIntentMutationOptions(token), ...options });
}

/** Generate clear-signing intents for the first phase of a specific-amount unshield. */
export function useUnwrapClearSigningIntent<TContext = unknown>(
  config: UseTokenClearSigningIntentConfig,
  options?: UseMutationOptions<ClearSigningIntent, Error, UnwrapClearSigningIntentParams, TContext>,
): UseMutationResult<ClearSigningIntent, Error, UnwrapClearSigningIntentParams, TContext> {
  const token = useWrappedToken(config.address);
  return useMutation({ ...unwrapClearSigningIntentMutationOptions(token), ...options });
}

/** Generate clear-signing intents for unshielding the whole confidential balance. */
export function useUnwrapAllClearSigningIntent<TContext = unknown>(
  config: UseTokenClearSigningIntentConfig,
  options?: UseMutationOptions<ClearSigningIntent, Error, void, TContext>,
): UseMutationResult<ClearSigningIntent, Error, void, TContext> {
  const token = useWrappedToken(config.address);
  return useMutation({ ...unwrapAllClearSigningIntentMutationOptions(token), ...options });
}

/** Generate clear-signing intents for finalizing a pending unshield. */
export function useFinalizeUnwrapClearSigningIntent<TContext = unknown>(
  config: UseTokenClearSigningIntentConfig,
  options?: UseMutationOptions<
    ClearSigningIntent,
    Error,
    FinalizeUnwrapClearSigningIntentParams,
    TContext
  >,
): UseMutationResult<ClearSigningIntent, Error, FinalizeUnwrapClearSigningIntentParams, TContext> {
  const token = useWrappedToken(config.address);
  return useMutation({ ...finalizeUnwrapClearSigningIntentMutationOptions(token), ...options });
}
