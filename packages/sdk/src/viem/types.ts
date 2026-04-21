import type { EIP1193Provider, PublicClient, WalletClient } from "viem";
import type { AtLeastOneChain } from "../chains";
import type { ZamaConfigBase } from "../config/types";

/** Viem config — pass native viem clients directly. */
export interface ZamaConfigViem<
  TChains extends AtLeastOneChain = AtLeastOneChain,
> extends ZamaConfigBase<TChains> {
  publicClient: PublicClient;
  walletClient?: WalletClient;
  ethereum?: EIP1193Provider;
}
