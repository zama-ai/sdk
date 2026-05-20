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

/** Parameters for building a finalize-unshield clear-signing intent. */
export interface BuildFinalizeUnwrapIntentParams {
  /** Confidential wrapper contract address. */
  wrapperAddress: Address;
  /** Pending unwrap request identifier from upgraded wrappers. */
  unwrapRequestId?: string;
  /** Legacy encrypted amount handle used by older wrappers. */
  legacyEncryptedAmount?: ClearSigningEncryptedValue;
  /** Public amount submitted during finalization, when known. */
  clearAmount?: bigint;
  /** Whether the contract call includes a public decryption proof. */
  hasDecryptionProof?: boolean;
  /** Chain ID associated with finalization. */
  chainId?: number;
  /** Raw finalizeUnwrap contract call config. */
  contractCall?: unknown;
}

/** Build a clear-signing intent for finalizing a pending unshield. */
export function buildFinalizeUnwrapIntent({
  wrapperAddress,
  unwrapRequestId,
  legacyEncryptedAmount,
  clearAmount,
  hasDecryptionProof,
  chainId,
  contractCall,
}: BuildFinalizeUnwrapIntentParams): ClearSigningIntent {
  const labels = clearSigningWording.labels;
  return safeIntent({
    kind: "finalizeUnwrap",
    title: clearSigningWording.finalizeUnwrap.title,
    summary: clearSigningWording.finalizeUnwrap.summary,
    fields: optionalFields([
      publicField(labels.confidentialWrapper, wrapperAddress),
      unwrapRequestId ? publicField(labels.pendingUnshieldRequest, unwrapRequestId) : undefined,
      legacyEncryptedAmount
        ? encryptedField(labels.encryptedAmount, legacyEncryptedAmount)
        : undefined,
      clearAmount !== undefined && publicField(labels.publicAmount, clearAmount),
      hasDecryptionProof &&
        internalField(labels.decryptionProof, clearSigningWording.values.protocolProofHidden),
    ]),
    contractContext: optionalContractContext({
      chainId,
      contractAddress: wrapperAddress,
      functionName: "finalizeUnwrap",
    }),
    rawContext: optionalRawContext({ contractCall }),
  });
}
