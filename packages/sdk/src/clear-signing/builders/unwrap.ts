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

/** Parameters for building a first-phase specific-amount unshield intent. */
export interface BuildUnwrapIntentParams {
  /** Confidential wrapper contract address. */
  wrapperAddress: Address;
  /** Wallet whose confidential balance is being unshielded. */
  fromAddress: Address;
  /** Public token recipient after finalization. */
  recipientAddress: Address;
  /** Plaintext SDK input amount before encryption, when available. */
  amount?: bigint;
  /** Opaque encrypted amount handle submitted on-chain. */
  encryptedAmount?: ClearSigningEncryptedValue;
  /** Whether the contract call includes an input proof. */
  hasInputProof?: boolean;
  /** Chain ID associated with the unwrap request. */
  chainId?: number;
  /** Raw unwrap contract call config. */
  contractCall?: unknown;
}

/** Build a clear-signing intent for the first phase of a specific-amount unshield. */
export function buildUnwrapIntent({
  wrapperAddress,
  fromAddress,
  recipientAddress,
  amount,
  encryptedAmount,
  hasInputProof,
  chainId,
  contractCall,
}: BuildUnwrapIntentParams): ClearSigningIntent {
  const labels = clearSigningWording.labels;
  return safeIntent({
    kind: "unwrap",
    title: clearSigningWording.unwrap.title,
    summary: clearSigningWording.unwrap.summary,
    fields: optionalFields([
      publicField(labels.confidentialWrapper, wrapperAddress),
      publicField(labels.grantingWallet, fromAddress),
      publicField(labels.publicTokenRecipient, recipientAddress),
      amount !== undefined && publicField(labels.amount, amount),
      encryptedField(labels.encryptedAmount, encryptedAmount),
      hasInputProof &&
        internalField(labels.inputProof, clearSigningWording.values.protocolProofHidden),
    ]),
    contractContext: optionalContractContext({
      chainId,
      contractAddress: wrapperAddress,
      functionName: "unwrap",
    }),
    rawContext: optionalRawContext({
      contractCall,
      sdkInput: amount === undefined ? undefined : { amount },
    }),
  });
}
