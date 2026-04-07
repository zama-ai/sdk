import type { PublicClient, WalletClient, Address, Hex } from "viem";
import type { Handle } from "../relayer/relayer-sdk.types";
import {
  confidentialBalanceOfContract,
  confidentialTransferContract,
  finalizeUnwrapContract,
  getWrapperContract,
  setOperatorContract,
  supportsInterfaceContract,
  underlyingContract,
  unwrapContract,
  unwrapFromBalanceContract,
  wrapContract,
  wrapperExistsContract,
  getTokenPairsContract,
  getTokenPairsLengthContract,
  getTokenPairsSliceContract,
  getTokenPairContract,
  getConfidentialTokenAddressContract,
  getTokenAddressContract,
  isConfidentialTokenValidContract,
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
  registryAddress: Address,
  tokenAddress: Address,
) {
  return client.readContract(getWrapperContract(registryAddress, tokenAddress));
}

export function readUnderlyingTokenContract(client: PublicClient, wrapperAddress: Address) {
  return client.readContract(underlyingContract(wrapperAddress));
}

export function readWrapperExistsContract(
  client: PublicClient,
  registryAddress: Address,
  tokenAddress: Address,
) {
  return client.readContract(wrapperExistsContract(registryAddress, tokenAddress));
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

// ── Registry read helpers ──────────────────────────────────

export function readTokenPairsContract(client: PublicClient, registry: Address) {
  return client.readContract(getTokenPairsContract(registry));
}

export function readTokenPairsLengthContract(client: PublicClient, registry: Address) {
  return client.readContract(getTokenPairsLengthContract(registry));
}

export function readTokenPairsSliceContract(
  client: PublicClient,
  registry: Address,
  fromIndex: bigint,
  toIndex: bigint,
) {
  return client.readContract(getTokenPairsSliceContract(registry, fromIndex, toIndex));
}

export function readTokenPairContract(client: PublicClient, registry: Address, index: bigint) {
  return client.readContract(getTokenPairContract(registry, index));
}

export function readConfidentialTokenAddressContract(
  client: PublicClient,
  registry: Address,
  tokenAddress: Address,
) {
  return client.readContract(getConfidentialTokenAddressContract(registry, tokenAddress));
}

export function readTokenAddressContract(
  client: PublicClient,
  registry: Address,
  confidentialTokenAddress: Address,
) {
  return client.readContract(getTokenAddressContract(registry, confidentialTokenAddress));
}

export function readIsConfidentialTokenValidContract(
  client: PublicClient,
  registry: Address,
  confidentialTokenAddress: Address,
) {
  return client.readContract(isConfidentialTokenValidContract(registry, confidentialTokenAddress));
}
