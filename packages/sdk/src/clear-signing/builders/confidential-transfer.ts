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
  return {
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
  };
}
