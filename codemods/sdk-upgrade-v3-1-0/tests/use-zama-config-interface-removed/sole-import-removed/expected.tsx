import type { Address } from "viem";

export function useMyToken(cfg: { tokenAddress: Address; wrapperAddress?: Address }) {
  return cfg.tokenAddress as Address;
}
