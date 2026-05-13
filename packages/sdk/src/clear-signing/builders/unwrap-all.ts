import type { Address } from "viem";
import type { ClearSigningEncryptedValue, ClearSigningIntent } from "../types";
import { clearSigningWording } from "../wording";
import {
  derivedField,
  encryptedField,
  optionalContractContext,
  optionalFields,
  optionalRawContext,
  publicField,
} from "./helpers";

/** Parameters for building a first-phase entire-balance unshield intent. */
export interface BuildUnwrapAllIntentParams {
  /** Confidential wrapper contract address. */
  wrapperAddress: Address;
  /** Wallet whose entire confidential balance is being unshielded. */
  fromAddress: Address;
  /** Public token recipient after finalization. */
  recipientAddress: Address;
  /** Existing encrypted balance handle used for unwrap-all. */
  encryptedBalance?: ClearSigningEncryptedValue;
  /** Chain ID associated with the unwrap-all request. */
  chainId?: number;
  /** Raw unwrap contract call config. */
  contractCall?: unknown;
}

/** Build a clear-signing intent for the first phase of an entire-balance unshield. */
export function buildUnwrapAllIntent({
  wrapperAddress,
  fromAddress,
  recipientAddress,
  encryptedBalance,
  chainId,
  contractCall,
}: BuildUnwrapAllIntentParams): ClearSigningIntent {
  const labels = clearSigningWording.labels;
  return {
    kind: "unwrapAll",
    title: clearSigningWording.unwrapAll.title,
    summary: clearSigningWording.unwrapAll.summary,
    fields: optionalFields([
      publicField(labels.confidentialWrapper, wrapperAddress),
      publicField(labels.grantingWallet, fromAddress),
      publicField(labels.publicTokenRecipient, recipientAddress),
      derivedField(labels.amount, clearSigningWording.values.entireConfidentialBalance),
      encryptedField(labels.encryptedBalance, {
        ...encryptedBalance,
        displayValue:
          encryptedBalance?.displayValue ?? clearSigningWording.values.hiddenEncryptedBalance,
      }),
    ]),
    warnings: [clearSigningWording.unwrapAll.warnings.finalizeRequired],
    contractContext: optionalContractContext({
      chainId,
      contractAddress: wrapperAddress,
      functionName: "unwrap",
    }),
    rawContext: optionalRawContext({ contractCall }),
  };
}
