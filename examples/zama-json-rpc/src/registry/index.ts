import { getAbiItem, toFunctionSelector, type Hex } from "viem";
import type { ConfidentialOperation } from "./types.js";

interface IndexedOperation {
  operation: ConfidentialOperation;
  selector: Hex;
}

/**
 * In-memory registry of confidential *operations*, keyed by (chainId, selector).
 *
 * Not keyed by contract address — see `types.ts` for why: ERC-7984 fixes the
 * function signature and `euint64` width by standard, so one entry per
 * operation covers every conforming token. Whether a specific `to` address
 * is actually a genuine confidential token is a separate, dynamic check
 * (`sdk.registry.isConfidentialTokenValid`) performed by the rewriter, not
 * by this class.
 */
export class ConfidentialOperationRegistry {
  readonly #entries: IndexedOperation[];

  constructor(operations: ConfidentialOperation[]) {
    this.#entries = operations.map((operation) => {
      const abiItem = getAbiItem({ abi: operation.publicAbi, name: operation.publicFunctionName });
      if (!abiItem || abiItem.type !== "function") {
        throw new Error(
          `Registry misconfiguration: "${operation.publicFunctionName}" not found in publicAbi for "${operation.name}"`,
        );
      }
      return { operation, selector: toFunctionSelector(abiItem) };
    });
  }

  find(chainId: number, data: Hex): ConfidentialOperation | undefined {
    const selector = data.slice(0, 10).toLowerCase();
    return this.#entries.find(
      (entry) => entry.operation.chainId === chainId && entry.selector.toLowerCase() === selector,
    )?.operation;
  }

  list(): ConfidentialOperation[] {
    return this.#entries.map((entry) => entry.operation);
  }
}
