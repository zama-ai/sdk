import { Interface, type Provider } from "ethers";

const EXECUTOR_ABI = ["function plaintexts(bytes32 handle) view returns (uint256)"] as const;
const EXECUTOR_IFACE = new Interface(EXECUTOR_ABI);

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
 * Uses raw `provider.call` + `Interface` encode/decode for minimal overhead.
 *
 * Accepts either a pre-built reader (useful for testing with mocks) or an
 * `{ executorAddress, provider }` pair for production use.
 */
export class CleartextExecutor {
  readonly #read: (handle: string) => Promise<bigint>;

  constructor(reader: PlaintextReader);
  constructor(params: { executorAddress: string; provider: Provider });
  constructor(arg: PlaintextReader | { executorAddress: string; provider: Provider }) {
    if ("executorAddress" in arg) {
      const { executorAddress, provider } = arg;
      this.#read = async function read(handle: string) {
        const data = EXECUTOR_IFACE.encodeFunctionData("plaintexts", [handle]);
        const result = await provider.call({ to: executorAddress, data });
        return EXECUTOR_IFACE.decodeFunctionResult("plaintexts", result)[0] as bigint;
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
