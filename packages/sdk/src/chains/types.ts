import type { ExtendedFhevmInstanceConfig } from "../relayer/relayer-utils";

export interface FheChain<TId extends number = number> extends Omit<
  ExtendedFhevmInstanceConfig,
  "chainId"
> {
  readonly id: TId;
}

/** At least one chain is required. */
export type AtLeastOneChain = readonly [FheChain, ...FheChain[]];
