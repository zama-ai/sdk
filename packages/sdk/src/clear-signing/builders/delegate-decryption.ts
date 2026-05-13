import type { Address } from "viem";
import type { ClearSigningIntent } from "../types";
import { clearSigningWording } from "../wording";
import {
  dateDisplay,
  optionalContractContext,
  optionalFields,
  optionalRawContext,
  publicField,
} from "./helpers";

/** Parameters for building a decryption delegation clear-signing intent. */
export interface BuildDelegateDecryptionIntentParams {
  /** Confidential contract whose values may be decrypted by the delegate. */
  contractAddress: Address;
  /** Wallet receiving decryption rights. */
  delegateAddress: Address;
  /** Wallet granting decryption rights. */
  delegatorAddress?: Address;
  /** ACL contract that receives the delegation transaction. */
  aclAddress?: Address;
  /** Expiration timestamp in seconds, when the delegation is time-limited. */
  expirationTimestamp?: number | bigint;
  /** Whether the delegation remains active until revoked. */
  permanent?: boolean;
  /** Chain ID associated with the delegation transaction. */
  chainId?: number;
  /** Raw ACL contract call config. */
  contractCall?: unknown;
}

/** Build a clear-signing intent for decryption delegation. */
export function buildDelegateDecryptionIntent({
  contractAddress,
  delegateAddress,
  delegatorAddress,
  aclAddress,
  expirationTimestamp,
  permanent,
  chainId,
  contractCall,
}: BuildDelegateDecryptionIntentParams): ClearSigningIntent {
  const labels = clearSigningWording.labels;
  const expirationValue =
    permanent === true
      ? clearSigningWording.values.untilRevoked
      : expirationTimestamp === undefined
        ? undefined
        : dateDisplay(expirationTimestamp);

  return {
    kind: "delegateDecryption",
    title: clearSigningWording.delegateDecryption.title,
    summary: clearSigningWording.delegateDecryption.summary,
    fields: optionalFields([
      publicField(labels.confidentialContract, contractAddress),
      publicField(labels.walletAllowedToView, delegateAddress),
      delegatorAddress ? publicField(labels.grantingWallet, delegatorAddress) : undefined,
      aclAddress ? publicField(labels.aclContract, aclAddress) : undefined,
      expirationValue ? publicField(labels.accessExpires, expirationValue) : undefined,
    ]),
    warnings: [clearSigningWording.delegateDecryption.warnings.noSpending],
    contractContext: optionalContractContext({
      chainId,
      contractAddress: aclAddress,
      functionName: "delegateForUserDecryption",
    }),
    rawContext: optionalRawContext({ contractCall }),
  };
}
