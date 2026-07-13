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
export type { EncryptedValue, EIP712TypedData, ClearValue } from "../relayer/types";

// SDK-209: re-export types already public at the main `@zama-fhe/sdk` entry point —
// referenced structurally by this entry point's own public signatures.
export { BaseSigner } from "../signer/base-signer";
export { MutableWalletAccountStore } from "../signer/wallet-account-store";
export { ChainRouter } from "../chains/router";
export type { AtLeastOneChain, FheChain, FheChainAuth } from "../chains/types";
export type { ZamaConfig, ZamaConfigBase, RelayerConfig } from "../config/types";
export type { GenericProvider } from "../types/provider";
export type {
  GenericSigner,
  WalletAccount,
  WalletAccountChange,
  WalletAccountListener,
  WalletAccountStore,
} from "../types/signer";
export type {
  ContractAbi,
  ReadContractArgs,
  ReadContractConfig,
  ReadContractReturnType,
  ReadFunctionName,
  WriteContractArgs,
  WriteContractConfig,
  WriteFunctionName,
} from "../types/contract";
export type { TransactionReceipt, RawLog } from "../types/transaction";
export type { GenericStorage } from "../types/storage";
export type { ShieldPath } from "../types/token";
export type { GenericLogger } from "../types/logger";
export { ZamaSDKEvents } from "../events/sdk-events";
export type {
  ZamaSDKEventListener,
  ZamaSDKEvent,
  BaseEvent,
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
  UnwrapSubmittedEvent,
  FinalizeUnwrapSubmittedEvent,
  DelegationSubmittedEvent,
  RevokeDelegationSubmittedEvent,
  UnshieldPhase1SubmittedEvent,
  UnshieldPhase2StartedEvent,
  UnshieldPhase2SubmittedEvent,
} from "../events/sdk-events";
export type { FhevmRelayerSDK } from "../relayer/types";
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
