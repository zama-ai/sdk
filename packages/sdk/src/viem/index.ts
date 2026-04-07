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
  readTokenPairsContract,
  readTokenPairsLengthContract,
  readTokenPairsSliceContract,
  readTokenPairContract,
  readConfidentialTokenAddressContract,
  readTokenAddressContract,
  readIsConfidentialTokenValidContract,
} from "./contracts";
