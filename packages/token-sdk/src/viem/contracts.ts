import type { PublicClient, WalletClient } from "viem";
import type { Hex } from "../relayer/relayer-sdk.types";
import type { BatchTransferData } from "../contracts";
import {
  confidentialBalanceOfContract,
  confidentialBatchTransferContract,
  confidentialTransferContract,
  finalizeUnwrapContract,
  getWrapperContract,
  setOperatorContract,
  supportsInterfaceContract,
  underlyingContract,
  unwrapContract,
  unwrapFromBalanceContract,
  wrapContract,
  wrapETHContract,
  wrapperExistsContract,
} from "../contracts";

// ── Read helpers ────────────────────────────────────────────

export function readConfidentialBalanceOfContract(
  client: PublicClient,
  tokenAddress: Hex,
  userAddress: Hex,
) {
  return client.readContract(confidentialBalanceOfContract(tokenAddress, userAddress));
}

export function readWrapperForTokenContract(
  client: PublicClient,
  coordinator: Hex,
  tokenAddress: Hex,
) {
  return client.readContract(getWrapperContract(coordinator, tokenAddress));
}

export function readUnderlyingTokenContract(client: PublicClient, wrapperAddress: Hex) {
  return client.readContract(underlyingContract(wrapperAddress));
}

export function readWrapperExistsContract(
  client: PublicClient,
  coordinator: Hex,
  tokenAddress: Hex,
) {
  return client.readContract(wrapperExistsContract(coordinator, tokenAddress));
}

export function readSupportsInterfaceContract(
  client: PublicClient,
  tokenAddress: Hex,
  interfaceId: Hex,
) {
  return client.readContract(supportsInterfaceContract(tokenAddress, interfaceId));
}

// ── Write helpers ───────────────────────────────────────────

export function writeConfidentialTransferContract(
  client: WalletClient,
  tokenAddress: Hex,
  to: Hex,
  handle: Uint8Array,
  inputProof: Uint8Array,
) {
  return client.writeContract({
    chain: client.chain,
    account: client.account!,
    ...confidentialTransferContract(tokenAddress, to, handle, inputProof),
  });
}

export function writeConfidentialBatchTransferContract(
  client: WalletClient,
  batcherAddress: Hex,
  tokenAddress: Hex,
  fromAddress: Hex,
  batchTransferData: BatchTransferData[],
  fees: bigint,
) {
  return client.writeContract({
    chain: client.chain,
    account: client.account!,
    ...confidentialBatchTransferContract(
      batcherAddress,
      tokenAddress,
      fromAddress,
      batchTransferData,
      fees,
    ),
  });
}

export function writeUnwrapContract(
  client: WalletClient,
  encryptedErc20: Hex,
  from: Hex,
  to: Hex,
  encryptedAmount: Uint8Array,
  inputProof: Uint8Array,
) {
  return client.writeContract({
    chain: client.chain,
    account: client.account!,
    ...unwrapContract(encryptedErc20, from, to, encryptedAmount, inputProof),
  });
}

export function writeUnwrapFromBalanceContract(
  client: WalletClient,
  encryptedErc20: Hex,
  from: Hex,
  to: Hex,
  encryptedBalance: Hex,
) {
  return client.writeContract({
    chain: client.chain,
    account: client.account!,
    ...unwrapFromBalanceContract(encryptedErc20, from, to, encryptedBalance),
  });
}

export function writeFinalizeUnwrapContract(
  client: WalletClient,
  wrapper: Hex,
  burntAmount: Hex,
  burntAmountCleartext: bigint,
  decryptionProof: Hex,
) {
  return client.writeContract({
    chain: client.chain,
    account: client.account!,
    ...finalizeUnwrapContract(wrapper, burntAmount, burntAmountCleartext, decryptionProof),
  });
}

export function writeSetOperatorContract(
  client: WalletClient,
  tokenAddress: Hex,
  spender: Hex,
  timestamp?: number,
) {
  return client.writeContract({
    chain: client.chain,
    account: client.account!,
    ...setOperatorContract(tokenAddress, spender, timestamp),
  });
}

export function writeWrapContract(
  client: WalletClient,
  wrapperAddress: Hex,
  to: Hex,
  amount: bigint,
) {
  return client.writeContract({
    chain: client.chain,
    account: client.account!,
    ...wrapContract(wrapperAddress, to, amount),
  });
}

export function writeWrapETHContract(
  client: WalletClient,
  wrapperAddress: Hex,
  to: Hex,
  amount: bigint,
  value: bigint,
) {
  return client.writeContract({
    chain: client.chain,
    account: client.account!,
    ...wrapETHContract(wrapperAddress, to, amount, value),
  });
}
