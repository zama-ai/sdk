import type { PublicClient, WalletClient } from "viem";
import type { Address, Handle, Hex } from "../relayer/relayer-sdk.types";
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

// ── Helpers ────────────────────────────────────────────────

function requireAccount(client: WalletClient) {
  if (!client.account) {
    throw new TypeError("WalletClient has no account");
  }
  return client.account;
}

// ── Read helpers ────────────────────────────────────────────

export function readConfidentialBalanceOfContract(
  client: PublicClient,
  tokenAddress: Address,
  userAddress: Address,
) {
  return client.readContract(confidentialBalanceOfContract(tokenAddress, userAddress));
}

export function readWrapperForTokenContract(
  client: PublicClient,
  coordinator: Address,
  tokenAddress: Address,
) {
  return client.readContract(getWrapperContract(coordinator, tokenAddress));
}

export function readUnderlyingTokenContract(client: PublicClient, wrapperAddress: Address) {
  return client.readContract(underlyingContract(wrapperAddress));
}

export function readWrapperExistsContract(
  client: PublicClient,
  coordinator: Address,
  tokenAddress: Address,
) {
  return client.readContract(wrapperExistsContract(coordinator, tokenAddress));
}

export function readSupportsInterfaceContract(
  client: PublicClient,
  tokenAddress: Address,
  interfaceId: Address,
) {
  return client.readContract(supportsInterfaceContract(tokenAddress, interfaceId));
}

// ── Write helpers ───────────────────────────────────────────

export function writeConfidentialTransferContract(
  client: WalletClient,
  tokenAddress: Address,
  to: Address,
  handle: Uint8Array,
  inputProof: Uint8Array,
) {
  return client.writeContract({
    chain: client.chain,
    account: requireAccount(client),
    ...confidentialTransferContract(tokenAddress, to, handle, inputProof),
  });
}

export function writeConfidentialBatchTransferContract(
  client: WalletClient,
  batcherAddress: Address,
  tokenAddress: Address,
  fromAddress: Address,
  batchTransferData: BatchTransferData[],
  fees: bigint,
) {
  return client.writeContract({
    chain: client.chain,
    account: requireAccount(client),
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
  encryptedErc20: Address,
  from: Address,
  to: Address,
  encryptedAmount: Uint8Array,
  inputProof: Uint8Array,
) {
  return client.writeContract({
    chain: client.chain,
    account: requireAccount(client),
    ...unwrapContract(encryptedErc20, from, to, encryptedAmount, inputProof),
  });
}

export function writeUnwrapFromBalanceContract(
  client: WalletClient,
  encryptedErc20: Address,
  from: Address,
  to: Address,
  encryptedBalance: Handle,
) {
  return client.writeContract({
    chain: client.chain,
    account: requireAccount(client),
    ...unwrapFromBalanceContract(encryptedErc20, from, to, encryptedBalance),
  });
}

export function writeFinalizeUnwrapContract(
  client: WalletClient,
  wrapper: Address,
  burntAmount: Handle,
  burntAmountCleartext: bigint,
  decryptionProof: Hex,
) {
  return client.writeContract({
    chain: client.chain,
    account: requireAccount(client),
    ...finalizeUnwrapContract(wrapper, burntAmount, burntAmountCleartext, decryptionProof),
  });
}

export function writeSetOperatorContract(
  client: WalletClient,
  tokenAddress: Address,
  spender: Address,
  timestamp?: number,
) {
  return client.writeContract({
    chain: client.chain,
    account: requireAccount(client),
    ...setOperatorContract(tokenAddress, spender, timestamp),
  });
}

export function writeWrapContract(
  client: WalletClient,
  wrapperAddress: Address,
  to: Address,
  amount: bigint,
) {
  return client.writeContract({
    chain: client.chain,
    account: requireAccount(client),
    ...wrapContract(wrapperAddress, to, amount),
  });
}

export function writeWrapETHContract(
  client: WalletClient,
  wrapperAddress: Address,
  to: Address,
  amount: bigint,
  value: bigint,
) {
  return client.writeContract({
    chain: client.chain,
    account: requireAccount(client),
    ...wrapETHContract(wrapperAddress, to, amount, value),
  });
}
