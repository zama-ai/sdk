/**
 * Ethers adapter for `@zama-fhe/sdk` — provides {@link EthersSigner} and
 * ethers-native contract read/write helpers.
 *
 * @packageDocumentation
 */

export {
  EthersSigner,
  type EthersSignerConfig,
  type EthersStaticSignerConfig,
  type EthersEIP1193SignerConfig,
} from "./ethers-signer";
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
