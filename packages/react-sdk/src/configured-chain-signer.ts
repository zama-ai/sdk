import type { GenericSigner } from "@zama-fhe/sdk";
import type { FhevmChain } from "@zama-fhe/sdk/chains";

export function getConfiguredChainMismatchError(
  configuredChain: FhevmChain,
  connectedChainId: number,
): string {
  return (
    `Connected wallet is on chain ${connectedChainId}, ` +
    `but FhevmProvider is configured for ${configuredChain.id} (${configuredChain.name}).`
  );
}

export class ConfiguredChainSigner implements GenericSigner {
  readonly #configuredChain: FhevmChain;
  readonly #signer: GenericSigner;

  constructor(configuredChain: FhevmChain, signer: GenericSigner) {
    this.#configuredChain = configuredChain;
    this.#signer = signer;
  }

  async #assertConfiguredChain(): Promise<void> {
    const connectedChainId = await this.#signer.getChainId();

    if (connectedChainId !== this.#configuredChain.id) {
      throw new Error(getConfiguredChainMismatchError(this.#configuredChain, connectedChainId));
    }
  }

  async getChainId(): Promise<number> {
    await this.#assertConfiguredChain();
    return this.#configuredChain.id;
  }

  getAddress: GenericSigner["getAddress"] = async () => {
    await this.#assertConfiguredChain();
    return this.#signer.getAddress();
  };

  signTypedData: GenericSigner["signTypedData"] = async (typedData) => {
    await this.#assertConfiguredChain();
    return this.#signer.signTypedData(typedData);
  };

  writeContract: GenericSigner["writeContract"] = async (config) => {
    await this.#assertConfiguredChain();
    return this.#signer.writeContract(config);
  };

  readContract: GenericSigner["readContract"] = async (config) => {
    await this.#assertConfiguredChain();
    return this.#signer.readContract(config);
  };

  waitForTransactionReceipt: GenericSigner["waitForTransactionReceipt"] = async (hash) => {
    await this.#assertConfiguredChain();
    return this.#signer.waitForTransactionReceipt(hash);
  };

  subscribe(callbacks: Parameters<NonNullable<GenericSigner["subscribe"]>>[0]): () => void {
    return this.#signer.subscribe?.(callbacks) ?? (() => {});
  }
}
