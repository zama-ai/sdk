/**
 * Ethers adapter for `@zama-fhe/sdk` — provides {@link EthersSigner} and
 * ethers-native contract read/write helpers.
 *
 * @packageDocumentation
 */

export type { ZamaConfigEthers } from "./types";

export { createConfig } from "./config";

export { EthersSigner, type EthersSignerConfig } from "./ethers-signer";
export { EthersProvider, type EthersProviderConfig } from "./ethers-provider";
export type {
  EIP1193Provider,
  EIP1193Events,
  EIP1193EventMap,
  ProviderConnectInfo,
  ProviderMessage,
  Hex,
} from "viem";
export { ProviderRpcError } from "viem";
export type {
  EncryptedValue,
  EIP712TypedData,
  FhevmRuntimeConfig,
  ClearValue,
} from "../relayer/types";
export type { AtLeastOneChain, FheChain, FheChainAuth } from "../chains/types";
export type { ZamaConfig, ZamaConfigBase, RelayerConfig } from "../config/types";
export type {
  GenericProvider,
  GenericStorage,
  GenericLogger,
  GenericSigner,
  WalletAccount,
  WalletAccountChange,
  WalletAccountListener,
  WalletAccountStore,
  ContractAbi,
  ReadFunctionName,
  ReadContractArgs,
  ReadContractReturnType,
  ReadContractConfig,
  WriteFunctionName,
  WriteContractArgs,
  WriteContractConfig,
  TransactionReceipt,
  ShieldPath,
} from "../types";
export type { MutableWalletAccountStore } from "../signer/wallet-account-store";
export type { RawLog } from "../events";
export { ZamaSDKEvents } from "../events/sdk-events";
export type {
  BaseEvent,
  ZamaSDKEvent,
  ZamaSDKEventType,
  ZamaSDKEventListener,
  TransactionOperation,
  EncryptStartEvent,
  EncryptEndEvent,
  EncryptErrorEvent,
  DecryptStartEvent,
  DecryptEndEvent,
  DecryptErrorEvent,
  TransactionErrorEvent,
  ShieldSubmittedEvent,
  TransferSubmittedEvent,
  TransferFromSubmittedEvent,
  SetOperatorSubmittedEvent,
  ApproveUnderlyingSubmittedEvent,
  WrapSubmittedEvent,
  UnwrapSubmittedEvent,
  FinalizeUnwrapSubmittedEvent,
  DelegationSubmittedEvent,
  RevokeDelegationSubmittedEvent,
  UnshieldPhase1SubmittedEvent,
  UnshieldPhase2StartedEvent,
  UnshieldPhase2SubmittedEvent,
} from "../events/sdk-events";
export { BaseSigner } from "../signer/base-signer";
export type {
  EthersCallProvider,
  EthersTransactionSigner,
  EthersTransactionRequest,
  EthersTransactionResponse,
} from "./contracts";
export {
  readConfidentialBalanceOfContract,
  readUnderlyingTokenContract,
  readSupportsInterfaceContract,
  writeConfidentialTransferContract,
  writeUnwrapContract,
  writeUnwrapFromBalanceContract,
  writeFinalizeUnwrapContract,
  writeSetOperatorContract,
  writeWrapContract,
  readTokenPairsContract,
  readTokenPairsLengthContract,
  readTokenPairsSliceContract,
  readTokenPairContract,
  readConfidentialTokenAddressContract,
  readTokenAddressContract,
  readIsConfidentialTokenValidContract,
} from "./contracts";
