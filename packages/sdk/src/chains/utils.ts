import type { ExtendedFhevmInstanceConfig } from "../relayer/relayer-utils";
import type { FheChain } from "./types";

export function toFheChain<T extends ExtendedFhevmInstanceConfig>({
  chainId,
  ...config
}: T): FheChain {
  return { ...config, id: chainId } as FheChain;
}
