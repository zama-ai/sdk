import type { GenericProvider, MulticallReturnType, ReadContractConfig } from "../types";

/**
 * Reads `calls` on `chainId` in one multicall when the provider supports it,
 * and one call at a time otherwise.
 *
 * @internal
 */
export async function readContracts<const TCalls extends readonly ReadContractConfig[]>(
  provider: GenericProvider,
  calls: TCalls,
  chainId?: number,
): Promise<MulticallReturnType<TCalls>> {
  if (provider.multicall !== undefined) {
    return provider.multicall({ calls, chainId });
  }
  const results = await Promise.all(
    calls.map((call) => provider.readContract({ ...call, chainId })),
  );
  return results as MulticallReturnType<TCalls>;
}
