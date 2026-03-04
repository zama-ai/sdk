/**
 * Ethers adapter for `@zama-fhe/sdk` — provides {@link EthersSigner} and
 * ethers-native contract read/write helpers.
 *
 * @packageDocumentation
 */

export { EthersSigner, type EthersSignerConfig } from "./ethers-signer";
export type {
  EIP1193Provider,
  EIP1193Events,
  EIP1193EventMap,
  ProviderConnectInfo,
  ProviderMessage,
} from "./ethers.types";
export { ProviderRpcError } from "./ethers.types";
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

// Re-export types used in EthersSigner's public API
export type {
  GenericSigner,
  SignerLifecycleCallbacks,
  ContractCallConfig,
  TransactionReceipt,
  Hex,
} from "../token/token.types";
export type { EIP712TypedData } from "../relayer/relayer-sdk.types";
export type { BatchTransferData } from "../contracts";
export type { RawLog } from "../events/onchain-events";
