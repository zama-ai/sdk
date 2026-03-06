import type { PublicClient } from "viem";
import { parseAbi } from "viem";

const EXECUTOR_ABI = parseAbi(["function plaintexts(bytes32 handle) view returns (uint256)"]);

/** Minimal callable shape for testing with mocks. */
export interface PlaintextReader {
  getPlaintext(handle: string): Promise<bigint>;
}

/**
 * Reads plaintext values from the on-chain `CleartextFHEVMExecutor` contract.
 *
 * In cleartext mode the coprocessor stores raw (unencrypted) values keyed by
 * their bytes32 handle. This class wraps the `plaintexts(bytes32)` view call
 * to retrieve those values.
 *
 * Uses viem's `readContract` for type-safe, minimal-overhead contract reads.
 *
 * Accepts either a pre-built reader (useful for testing with mocks) or an
 * `{ executorAddress, client }` pair for production use.
 */
export class CleartextExecutor {
  readonly #read: (handle: string) => Promise<bigint>;

  constructor(reader: PlaintextReader);
  constructor(params: { executorAddress: `0x${string}`; client: PublicClient });
  constructor(arg: PlaintextReader | { executorAddress: `0x${string}`; client: PublicClient }) {
    if ("executorAddress" in arg) {
      const { executorAddress, client } = arg;
      this.#read = async function read(handle: string) {
        return client.readContract({
          address: executorAddress,
          abi: EXECUTOR_ABI,
          functionName: "plaintexts",
          args: [handle as `0x${string}`],
        });
      };
    } else {
      this.#read = function read(handle: string) {
        return arg.getPlaintext(handle);
      };
    }
  }

  /** Read a single plaintext value by its bytes32 handle. */
  async getPlaintext(handle: string): Promise<bigint> {
    return this.#read(handle);
  }

  /** Read multiple plaintext values in parallel. */
  async getPlaintexts(handles: string[]): Promise<bigint[]> {
    return Promise.all(handles.map((h) => this.#read(h)));
  }
}
