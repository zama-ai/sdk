import type { Signer, ethers } from "ethers";
import type { EIP1193Provider } from "viem";
import type { ZamaConfigBase } from "../config/types";

/**
 * Ethers config — pass an EIP-1193 provider, ethers Signer, or ethers Provider.
 *
 * The three variants are mutually exclusive, matching {@link EthersSignerConfig}:
 * - `{ ethereum }` — browser EIP-1193 provider
 * - `{ signer }` — ethers Signer (e.g. Wallet)
 * - `{ provider }` — ethers Provider (read-only)
 */
export type ZamaConfigEthers = ZamaConfigBase &
  ({ ethereum: EIP1193Provider } | { signer: Signer } | { provider: ethers.Provider });
