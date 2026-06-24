import { useToken } from "@zama-fhe/react-sdk";
import type { Address } from "viem";

export interface MyConfig {
  extra?: string;
}

export function useMyToken(cfg: { tokenAddress: Address; wrapperAddress?: Address }) {
  return useToken(cfg.tokenAddress as Address);
}
