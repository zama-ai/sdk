import type { UseZamaConfig } from "@zama-fhe/react-sdk";
import type { Address } from "viem";

export function useMyToken(cfg: UseZamaConfig) {
  return cfg.tokenAddress as Address;
}
