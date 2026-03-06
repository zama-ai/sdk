/**
 * Viem adapter for `@zama-fhe/sdk` — provides {@link ViemSigner} and
 * viem-native contract read/write helpers.
 *
 * @packageDocumentation
 */

export { ViemSigner, type ViemSignerConfig } from "./viem-signer";
export {
  readConfidentialBalanceOfContract,
  readWrapperForTokenContract,
  readUnderlyingTokenContract,
  readWrapperExistsContract,
  readSupportsInterfaceContract,
  writeConfidentialTransferContract,
  writeConfidentialBatchTransferContract,
  writeUnwrapContract,
  writeUnwrapFromBalanceContract,
  writeFinalizeUnwrapContract,
  writeSetOperatorContract,
  writeWrapContract,
  writeWrapETHContract,
} from "./contracts";

// Re-export types used in ViemSigner's public API
export type {
  GenericSigner,
  SignerLifecycleCallbacks,
  ContractAbi,
  ReadContractConfig,
  ReadContractArgs,
  ReadContractReturnType,
  ReadFunctionName,
  WriteContractConfig,
  WriteContractArgs,
  WriteFunctionName,
  TransactionReceipt,
  Hex,
} from "../token/token.types";
export type { EIP712TypedData } from "../relayer/relayer-sdk.types";
export type { BatchTransferData } from "../contracts";
export type { RawLog } from "../events/onchain-events";
