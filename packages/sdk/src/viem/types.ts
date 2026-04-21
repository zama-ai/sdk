import type { EIP1193Provider, PublicClient, WalletClient } from "viem";
import type { ZamaConfigBase } from "../config/types";

/** Viem config — pass native viem clients directly. */
export interface ZamaConfigViem extends ZamaConfigBase {
  publicClient: PublicClient;
  walletClient?: WalletClient;
  ethereum?: EIP1193Provider;
}
