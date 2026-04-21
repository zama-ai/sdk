/* oxlint-disable no-unnecessary-type-arguments -- T["chainId"] preserves literal chain IDs */
import type { ExtendedFhevmInstanceConfig } from "../relayer/relayer-utils";
import type { FheChain } from "./types";

export function toFheChain<T extends ExtendedFhevmInstanceConfig>({
  chainId,
  ...config
}: T): FheChain<T["chainId"]> {
  return { ...config, id: chainId };
}
