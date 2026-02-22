import { ethers, type Provider, type Signer } from "ethers";
import type { Address } from "../relayer/relayer-sdk.types";
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

async function ethersWrite(signer: Signer, config: ContractConfig): Promise<Address> {
  const contract = new ethers.Contract(config.address, config.abi as ethers.InterfaceAbi, signer);
  const tx = await contract[config.functionName](...config.args, {
    value: config.value,
  });
  return tx.hash as Address;
}

// ── Read helpers ────────────────────────────────────────────

export function readConfidentialBalanceOfContract(
  provider: Provider | Signer,
  tokenAddress: Address,
  userAddress: Address,
) {
  return ethersRead(provider, confidentialBalanceOfContract(tokenAddress, userAddress));
}

export function readWrapperForTokenContract(
  provider: Provider | Signer,
  coordinator: Address,
  tokenAddress: Address,
) {
  return ethersRead(provider, getWrapperContract(coordinator, tokenAddress));
}

export function readUnderlyingTokenContract(provider: Provider | Signer, wrapperAddress: Address) {
  return ethersRead(provider, underlyingContract(wrapperAddress));
}

export function readWrapperExistsContract(
  provider: Provider | Signer,
  coordinator: Address,
  tokenAddress: Address,
) {
  return ethersRead(provider, wrapperExistsContract(coordinator, tokenAddress));
}

export function readSupportsInterfaceContract(
  provider: Provider | Signer,
  tokenAddress: Address,
  interfaceId: Address,
) {
  return ethersRead(provider, supportsInterfaceContract(tokenAddress, interfaceId));
}

// ── Write helpers ───────────────────────────────────────────

export function writeConfidentialTransferContract(
  signer: Signer,
  tokenAddress: Address,
  to: Address,
  handle: Uint8Array,
  inputProof: Uint8Array,
) {
  return ethersWrite(signer, confidentialTransferContract(tokenAddress, to, handle, inputProof));
}

export function writeConfidentialBatchTransferContract(
  signer: Signer,
  batcherAddress: Address,
  tokenAddress: Address,
  fromAddress: Address,
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
  encryptedErc20: Address,
  from: Address,
  to: Address,
  encryptedAmount: Uint8Array,
  inputProof: Uint8Array,
) {
  return ethersWrite(signer, unwrapContract(encryptedErc20, from, to, encryptedAmount, inputProof));
}

export function writeUnwrapFromBalanceContract(
  signer: Signer,
  encryptedErc20: Address,
  from: Address,
  to: Address,
  encryptedBalance: Address,
) {
  return ethersWrite(signer, unwrapFromBalanceContract(encryptedErc20, from, to, encryptedBalance));
}

export function writeFinalizeUnwrapContract(
  signer: Signer,
  wrapper: Address,
  burntAmount: Address,
  burntAmountCleartext: bigint,
  decryptionProof: Address,
) {
  return ethersWrite(
    signer,
    finalizeUnwrapContract(wrapper, burntAmount, burntAmountCleartext, decryptionProof),
  );
}

export function writeSetOperatorContract(
  signer: Signer,
  tokenAddress: Address,
  spender: Address,
  timestamp?: number,
) {
  return ethersWrite(signer, setOperatorContract(tokenAddress, spender, timestamp));
}

export function writeWrapContract(
  signer: Signer,
  wrapperAddress: Address,
  to: Address,
  amount: bigint,
) {
  return ethersWrite(signer, wrapContract(wrapperAddress, to, amount));
}

export function writeWrapETHContract(
  signer: Signer,
  wrapperAddress: Address,
  to: Address,
  amount: bigint,
  value: bigint,
) {
  return ethersWrite(signer, wrapETHContract(wrapperAddress, to, amount, value));
}
