import type { Address } from "viem";
import type { ClearSigningIntent } from "../types";
import { clearSigningWording } from "../wording";
import {
  optionalContractContext,
  optionalFields,
  optionalRawContext,
  publicField,
  safeIntent,
} from "./helpers";

/** Common parameters for shield clear-signing intents. */
export interface BuildShieldIntentBaseParams {
  /** Public ERC-20 token being shielded. */
  underlyingTokenAddress: Address;
  /** Confidential wrapper contract receiving or wrapping the public tokens. */
  wrapperAddress: Address;
  /** Public ERC-20 amount being shielded. */
  amount: bigint;
  /** Recipient of the resulting confidential balance. */
  recipientAddress: Address;
  /** Wallet sending the public ERC-20 tokens, when known. */
  senderAddress?: Address;
  /** Chain ID associated with the shield transaction. */
  chainId?: number;
}

/** Parameters for building a single-transaction ERC-1363 shield intent. */
export interface BuildShieldViaTransferAndCallIntentParams extends BuildShieldIntentBaseParams {
  /** Raw ERC-1363 transferAndCall contract call config. */
  contractCall?: unknown;
}

/** Parameters for building an approval-backed wrap shield intent. */
export interface BuildShieldViaWrapIntentParams extends BuildShieldIntentBaseParams {
  /** ERC-20 approval amount submitted before wrapping, when applicable. */
  approvalAmount?: bigint;
  /** Whether the approval amount is a max approval. */
  maxApproval?: boolean;
  /** Raw ERC-20 approval contract call config. */
  approvalContractCall?: unknown;
  /** Raw ERC-20 approval reset-to-zero contract call config, when needed. */
  approvalResetContractCall?: unknown;
  /** Raw wrapper wrap contract call config. */
  wrapContractCall?: unknown;
}

/** Build a clear-signing intent for single-transaction ERC-1363 shield. */
export function buildShieldViaTransferAndCallIntent({
  underlyingTokenAddress,
  wrapperAddress,
  amount,
  recipientAddress,
  senderAddress,
  chainId,
  contractCall,
}: BuildShieldViaTransferAndCallIntentParams): ClearSigningIntent {
  return buildShieldIntent({
    underlyingTokenAddress,
    wrapperAddress,
    amount,
    recipientAddress,
    senderAddress,
    chainId,
    rawContext: optionalRawContext({ contractCall }),
  });
}

/** Build a clear-signing intent for approval-backed wrap shield. */
export function buildShieldViaWrapIntent({
  underlyingTokenAddress,
  wrapperAddress,
  amount,
  recipientAddress,
  senderAddress,
  approvalAmount,
  maxApproval: _maxApproval,
  chainId,
  approvalContractCall,
  approvalResetContractCall,
  wrapContractCall,
}: BuildShieldViaWrapIntentParams): ClearSigningIntent {
  const labels = clearSigningWording.labels;

  return buildShieldIntent({
    underlyingTokenAddress,
    wrapperAddress,
    amount,
    recipientAddress,
    senderAddress,
    chainId,
    extraFields: optionalFields([
      approvalAmount !== undefined && publicField(labels.approvalAmount, approvalAmount),
    ]),
    rawContext: optionalRawContext({
      contractCalls: [approvalResetContractCall, approvalContractCall, wrapContractCall].filter(
        Boolean,
      ),
    }),
  });
}

function buildShieldIntent({
  underlyingTokenAddress,
  wrapperAddress,
  amount,
  recipientAddress,
  senderAddress,
  chainId,
  extraFields,
  rawContext,
}: BuildShieldIntentBaseParams & {
  extraFields?: ReturnType<typeof optionalFields>;
  rawContext: ClearSigningIntent["rawContext"];
}): ClearSigningIntent {
  const labels = clearSigningWording.labels;
  return safeIntent({
    kind: "shield",
    title: clearSigningWording.shield.title,
    summary: clearSigningWording.shield.summary,
    fields: optionalFields([
      publicField(labels.publicToken, underlyingTokenAddress),
      publicField(labels.confidentialWrapper, wrapperAddress),
      senderAddress && publicField(labels.grantingWallet, senderAddress),
      publicField(labels.publicAmount, amount),
      publicField(labels.recipient, recipientAddress),
      ...(extraFields ?? []),
    ]),
    contractContext: optionalContractContext({ chainId, contractAddress: wrapperAddress }),
    rawContext,
  });
}
