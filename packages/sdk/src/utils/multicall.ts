import type { GenericProvider, MulticallReturnType, ReadContractConfig } from "../types";

/** Multicall3's address, the same on every chain it is deployed on. */
export const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

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
  return readEach(provider, calls, chainId);
}

/**
 * Reads `calls` concurrently with `readContract`: the fallback where no
 * Multicall3 is available.
 *
 * @internal
 */
export async function readEach<const TCalls extends readonly ReadContractConfig[]>(
  provider: Pick<GenericProvider, "readContract">,
  calls: TCalls,
  chainId?: number,
): Promise<MulticallReturnType<TCalls>> {
  const results = await Promise.all(
    calls.map((call) => provider.readContract({ ...call, chainId })),
  );
  return results as MulticallReturnType<TCalls>;
}
