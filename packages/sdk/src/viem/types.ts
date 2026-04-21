import type { EIP1193Provider, PublicClient, WalletClient } from "viem";
import type { FheChain } from "../chains";
import type { ZamaConfigBase } from "../config/types";

/** At least one chain is required. */
type AtLeastOneChain = readonly [FheChain, ...FheChain[]];

/** Viem config — pass native viem clients directly. */
export interface ZamaConfigViem<
  TChains extends AtLeastOneChain = AtLeastOneChain,
> extends ZamaConfigBase<TChains> {
  publicClient: PublicClient;
  walletClient?: WalletClient;
  ethereum?: EIP1193Provider;
}
