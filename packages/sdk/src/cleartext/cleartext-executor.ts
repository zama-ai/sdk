import { Contract, type Provider } from "ethers";

const EXECUTOR_ABI = ["function plaintexts(bytes32 handle) view returns (uint256)"];

export class CleartextExecutor {
  readonly #contract: { plaintexts(handle: string): Promise<bigint> };

  constructor(contract: { plaintexts(handle: string): Promise<bigint> });
  constructor(params: { executorAddress: string; provider: Provider });
  constructor(arg: any) {
    if ("executorAddress" in arg) {
      this.#contract = new Contract(arg.executorAddress, EXECUTOR_ABI, arg.provider) as any;
    } else {
      this.#contract = arg;
    }
  }

  async getPlaintext(handle: string): Promise<bigint> {
    return this.#contract.plaintexts(handle);
  }

  async getPlaintexts(handles: string[]): Promise<bigint[]> {
    return Promise.all(handles.map((h) => this.getPlaintext(h)));
  }
}
