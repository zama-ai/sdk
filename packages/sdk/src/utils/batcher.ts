/**
 * Batches items to work around per-call size limits (e.g. ACL contract's
 * 10-address cap on `allow`).
 *
 * Calls the provided function sequentially with accumulated slices:
 * batch 1 receives items 0..N, batch 2 receives items 0..2N, etc.
 * This is necessary when each call must cover the full set processed so far
 * (e.g. EIP-712 signatures that enumerate every authorized contract).
 *
 * @typeParam TItem - The item type being batched.
 * @typeParam TResult - The return type of each batch call.
 *
 * @example
 * ```ts
 * const batcher = new Batcher(10);
 *
 * // With CredentialsManager
 * const creds = await batcher.execute(addresses, (addrs) => credentials.allow(...addrs));
 *
 * // With DelegatedCredentialsManager
 * const creds = await batcher.execute(addresses, (addrs) => delegated.allow(delegator, ...addrs));
 * ```
 */
export class Batcher {
  #batchSize: number;

  constructor(batchSize: number) {
    if (batchSize < 1) {
      throw new Error("batchSize must be at least 1");
    }
    this.#batchSize = batchSize;
  }

  /**
   * Process items in batches, passing accumulated items to the callback.
   *
   * @returns The result of the final callback invocation.
   */
  async execute<TItem, TResult>(
    items: TItem[],
    fn: (accumulated: TItem[]) => Promise<TResult>,
  ): Promise<TResult> {
    if (items.length === 0) {
      throw new Error("At least one item is required");
    }

    let result!: TResult;
    const accumulated: TItem[] = [];

    for (let i = 0; i < items.length; i += this.#batchSize) {
      const batch = items.slice(i, i + this.#batchSize);
      accumulated.push(...batch);
      result = await fn([...accumulated]);
    }

    return result;
  }
}
