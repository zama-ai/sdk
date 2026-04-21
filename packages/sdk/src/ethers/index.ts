/**
 * Ethers adapter for `@zama-fhe/sdk` — provides {@link EthersSigner} and
 * ethers-native contract read/write helpers.
 *
 * @packageDocumentation
 */

import type { ZamaConfig } from "../config/types";
import { buildZamaConfig } from "../config/build";
import { EthersSigner } from "./ethers-signer";
import type { ZamaConfigEthers } from "./types";

export type { ZamaConfigEthers } from "./types";

/** Create a {@link ZamaConfig} from ethers types. */
export function createZamaConfig(params: ZamaConfigEthers): ZamaConfig {
  const signer = new EthersSigner(params);
  return buildZamaConfig(signer, params);
}

export { EthersSigner, type EthersSignerConfig } from "./ethers-signer";
export type {
  EIP1193Provider,
  EIP1193Events,
  EIP1193EventMap,
  ProviderConnectInfo,
  ProviderMessage,
} from "viem";
export { ProviderRpcError } from "viem";
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
