import type { EIP1193Provider, PublicClient, WalletClient } from "viem";
import type { AtLeastOneChain } from "../chains";
import type { ZamaConfigBase } from "../config/types";

/** Viem config — pass native viem clients directly. */
export interface ZamaConfigViem<
  TChains extends AtLeastOneChain = AtLeastOneChain,
> extends ZamaConfigBase<TChains> {
  /** Viem public client for host-chain reads. */
  publicClient: PublicClient;
  /** Viem wallet client for signing and write transactions. */
  walletClient: WalletClient;
  /** Optional EIP-1193 provider used to observe wallet account/chain changes; omit to disable account-change tracking. */
  ethereum?: EIP1193Provider;
}
