import {
  decodeFunctionResult,
  encodeFunctionData,
  isHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";

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

interface TransactionRequestConfig {
  address: Address;
  abi: readonly unknown[];
  functionName: string;
  args: readonly unknown[];
  gas?: bigint;
  value?: bigint;
}

/** Minimal transaction request accepted by the ethers contract helpers. */
export interface EthersTransactionRequest {
  /** Target contract address. */
  to: Address;
  /** ABI-encoded call data. */
  data: Hex;
  /** Optional gas limit for the transaction. */
  gasLimit?: bigint;
  /** Optional native-token value to send with the call, in wei. */
  value?: bigint;
}

/** Minimal transaction response returned by an {@link EthersTransactionSigner}. */
export interface EthersTransactionResponse {
  /** Hash of the submitted transaction. */
  hash: string;
}

/** Minimal read-only ethers provider shape used by the read contract helpers. */
export interface EthersCallProvider {
  /** Performs an `eth_call` and resolves to the raw hex return data. */
  call(tx: EthersTransactionRequest): Promise<string>;
}

/** Minimal ethers signer shape used by the write contract helpers. */
export interface EthersTransactionSigner extends EthersCallProvider {
  /** Signs and broadcasts a transaction, resolving to the transaction response. */
  sendTransaction(tx: EthersTransactionRequest): Promise<EthersTransactionResponse>;
}

function toTransactionRequest(config: TransactionRequestConfig): EthersTransactionRequest {
  return {
    to: config.address,
    data: encodeFunctionData({
      abi: config.abi as Abi,
      functionName: config.functionName as never,
      args: config.args as never,
    }),
    ...(config.gas !== undefined ? { gasLimit: config.gas } : {}),
    ...(config.value !== undefined ? { value: config.value } : {}),
  };
}

/**
 * Performs an `eth_call` through an ethers provider and decodes the result with viem, so every
 * ethers-backed read — the generic {@link EthersProvider.readContract} and the pre-built
 * `readXxxContract` helpers alike — produces viem-identical shapes (small ints as `number`, named
 * tuples as keyed objects, empty output as `undefined`). ethers is the transport only; viem owns
 * encoding and decoding.
 *
 * @internal
 */
export async function ethersRead<T>(
  provider: EthersCallProvider,
  config: TransactionRequestConfig,
): Promise<T> {
  const data = await provider.call(toTransactionRequest(config));
  if (!isHex(data)) {
    throw new TypeError(`Expected hex string, got: ${data}`);
  }
  return decodeFunctionResult({
    abi: config.abi as Abi,
    functionName: config.functionName as never,
    data,
  }) as T;
}

async function ethersWrite(
  signer: EthersTransactionSigner,
  config: TransactionRequestConfig,
): Promise<Hex> {
  const tx = await signer.sendTransaction(toTransactionRequest(config));
  if (!isHex(tx.hash)) {
    throw new TypeError(`Expected hex string, got: ${tx.hash}`);
  }
  return tx.hash;
}

// ── Read helpers ────────────────────────────────────────────

/** Reads a token's confidential (encrypted) balance handle for `userAddress` via an ethers provider. */
export function readConfidentialBalanceOfContract(
  provider: EthersCallProvider,
  tokenAddress: Address,
  userAddress: Address,
) {
  return ethersRead(provider, confidentialBalanceOfContract(tokenAddress, userAddress));
}

/** Reads the underlying ERC-20 address wrapped by a confidential wrapper via an ethers provider. */
export function readUnderlyingTokenContract(provider: EthersCallProvider, wrapperAddress: Address) {
  return ethersRead(provider, underlyingContract(wrapperAddress));
}

/** Reads whether a token implements the given ERC-165 interface id via an ethers provider. */
export function readSupportsInterfaceContract(
  provider: EthersCallProvider,
  tokenAddress: Address,
  interfaceId: Address,
) {
  return ethersRead(provider, supportsInterfaceContract(tokenAddress, interfaceId));
}

// ── Write helpers ───────────────────────────────────────────

/** Submits a confidential transfer of an encrypted amount to `to` via an ethers signer. */
export function writeConfidentialTransferContract(
  signer: EthersTransactionSigner,
  tokenAddress: Address,
  to: Address,
  encryptedAmount: EncryptedValue,
  inputProof: Hex,
) {
  return ethersWrite(
    signer,
    confidentialTransferContract(tokenAddress, to, encryptedAmount, inputProof),
  );
}

/** Submits an unwrap of an encrypted amount from `from` to `to` on a confidential ERC-20 via an ethers signer. */
export function writeUnwrapContract(
  signer: EthersTransactionSigner,
  encryptedErc20: Address,
  from: Address,
  to: Address,
  encryptedAmount: EncryptedValue,
  inputProof: Hex,
) {
  return ethersWrite(signer, unwrapContract(encryptedErc20, from, to, encryptedAmount, inputProof));
}

/** Submits an unwrap of the full encrypted balance from `from` to `to` via an ethers signer. */
export function writeUnwrapFromBalanceContract(
  signer: EthersTransactionSigner,
  encryptedErc20: Address,
  from: Address,
  to: Address,
  encryptedBalance: EncryptedValue,
) {
  return ethersWrite(signer, unwrapFromBalanceContract(encryptedErc20, from, to, encryptedBalance));
}

/** Finalizes a pending unwrap request with the decrypted amount and decryption proof via an ethers signer. */
export function writeFinalizeUnwrapContract(
  signer: EthersTransactionSigner,
  wrapper: Address,
  unwrapRequestId: EncryptedValue,
  unwrapAmountCleartext: bigint,
  decryptionProof: Hex,
) {
  return ethersWrite(
    signer,
    finalizeUnwrapContract(wrapper, unwrapRequestId, unwrapAmountCleartext, decryptionProof),
  );
}

/** Authorizes `operator` on a token, until an optional expiry timestamp, via an ethers signer. */
export function writeSetOperatorContract(
  signer: EthersTransactionSigner,
  tokenAddress: Address,
  operator: Address,
  until?: number,
) {
  return ethersWrite(signer, setOperatorContract(tokenAddress, operator, until));
}

/** Wraps `amount` of the underlying ERC-20 into confidential tokens credited to `to` via an ethers signer. */
export function writeWrapContract(
  signer: EthersTransactionSigner,
  wrapperAddress: Address,
  to: Address,
  amount: bigint,
) {
  return ethersWrite(signer, wrapContract(wrapperAddress, to, amount));
}

// ── Registry read helpers ──────────────────────────────────

/** Reads all underlying/confidential token pairs from a wrappers registry via an ethers provider. */
export function readTokenPairsContract(provider: EthersCallProvider, registry: Address) {
  return ethersRead(provider, getTokenPairsContract(registry));
}

/** Reads the number of token pairs in a wrappers registry via an ethers provider. */
export function readTokenPairsLengthContract(provider: EthersCallProvider, registry: Address) {
  return ethersRead(provider, getTokenPairsLengthContract(registry));
}

/** Reads a slice of token pairs (`fromIndex` to `toIndex`) from a wrappers registry via an ethers provider. */
export function readTokenPairsSliceContract(
  provider: EthersCallProvider,
  registry: Address,
  fromIndex: bigint,
  toIndex: bigint,
) {
  return ethersRead(provider, getTokenPairsSliceContract(registry, fromIndex, toIndex));
}

/** Reads the token pair at `index` from a wrappers registry via an ethers provider. */
export function readTokenPairContract(
  provider: EthersCallProvider,
  registry: Address,
  index: bigint,
) {
  return ethersRead(provider, getTokenPairContract(registry, index));
}

/** Reads the confidential token registered for a given underlying token in a wrappers registry via an ethers provider. */
export function readConfidentialTokenAddressContract(
  provider: EthersCallProvider,
  registry: Address,
  tokenAddress: Address,
) {
  return ethersRead(provider, getConfidentialTokenAddressContract(registry, tokenAddress));
}

/** Reads the underlying token registered for a given confidential token in a wrappers registry via an ethers provider. */
export function readTokenAddressContract(
  provider: EthersCallProvider,
  registry: Address,
  confidentialTokenAddress: Address,
) {
  return ethersRead(provider, getTokenAddressContract(registry, confidentialTokenAddress));
}

/** Reads whether a confidential token is registered and valid in a wrappers registry via an ethers provider. */
export function readIsConfidentialTokenValidContract(
  provider: EthersCallProvider,
  registry: Address,
  confidentialTokenAddress: Address,
) {
  return ethersRead(provider, isConfidentialTokenValidContract(registry, confidentialTokenAddress));
}
