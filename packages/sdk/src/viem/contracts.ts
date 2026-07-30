import type { PublicClient, WalletClient, Address, Hex } from "viem";
import type { EncryptedValue } from "../relayer/types";
import {
  confidentialBalanceOfContract,
  confidentialTransferContract,
  finalizeUnwrapContract,
  setOperatorContract,
  supportsInterfaceContract,
  underlyingContract,
  unwrapContract,
  unwrapFromBalanceContract,
  wrapContract,
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

/** Reads a token's confidential (encrypted) balance handle for `userAddress` via a viem client. */
export function readConfidentialBalanceOfContract(
  client: PublicClient,
  tokenAddress: Address,
  userAddress: Address,
) {
  return client.readContract(confidentialBalanceOfContract(tokenAddress, userAddress));
}

/** Reads the underlying ERC-20 address wrapped by a confidential wrapper via a viem client. */
export function readUnderlyingTokenContract(client: PublicClient, wrapperAddress: Address) {
  return client.readContract(underlyingContract(wrapperAddress));
}

/** Reads whether a token implements the given ERC-165 interface id via a viem client. */
export function readSupportsInterfaceContract(
  client: PublicClient,
  tokenAddress: Address,
  interfaceId: Address,
) {
  return client.readContract(supportsInterfaceContract(tokenAddress, interfaceId));
}

// ── Write helpers ───────────────────────────────────────────

/** Submits a confidential transfer of an encrypted amount to `to` via a viem wallet client. */
export function writeConfidentialTransferContract(
  client: WalletClient,
  tokenAddress: Address,
  to: Address,
  encryptedAmount: EncryptedValue,
  inputProof: Hex,
) {
  return client.writeContract({
    chain: client.chain,
    account: requireAccount(client),
    ...confidentialTransferContract(tokenAddress, to, encryptedAmount, inputProof),
  });
}

/** Submits an unwrap of an encrypted amount from `from` to `to` on a confidential ERC-20 via a viem wallet client. */
export function writeUnwrapContract(
  client: WalletClient,
  encryptedErc20: Address,
  from: Address,
  to: Address,
  encryptedAmount: EncryptedValue,
  inputProof: Hex,
) {
  return client.writeContract({
    chain: client.chain,
    account: requireAccount(client),
    ...unwrapContract(encryptedErc20, from, to, encryptedAmount, inputProof),
  });
}

/** Submits an unwrap of the full encrypted balance from `from` to `to` via a viem wallet client. */
export function writeUnwrapFromBalanceContract(
  client: WalletClient,
  encryptedErc20: Address,
  from: Address,
  to: Address,
  encryptedBalance: EncryptedValue,
) {
  return client.writeContract({
    chain: client.chain,
    account: requireAccount(client),
    ...unwrapFromBalanceContract(encryptedErc20, from, to, encryptedBalance),
  });
}

/** Finalizes a pending unwrap request with the decrypted amount and decryption proof via a viem wallet client. */
export function writeFinalizeUnwrapContract(
  client: WalletClient,
  wrapper: Address,
  unwrapRequestId: EncryptedValue,
  unwrapAmountCleartext: bigint,
  decryptionProof: Hex,
) {
  return client.writeContract({
    chain: client.chain,
    account: requireAccount(client),
    ...finalizeUnwrapContract(wrapper, unwrapRequestId, unwrapAmountCleartext, decryptionProof),
  });
}

/** Authorizes `operator` on a token, until an optional expiry timestamp, via a viem wallet client. */
export function writeSetOperatorContract(
  client: WalletClient,
  tokenAddress: Address,
  operator: Address,
  until?: number,
) {
  return client.writeContract({
    chain: client.chain,
    account: requireAccount(client),
    ...setOperatorContract(tokenAddress, operator, until),
  });
}

/** Wraps `amount` of the underlying ERC-20 into confidential tokens credited to `to` via a viem wallet client. */
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

/** Reads all underlying/confidential token pairs from a wrappers registry via a viem client. */
export function readTokenPairsContract(client: PublicClient, registry: Address) {
  return client.readContract(getTokenPairsContract(registry));
}

/** Reads the number of token pairs in a wrappers registry via a viem client. */
export function readTokenPairsLengthContract(client: PublicClient, registry: Address) {
  return client.readContract(getTokenPairsLengthContract(registry));
}

/** Reads a slice of token pairs (`fromIndex` to `toIndex`) from a wrappers registry via a viem client. */
export function readTokenPairsSliceContract(
  client: PublicClient,
  registry: Address,
  fromIndex: bigint,
  toIndex: bigint,
) {
  return client.readContract(getTokenPairsSliceContract(registry, fromIndex, toIndex));
}

/** Reads the token pair at `index` from a wrappers registry via a viem client. */
export function readTokenPairContract(client: PublicClient, registry: Address, index: bigint) {
  return client.readContract(getTokenPairContract(registry, index));
}

/** Reads the confidential token registered for a given underlying token in a wrappers registry via a viem client. */
export function readConfidentialTokenAddressContract(
  client: PublicClient,
  registry: Address,
  tokenAddress: Address,
) {
  return client.readContract(getConfidentialTokenAddressContract(registry, tokenAddress));
}

/** Reads the underlying token registered for a given confidential token in a wrappers registry via a viem client. */
export function readTokenAddressContract(
  client: PublicClient,
  registry: Address,
  confidentialTokenAddress: Address,
) {
  return client.readContract(getTokenAddressContract(registry, confidentialTokenAddress));
}

/** Reads whether a confidential token is registered and valid in a wrappers registry via a viem client. */
export function readIsConfidentialTokenValidContract(
  client: PublicClient,
  registry: Address,
  confidentialTokenAddress: Address,
) {
  return client.readContract(isConfidentialTokenValidContract(registry, confidentialTokenAddress));
}
