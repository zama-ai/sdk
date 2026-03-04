import { Contract, type Provider } from "ethers";

const EXECUTOR_ABI = ["function plaintexts(bytes32 handle) view returns (uint256)"] as const;

type PlaintextContract = { plaintexts(handle: string): Promise<bigint> };

/**
 * Reads plaintext values from the on-chain `CleartextFHEVMExecutor` contract.
 *
 * In cleartext mode the coprocessor stores raw (unencrypted) values keyed by
 * their bytes32 handle. This class wraps the `plaintexts(bytes32)` view call
 * to retrieve those values.
 *
 * Accepts either a pre-built contract-like object (useful for testing with
 * mocks) or an `{ executorAddress, provider }` pair for production use.
 */
export class CleartextExecutor {
  readonly #contract: PlaintextContract;

  constructor(contract: PlaintextContract);
  constructor(params: { executorAddress: string; provider: Provider });
  constructor(arg: PlaintextContract | { executorAddress: string; provider: Provider }) {
    if ("executorAddress" in arg) {
      this.#contract = new Contract(
        arg.executorAddress,
        EXECUTOR_ABI,
        arg.provider,
      ) as unknown as PlaintextContract;
    } else {
      this.#contract = arg;
    }
  }

  /** Read a single plaintext value by its bytes32 handle. */
  async getPlaintext(handle: string): Promise<bigint> {
    return this.#contract.plaintexts(handle);
  }

  /** Read multiple plaintext values in parallel. */
  async getPlaintexts(handles: string[]): Promise<bigint[]> {
    return Promise.all(handles.map((h) => this.getPlaintext(h)));
  }
}
