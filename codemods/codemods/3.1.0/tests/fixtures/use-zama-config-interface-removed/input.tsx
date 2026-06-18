import { useToken, type UseZamaConfig } from "@zama-fhe/react-sdk";
import type { Address } from "viem";

export interface MyConfig extends UseZamaConfig {
  extra?: string;
}

export function useMyToken(cfg: UseZamaConfig) {
  return useToken(cfg.tokenAddress as Address);
}
