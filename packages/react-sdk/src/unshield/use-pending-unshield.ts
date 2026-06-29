"use client";

import { useQuery, useSuspenseQuery } from "../utils/query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address, Hex } from "@zama-fhe/sdk";
import { pendingUnshieldQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

export { pendingUnshieldQueryOptions };

/**
 * Read the unwrap tx hash of an unshield that was interrupted between its two
 * phases, or `null` if none is pending for this wrapper.
 *
 * The SDK persists this automatically when `useUnshield` / `useUnshieldAll`
 * submit phase 1, and clears it once phase 2 finalizes (the unshield/unwrap
 * mutations invalidate this query on success). Surface the returned hash as a
 * "resume" prompt, then pass it to {@link useResumeUnshield} — resuming is
 * caller-driven so a wallet transaction is never triggered on load.
 *
 * @param tokenAddress - Address of the confidential wrapper contract.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: Hex | null`.
 *
 * @example
 * ```tsx
 * const { data: pending } = usePendingUnshield("0xWrapper");
 * const { mutate: resume } = useResumeUnshield("0xWrapper");
 * if (pending) return <button onClick={() => resume({ unwrapTxHash: pending })}>Resume</button>;
 * ```
 */
export function usePendingUnshield(
  tokenAddress: Address,
  options?: Omit<UseQueryOptions<Hex | null>, "queryKey" | "queryFn">,
) {
  const sdk = useZamaSDK();

  return useQuery<Hex | null>({ ...pendingUnshieldQueryOptions(sdk, tokenAddress), ...options });
}

/**
 * Suspense variant of {@link usePendingUnshield}.
 * Suspends rendering until the pending state is loaded.
 *
 * @param tokenAddress - Address of the confidential wrapper contract.
 * @returns Suspense query result with `data: Hex | null`.
 *
 * @example
 * ```tsx
 * const { data: pending } = usePendingUnshieldSuspense("0xWrapper");
 * ```
 */
export function usePendingUnshieldSuspense(tokenAddress: Address) {
  const sdk = useZamaSDK();

  return useSuspenseQuery<Hex | null>(pendingUnshieldQueryOptions(sdk, tokenAddress));
}
