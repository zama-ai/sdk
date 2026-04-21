/**
 * Viem adapter for `@zama-fhe/sdk` — provides {@link ViemSigner} and
 * viem-native contract read/write helpers.
 *
 * @packageDocumentation
 */

import type { ZamaConfig } from "../config/types";
import { buildZamaConfig } from "../config/build";
import { ViemSigner } from "./viem-signer";
import type { ZamaConfigViem } from "./types";

export type { ZamaConfigViem } from "./types";

/** Create a {@link ZamaConfig} from viem clients. */
export function createZamaConfig(params: ZamaConfigViem): ZamaConfig {
  const signer = new ViemSigner({
    publicClient: params.publicClient,
    walletClient: params.walletClient,
    ethereum: params.ethereum,
  });
  return buildZamaConfig(signer, params);
}

export { ViemSigner, type ViemSignerConfig } from "./viem-signer";
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
