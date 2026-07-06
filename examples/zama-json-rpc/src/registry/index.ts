import { getAbiItem, toFunctionSelector, type Address, type Hex } from "viem";
import type { ConfidentialOperation } from "./types.js";

interface IndexedOperation {
  operation: ConfidentialOperation;
  selector: Hex;
}

/**
 * In-memory registry of confidential operations, keyed by (chainId, address, selector).
 *
 * This is deliberately declarative and additive: nothing outside this file
 * needs to change to register more contracts or operations later. Only
 * requests matching a registered entry are rewritten — everything else is
 * untouched pass-through, so the "magic" stays bounded to what's declared here.
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

  find(chainId: number, address: Address, data: Hex): ConfidentialOperation | undefined {
    const selector = data.slice(0, 10).toLowerCase();
    const normalizedAddress = address.toLowerCase();
    return this.#entries.find(
      (entry) =>
        entry.operation.chainId === chainId &&
        entry.operation.address.toLowerCase() === normalizedAddress &&
        entry.selector.toLowerCase() === selector,
    )?.operation;
  }

  list(): ConfidentialOperation[] {
    return this.#entries.map((entry) => entry.operation);
  }
}
