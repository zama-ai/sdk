import type { Address } from "viem";
import type { ClearSigningIntent } from "../types";
import { clearSigningWording } from "../wording";
import {
  derivedField,
  optionalContractContext,
  optionalFields,
  optionalRawContext,
  publicField,
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
  /** Recipient encoded in ERC-1363 data, when distinct or explicitly known. */
  transferAndCallDataRecipient?: Address;
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
  transferAndCallDataRecipient,
  chainId,
  contractCall,
}: BuildShieldViaTransferAndCallIntentParams): ClearSigningIntent {
  const labels = clearSigningWording.labels;
  return buildShieldIntent({
    underlyingTokenAddress,
    wrapperAddress,
    amount,
    recipientAddress,
    senderAddress,
    chainId,
    route: clearSigningWording.shield.routes.transferAndCall,
    extraFields:
      transferAndCallDataRecipient && transferAndCallDataRecipient !== recipientAddress
        ? [derivedField(labels.encodedRecipient, transferAndCallDataRecipient)]
        : [],
    rawContext: optionalRawContext({ contractCall, route: "transferAndCall" }),
    warnings: [clearSigningWording.shield.warnings.balanceBecomesConfidential],
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
  maxApproval,
  chainId,
  approvalContractCall,
  wrapContractCall,
}: BuildShieldViaWrapIntentParams): ClearSigningIntent {
  const warnings: string[] = [
    clearSigningWording.shield.warnings.balanceBecomesConfidential,
    clearSigningWording.shield.warnings.approvalMayBeRequired,
  ];
  if (maxApproval === true) {
    warnings.push(clearSigningWording.shield.warnings.maxApproval);
  }
  const labels = clearSigningWording.labels;

  return buildShieldIntent({
    underlyingTokenAddress,
    wrapperAddress,
    amount,
    recipientAddress,
    senderAddress,
    chainId,
    route: clearSigningWording.shield.routes.approveAndWrap,
    extraFields: optionalFields([
      approvalAmount !== undefined && publicField(labels.approvalAmount, approvalAmount),
    ]),
    rawContext: optionalRawContext({
      contractCalls: [approvalContractCall, wrapContractCall].filter(Boolean),
      route: "approveAndWrap",
    }),
    warnings,
  });
}

function buildShieldIntent({
  underlyingTokenAddress,
  wrapperAddress,
  amount,
  recipientAddress,
  senderAddress,
  chainId,
  route,
  extraFields,
  rawContext,
  warnings,
}: BuildShieldIntentBaseParams & {
  route: string;
  extraFields: ReturnType<typeof optionalFields>;
  rawContext: ClearSigningIntent["rawContext"];
  warnings: string[];
}): ClearSigningIntent {
  const labels = clearSigningWording.labels;
  return {
    kind: "shield",
    title: clearSigningWording.shield.title,
    summary: clearSigningWording.shield.summary,
    fields: optionalFields([
      publicField(labels.publicToken, underlyingTokenAddress),
      publicField(labels.confidentialWrapper, wrapperAddress),
      senderAddress && publicField(labels.grantingWallet, senderAddress),
      publicField(labels.publicAmount, amount),
      publicField(labels.recipient, recipientAddress),
      derivedField(labels.shieldRoute, route),
      ...extraFields,
    ]),
    warnings,
    contractContext: optionalContractContext({ chainId, contractAddress: wrapperAddress }),
    rawContext,
  };
}
