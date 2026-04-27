import type { Address } from "viem";
import type { FheChain } from "../chains/types";
import { ConfigurationError } from "../errors";

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
    if (!this.chain.aclContractAddress) {
      throw new ConfigurationError(`No ACL address configured for chain ${this.chain.id}`);
    }
    return this.chain.aclContractAddress;
  }
}
