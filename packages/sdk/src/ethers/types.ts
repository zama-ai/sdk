import type { Signer, ethers } from "ethers";
import type { EIP1193Provider } from "viem";
import type { AtLeastOneChain } from "../chains";
import type { ZamaConfigBase } from "../config/types";

/**
 * Ethers config — pass an EIP-1193 provider, ethers Signer, or ethers Provider.
 *
 * The three variants are mutually exclusive, matching {@link EthersSignerConfig}:
 * - `{ ethereum }` — browser EIP-1193 provider
 * - `{ signer }` — ethers Signer (e.g. Wallet)
 * - `{ provider }` — ethers Provider (read-only)
 */
export type ZamaConfigEthers<TChains extends AtLeastOneChain = AtLeastOneChain> =
  ZamaConfigBase<TChains> &
    (
      | { ethereum: EIP1193Provider; signer?: never; provider?: never }
      | { signer: Signer; ethereum?: never; provider?: never }
      | { provider: ethers.Provider; ethereum?: never; signer?: never }
    );
