import type { Address } from "viem";
import type { ClearSigningEncryptedValue, ClearSigningIntent } from "../types";
import { clearSigningWording } from "../wording";
import {
  encryptedField,
  internalField,
  optionalContractContext,
  optionalFields,
  optionalRawContext,
  publicField,
  safeIntent,
} from "./helpers";

/** Parameters for building a confidential transfer clear-signing intent. */
export interface BuildConfidentialTransferIntentParams {
  /** Confidential token contract address. */
  tokenAddress: Address;
  /** Public recipient address. */
  recipientAddress: Address;
  /** Sender wallet address, when known. */
  senderAddress?: Address;
  /** Plaintext SDK input amount before encryption, when available. */
  amount?: bigint;
  /** Opaque encrypted amount handle submitted on-chain. */
  encryptedAmount?: ClearSigningEncryptedValue;
  /** Whether the contract call includes an input proof. */
  hasInputProof?: boolean;
  /** Chain ID associated with the transfer. */
  chainId?: number;
  /** Raw confidential transfer contract call config. */
  contractCall?: unknown;
}

/** Parameters for building an operator confidential transfer clear-signing intent. */
export interface BuildConfidentialTransferFromIntentParams extends Omit<
  BuildConfidentialTransferIntentParams,
  "senderAddress"
> {
  /** Wallet whose confidential balance is being transferred by the operator. */
  sourceAddress: Address;
  /** Operator wallet submitting the transferFrom transaction. */
  operatorAddress: Address;
}

/** Build a clear-signing intent for a confidential token transfer. */
export function buildConfidentialTransferIntent({
  tokenAddress,
  recipientAddress,
  senderAddress,
  amount,
  encryptedAmount,
  hasInputProof,
  chainId,
  contractCall,
}: BuildConfidentialTransferIntentParams): ClearSigningIntent {
  const labels = clearSigningWording.labels;
  return safeIntent({
    kind: "confidentialTransfer",
    title: clearSigningWording.confidentialTransfer.title,
    summary: clearSigningWording.confidentialTransfer.summary,
    fields: optionalFields([
      publicField(labels.confidentialToken, tokenAddress),
      senderAddress && publicField(labels.grantingWallet, senderAddress),
      publicField(labels.recipient, recipientAddress),
      amount !== undefined && publicField(labels.amount, amount),
      encryptedField(labels.encryptedAmount, encryptedAmount),
      hasInputProof &&
        internalField(labels.inputProof, clearSigningWording.values.protocolProofHidden),
    ]),
    contractContext: optionalContractContext({
      chainId,
      contractAddress: tokenAddress,
      functionName: "confidentialTransfer",
    }),
    rawContext: optionalRawContext({
      contractCall,
      sdkInput: amount === undefined ? undefined : { amount },
    }),
  });
}

/** Build a clear-signing intent for an operator confidential token transfer. */
export function buildConfidentialTransferFromIntent({
  tokenAddress,
  sourceAddress,
  operatorAddress,
  recipientAddress,
  amount,
  encryptedAmount,
  hasInputProof,
  chainId,
  contractCall,
}: BuildConfidentialTransferFromIntentParams): ClearSigningIntent {
  const labels = clearSigningWording.labels;
  return safeIntent({
    kind: "confidentialTransferFrom",
    title: clearSigningWording.confidentialTransferFrom.title,
    summary: clearSigningWording.confidentialTransferFrom.summary,
    fields: optionalFields([
      publicField(labels.confidentialToken, tokenAddress),
      publicField(labels.grantingWallet, sourceAddress),
      publicField(labels.operatorWallet, operatorAddress),
      publicField(labels.recipient, recipientAddress),
      amount !== undefined && publicField(labels.amount, amount),
      encryptedField(labels.encryptedAmount, encryptedAmount),
      hasInputProof &&
        internalField(labels.inputProof, clearSigningWording.values.protocolProofHidden),
    ]),
    contractContext: optionalContractContext({
      chainId,
      contractAddress: tokenAddress,
      functionName: "confidentialTransferFrom",
    }),
    rawContext: optionalRawContext({
      contractCall,
      sdkInput: amount === undefined ? undefined : { amount },
    }),
  });
}
