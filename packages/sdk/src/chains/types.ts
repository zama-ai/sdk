import type { ExtendedFhevmInstanceConfig } from "../relayer/relayer-utils";

export interface FheChain extends Omit<ExtendedFhevmInstanceConfig, "chainId"> {
  readonly id: number;
}
