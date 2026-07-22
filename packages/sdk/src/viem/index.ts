/**
 * Viem adapter for `@zama-fhe/sdk` — provides {@link ViemSigner} and
 * viem-native contract read/write helpers.
 *
 * @packageDocumentation
 */

export type { ZamaConfigViem } from "./types";
export type { Hex } from "viem";
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

export { createConfig } from "./config";

export { ViemSigner, type ViemSignerConfig } from "./viem-signer";
export { ViemProvider, type ViemProviderConfig } from "./viem-provider";
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
