import { ethers, type Provider, type Signer } from "ethers";
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

interface ContractConfig {
  address: string;
  abi: readonly unknown[];
  functionName: string;
  args: readonly unknown[];
  value?: bigint;
}

async function ethersRead(provider: Provider | Signer, config: ContractConfig) {
  const contract = new ethers.Contract(config.address, config.abi as ethers.InterfaceAbi, provider);
  return contract[config.functionName](...config.args);
}

async function ethersWrite(signer: Signer, config: ContractConfig): Promise<Hex> {
  const contract = new ethers.Contract(config.address, config.abi as ethers.InterfaceAbi, signer);
  const tx = await contract[config.functionName](...config.args, {
    value: config.value,
  });
  return tx.hash as Hex;
}

// ── Read helpers ────────────────────────────────────────────

export function readConfidentialBalanceOfContract(
  provider: Provider | Signer,
  tokenAddress: Hex,
  userAddress: Hex,
) {
  return ethersRead(provider, confidentialBalanceOfContract(tokenAddress, userAddress));
}

export function readWrapperForTokenContract(
  provider: Provider | Signer,
  coordinator: Hex,
  tokenAddress: Hex,
) {
  return ethersRead(provider, getWrapperContract(coordinator, tokenAddress));
}

export function readUnderlyingTokenContract(provider: Provider | Signer, wrapperAddress: Hex) {
  return ethersRead(provider, underlyingContract(wrapperAddress));
}

export function readWrapperExistsContract(
  provider: Provider | Signer,
  coordinator: Hex,
  tokenAddress: Hex,
) {
  return ethersRead(provider, wrapperExistsContract(coordinator, tokenAddress));
}

export function readSupportsInterfaceContract(
  provider: Provider | Signer,
  tokenAddress: Hex,
  interfaceId: Hex,
) {
  return ethersRead(provider, supportsInterfaceContract(tokenAddress, interfaceId));
}

// ── Write helpers ───────────────────────────────────────────

export function writeConfidentialTransferContract(
  signer: Signer,
  tokenAddress: Hex,
  to: Hex,
  handle: Uint8Array,
  inputProof: Uint8Array,
) {
  return ethersWrite(signer, confidentialTransferContract(tokenAddress, to, handle, inputProof));
}

export function writeConfidentialBatchTransferContract(
  signer: Signer,
  batcherAddress: Hex,
  tokenAddress: Hex,
  fromAddress: Hex,
  batchTransferData: BatchTransferData[],
  fees: bigint,
) {
  return ethersWrite(
    signer,
    confidentialBatchTransferContract(
      batcherAddress,
      tokenAddress,
      fromAddress,
      batchTransferData,
      fees,
    ),
  );
}

export function writeUnwrapContract(
  signer: Signer,
  encryptedErc20: Hex,
  from: Hex,
  to: Hex,
  encryptedAmount: Uint8Array,
  inputProof: Uint8Array,
) {
  return ethersWrite(signer, unwrapContract(encryptedErc20, from, to, encryptedAmount, inputProof));
}

export function writeUnwrapFromBalanceContract(
  signer: Signer,
  encryptedErc20: Hex,
  from: Hex,
  to: Hex,
  encryptedBalance: Hex,
) {
  return ethersWrite(signer, unwrapFromBalanceContract(encryptedErc20, from, to, encryptedBalance));
}

export function writeFinalizeUnwrapContract(
  signer: Signer,
  wrapper: Hex,
  burntAmount: Hex,
  burntAmountCleartext: bigint,
  decryptionProof: Hex,
) {
  return ethersWrite(
    signer,
    finalizeUnwrapContract(wrapper, burntAmount, burntAmountCleartext, decryptionProof),
  );
}

export function writeSetOperatorContract(
  signer: Signer,
  tokenAddress: Hex,
  spender: Hex,
  timestamp?: number,
) {
  return ethersWrite(signer, setOperatorContract(tokenAddress, spender, timestamp));
}

export function writeWrapContract(signer: Signer, wrapperAddress: Hex, to: Hex, amount: bigint) {
  return ethersWrite(signer, wrapContract(wrapperAddress, to, amount));
}

export function writeWrapETHContract(
  signer: Signer,
  wrapperAddress: Hex,
  to: Hex,
  amount: bigint,
  value: bigint,
) {
  return ethersWrite(signer, wrapETHContract(wrapperAddress, to, amount, value));
}
