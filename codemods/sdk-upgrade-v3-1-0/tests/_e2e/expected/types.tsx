import { useDelegatedDecrypt } from "@zama-fhe/react-sdk";
import type { Address } from "viem";
import type { EncryptedValue } from "@zama-fhe/sdk";

export interface MyConfig {
  extra?: string;
}

export function useRead(
  h: EncryptedValue,
  cfg: { tokenAddress: Address; wrapperAddress?: Address },
  addr: Address,
) {
  const dec = useDelegatedDecrypt();
  return { h, cfg, dec, addr };
}
