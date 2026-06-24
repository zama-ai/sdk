import { useDelegatedUserDecrypt, type UseZamaConfig } from "@zama-fhe/react-sdk";
import type { Address } from "viem";
import type { Handle } from "@zama-fhe/sdk";

export interface MyConfig extends UseZamaConfig {
  extra?: string;
}

export function useRead(h: Handle, cfg: UseZamaConfig, addr: Address) {
  const dec = useDelegatedUserDecrypt();
  return { h, cfg, dec, addr };
}
