import type { Hex } from "viem";
import type { GenericProvider, TransactionReceipt } from "../types";

/** How long to wait for a receipt when the provider cannot look one up without waiting. */
const RECEIPT_LOOKUP_TIMEOUT_MS = 5_000;

/**
 * The receipt of a transaction, or `null` when it is not mined (or not within
 * a short wait). Use it for a saved hash: the transaction may have been
 * dropped or replaced and never be mined.
 *
 * @internal
 */
export async function lookUpReceipt(
  provider: GenericProvider,
  hash: Hex,
): Promise<TransactionReceipt | null> {
  if (provider.getTransactionReceipt) {
    return provider.getTransactionReceipt(hash);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), RECEIPT_LOOKUP_TIMEOUT_MS);
  });
  try {
    return await Promise.race([provider.waitForTransactionReceipt(hash), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
