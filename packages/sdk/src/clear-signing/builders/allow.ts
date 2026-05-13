import type { Address } from "viem";
import type {
  KmsDelegatedUserDecryptEIP712Type,
  KmsUserDecryptEIP712Type,
} from "@zama-fhe/relayer-sdk/bundle";
import type { ClearSigningIntent } from "../types";
import { clearSigningWording } from "../wording";
import {
  dateDisplay,
  internalField,
  optionalContractContext,
  optionalFields,
  optionalRawContext,
  publicField,
} from "./helpers";

/** Parameters for building a direct decrypt authorization clear-signing intent. */
export interface BuildAllowIntentParams {
  /** Confidential contract addresses covered by the decrypt permit. */
  contractAddresses: readonly Address[];
  /** Permit start timestamp in seconds. */
  startTimestamp?: number | bigint;
  /** Permit duration in days. */
  durationDays?: number | bigint;
  /** Chain ID associated with the EIP-712 authorization. */
  chainId?: number;
  /** EIP-712 verifying contract, when available. */
  verifyingContract?: Address;
  /** Raw EIP-712 typed data payload. */
  typedData?: unknown;
}

/** Parameters for building a delegated decrypt credential clear-signing intent. */
export interface BuildAllowAsIntentParams extends BuildAllowIntentParams {
  /** Wallet whose confidential values may be decrypted through an existing delegation. */
  delegatorAddress: Address;
}

/** Build a clear-signing intent for direct decrypt authorization. */
export function buildAllowIntent({
  contractAddresses,
  startTimestamp,
  durationDays,
  chainId,
  verifyingContract,
  typedData,
}: BuildAllowIntentParams): ClearSigningIntent {
  const labels = clearSigningWording.labels;
  return {
    kind: "allow",
    title: clearSigningWording.allow.title,
    summary: clearSigningWording.allow.summary,
    fields: optionalFields([
      publicField(labels.authorizedContracts, [...contractAddresses]),
      startTimestamp !== undefined &&
        publicField(labels.startsAt, String(startTimestamp), dateDisplay(startTimestamp)),
      durationDays !== undefined && publicField(labels.duration, String(durationDays)),
      internalField(labels.fhePublicKey),
      internalField(labels.protocolExtraData),
    ]),
    warnings: [clearSigningWording.allow.warnings.noSpending],
    contractContext: optionalContractContext({ chainId, contractAddress: verifyingContract }),
    rawContext: optionalRawContext({ typedData }),
  };
}

/** Build a clear-signing intent for delegated decrypt credential authorization. */
export function buildAllowAsIntent({
  contractAddresses,
  delegatorAddress,
  startTimestamp,
  durationDays,
  chainId,
  verifyingContract,
  typedData,
}: BuildAllowAsIntentParams): ClearSigningIntent {
  const labels = clearSigningWording.labels;
  return {
    kind: "allowAs",
    title: clearSigningWording.allowAs.title,
    summary: clearSigningWording.allowAs.summary,
    fields: optionalFields([
      publicField(labels.authorizedContracts, [...contractAddresses]),
      publicField(labels.delegatorWallet, delegatorAddress),
      startTimestamp !== undefined &&
        publicField(labels.startsAt, String(startTimestamp), dateDisplay(startTimestamp)),
      durationDays !== undefined && publicField(labels.duration, String(durationDays)),
      internalField(labels.fhePublicKey),
      internalField(labels.protocolExtraData),
    ]),
    warnings: [clearSigningWording.allowAs.warnings.noSpending],
    contractContext: optionalContractContext({ chainId, contractAddress: verifyingContract }),
    rawContext: optionalRawContext({ typedData }),
  };
}

/** Build a direct decrypt authorization intent from the SDK's EIP-712 payload. */
export function buildAllowIntentFromEIP712(
  typedData: KmsUserDecryptEIP712Type,
): ClearSigningIntent {
  return buildAllowIntent({
    contractAddresses: typedData.message.contractAddresses,
    startTimestamp: BigInt(typedData.message.startTimestamp),
    durationDays: BigInt(typedData.message.durationDays),
    chainId: Number(typedData.domain.chainId),
    verifyingContract: typedData.domain.verifyingContract,
    typedData,
  });
}

/** Build a delegated decrypt credential intent from the SDK's EIP-712 payload. */
export function buildAllowAsIntentFromEIP712(
  typedData: KmsDelegatedUserDecryptEIP712Type,
): ClearSigningIntent {
  return buildAllowAsIntent({
    contractAddresses: typedData.message.contractAddresses,
    delegatorAddress: typedData.message.delegatorAddress,
    startTimestamp: BigInt(typedData.message.startTimestamp),
    durationDays: BigInt(typedData.message.durationDays),
    chainId: Number(typedData.domain.chainId),
    verifyingContract: typedData.domain.verifyingContract,
    typedData,
  });
}
