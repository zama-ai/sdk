import type { GenericSigner } from "@zama-fhe/sdk";
import { ViemSigner, type ViemSignerConfig } from "@zama-fhe/sdk/viem";

const NO_WALLET_ERROR = new TypeError("No wallet connected — provider is in read-only mode");

export class ReadonlyViemSigner implements GenericSigner {
  readonly #signer: GenericSigner;

  constructor(config: ViemSignerConfig) {
    this.#signer = new ViemSigner(config);
  }

  getChainId: GenericSigner["getChainId"] = () => this.#signer.getChainId();

  getAddress: GenericSigner["getAddress"] = async () => {
    throw NO_WALLET_ERROR;
  };

  signTypedData: GenericSigner["signTypedData"] = async () => {
    throw NO_WALLET_ERROR;
  };

  writeContract: GenericSigner["writeContract"] = async () => {
    throw NO_WALLET_ERROR;
  };

  readContract: GenericSigner["readContract"] = (config) => this.#signer.readContract(config);

  waitForTransactionReceipt: GenericSigner["waitForTransactionReceipt"] = async () => {
    throw NO_WALLET_ERROR;
  };
}
