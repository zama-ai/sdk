import type {
  Address,
  Abi,
  ContractFunctionArgs,
  ContractFunctionName,
  ContractFunctionReturnType,
} from "viem";

/** ABI type accepted by contract call builders. Supports both typed and untyped ABIs. */
export type ContractAbi = Abi | readonly unknown[];

/** Extract read-only function names (`pure` | `view`) from a contract ABI. */
export type ReadFunctionName<TAbi extends ContractAbi = ContractAbi> = ContractFunctionName<
  TAbi,
  "pure" | "view"
>;

/** Extract write function names (`nonpayable` | `payable`) from a contract ABI. */
export type WriteFunctionName<TAbi extends ContractAbi = ContractAbi> = ContractFunctionName<
  TAbi,
  "nonpayable" | "payable"
>;

/** Infer the argument tuple for a read-only contract function. */
export type ReadContractArgs<
  TAbi extends ContractAbi = ContractAbi,
  TFunctionName extends ReadFunctionName<TAbi> = ReadFunctionName<TAbi>,
> = ContractFunctionArgs<TAbi, "pure" | "view", TFunctionName>;

/** Infer the argument tuple for a write contract function. */
export type WriteContractArgs<
  TAbi extends ContractAbi = ContractAbi,
  TFunctionName extends WriteFunctionName<TAbi> = WriteFunctionName<TAbi>,
> = ContractFunctionArgs<TAbi, "nonpayable" | "payable", TFunctionName>;

/** Infer the return type for a read-only contract function. */
export type ReadContractReturnType<
  TAbi extends ContractAbi = ContractAbi,
  TFunctionName extends ReadFunctionName<TAbi> = ReadFunctionName<TAbi>,
  TArgs extends ReadContractArgs<TAbi, TFunctionName> = ReadContractArgs<TAbi, TFunctionName>,
> = ContractFunctionReturnType<TAbi, "pure" | "view", TFunctionName, TArgs>;

/**
 * Typed read-contract configuration.
 * Matches the shape returned by read contract builders in `src/contracts/`.
 */
export interface ReadContractConfig<
  TAbi extends ContractAbi = ContractAbi,
  TFunctionName extends ReadFunctionName<TAbi> = ReadFunctionName<TAbi>,
  TArgs extends ReadContractArgs<TAbi, TFunctionName> = ReadContractArgs<TAbi, TFunctionName>,
> {
  /** Target contract address. */
  readonly address: Address;
  /** ABI fragment for the function being called. */
  readonly abi: TAbi;
  /** Solidity function name. */
  readonly functionName: TFunctionName;
  /** Contract call arguments inferred from the ABI and function name. */
  readonly args: TArgs;
}

/**
 * Typed write-contract configuration.
 * Matches the shape returned by write contract builders in `src/contracts/`.
 */
export interface WriteContractConfig<
  TAbi extends ContractAbi = ContractAbi,
  TFunctionName extends WriteFunctionName<TAbi> = WriteFunctionName<TAbi>,
  TArgs extends WriteContractArgs<TAbi, TFunctionName> = WriteContractArgs<TAbi, TFunctionName>,
> {
  /** Target contract address. */
  readonly address: Address;
  /** ABI fragment for the function being called. */
  readonly abi: TAbi;
  /** Solidity function name. */
  readonly functionName: TFunctionName;
  /** Contract call arguments inferred from the ABI and function name. */
  readonly args: TArgs;
  /** Native value to send with the transaction (for payable functions). */
  readonly value?: bigint;
  /** Gas limit override. */
  readonly gas?: bigint;
}
