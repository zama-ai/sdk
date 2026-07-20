/**
 * Viem adapter for `@zama-fhe/sdk` — provides {@link ViemSigner} and
 * viem-native contract read/write helpers.
 *
 * @packageDocumentation
 */

export type { ZamaConfigViem } from "./types";
export type { Hex } from "viem";
export type { EncryptedValue, EIP712TypedData } from "../relayer/types";
export type { AtLeastOneChain, FheChain } from "../chains/types";
export type { ZamaConfig, ZamaConfigBase } from "../config/types";
export type {
  GenericProvider,
  ReadContractConfig,
  WriteContractConfig,
  TransactionReceipt,
} from "../types";
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
