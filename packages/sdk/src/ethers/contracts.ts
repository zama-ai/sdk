import {
  decodeFunctionResult,
  encodeFunctionData,
  isHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";

import type { Handle } from "../relayer/relayer-sdk.types";

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

interface EthersTransactionRequest {
  to: Address;
  data: Hex;
  gasLimit?: bigint;
  value?: bigint;
}

interface EthersTransactionResponse {
  hash: string;
}

interface EthersCallProvider {
  call(tx: EthersTransactionRequest): Promise<string>;
}

interface EthersTransactionSigner extends EthersCallProvider {
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

async function ethersRead<T>(
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

export function readConfidentialBalanceOfContract(
  provider: EthersCallProvider,
  tokenAddress: Address,
  userAddress: Address,
) {
  return ethersRead(provider, confidentialBalanceOfContract(tokenAddress, userAddress));
}

export function readUnderlyingTokenContract(provider: EthersCallProvider, wrapperAddress: Address) {
  return ethersRead(provider, underlyingContract(wrapperAddress));
}

export function readSupportsInterfaceContract(
  provider: EthersCallProvider,
  tokenAddress: Address,
  interfaceId: Address,
) {
  return ethersRead(provider, supportsInterfaceContract(tokenAddress, interfaceId));
}

// ── Write helpers ───────────────────────────────────────────

export function writeConfidentialTransferContract(
  signer: EthersTransactionSigner,
  tokenAddress: Address,
  to: Address,
  handle: Uint8Array,
  inputProof: Uint8Array,
) {
  return ethersWrite(signer, confidentialTransferContract(tokenAddress, to, handle, inputProof));
}

export function writeUnwrapContract(
  signer: EthersTransactionSigner,
  encryptedErc20: Address,
  from: Address,
  to: Address,
  encryptedAmount: Uint8Array,
  inputProof: Uint8Array,
) {
  return ethersWrite(signer, unwrapContract(encryptedErc20, from, to, encryptedAmount, inputProof));
}

export function writeUnwrapFromBalanceContract(
  signer: EthersTransactionSigner,
  encryptedErc20: Address,
  from: Address,
  to: Address,
  encryptedBalance: Handle,
) {
  return ethersWrite(signer, unwrapFromBalanceContract(encryptedErc20, from, to, encryptedBalance));
}

export function writeFinalizeUnwrapContract(
  signer: EthersTransactionSigner,
  wrapper: Address,
  unwrapRequestId: Handle,
  burntAmountCleartext: bigint,
  decryptionProof: Hex,
) {
  return ethersWrite(
    signer,
    finalizeUnwrapContract(wrapper, unwrapRequestId, burntAmountCleartext, decryptionProof),
  );
}

export function writeSetOperatorContract(
  signer: EthersTransactionSigner,
  tokenAddress: Address,
  spender: Address,
  timestamp?: number,
) {
  return ethersWrite(signer, setOperatorContract(tokenAddress, spender, timestamp));
}

export function writeWrapContract(
  signer: EthersTransactionSigner,
  wrapperAddress: Address,
  to: Address,
  amount: bigint,
) {
  return ethersWrite(signer, wrapContract(wrapperAddress, to, amount));
}

// ── Registry read helpers ──────────────────────────────────

export function readTokenPairsContract(provider: EthersCallProvider, registry: Address) {
  return ethersRead(provider, getTokenPairsContract(registry));
}

export function readTokenPairsLengthContract(provider: EthersCallProvider, registry: Address) {
  return ethersRead(provider, getTokenPairsLengthContract(registry));
}

export function readTokenPairsSliceContract(
  provider: EthersCallProvider,
  registry: Address,
  fromIndex: bigint,
  toIndex: bigint,
) {
  return ethersRead(provider, getTokenPairsSliceContract(registry, fromIndex, toIndex));
}

export function readTokenPairContract(
  provider: EthersCallProvider,
  registry: Address,
  index: bigint,
) {
  return ethersRead(provider, getTokenPairContract(registry, index));
}

export function readConfidentialTokenAddressContract(
  provider: EthersCallProvider,
  registry: Address,
  tokenAddress: Address,
) {
  return ethersRead(provider, getConfidentialTokenAddressContract(registry, tokenAddress));
}

export function readTokenAddressContract(
  provider: EthersCallProvider,
  registry: Address,
  confidentialTokenAddress: Address,
) {
  return ethersRead(provider, getTokenAddressContract(registry, confidentialTokenAddress));
}

export function readIsConfidentialTokenValidContract(
  provider: EthersCallProvider,
  registry: Address,
  confidentialTokenAddress: Address,
) {
  return ethersRead(provider, isConfidentialTokenValidContract(registry, confidentialTokenAddress));
}
