import type { Address } from "viem";
import type { FheChain } from "../chains/types";

export abstract class BaseRelayer {
  #initPromise: Promise<void> | null = null;
  protected abstract readonly chain: FheChain;
  protected abstract init(): Promise<void>;

  protected async ensureInit(): Promise<void> {
    if (!this.#initPromise) {
      this.#initPromise = this.init().catch((error) => {
        this.#initPromise = null;
        throw error;
      });
    }
    return this.#initPromise;
  }

  protected resetInit(): void {
    this.#initPromise = null;
  }

  async getAclAddress(): Promise<Address> {
    return this.chain.aclContractAddress;
  }
}
