import { createFhevmClient } from "@fhevm/sdk/viem";
import { createFhevmCleartextClient } from "@fhevm/sdk/viem/cleartext";
import { createPublicClient, custom, http } from "viem";
import { toFhevmChain } from "../chains/to-fhevm-chain";
import type { FheChain } from "../chains/types";
import type { FhevmClient, FhevmClientOptions, FhevmRelayerSDK } from "./types";

/** Construction config for {@link FhevmRelayer}. */
export interface FhevmRelayerConfig {
  /** FHE chain configuration. */
  chain: FheChain;
  /**
   * Cleartext mode for local dev/test chains without FHE infrastructure — reads
   * mock cleartexts from the on-chain executor (discovered automatically)
   * instead of calling the relayer.
   */
  cleartext?: boolean;
  /** Per-client `@fhevm/sdk` options forwarded to `createFhevmClient`. */
  options?: FhevmClientOptions;
}

/**
 * Single-chain FHE backend that drives `@fhevm/sdk` on the calling thread.
 * EIP-712 signing is done by the signer layer; this backend builds the typed
 * data and, on decrypt, reassembles the new SDK's signed permit from the
 * interface's params + the previously returned signature.
 */
export class FhevmRelayer implements FhevmRelayerSDK {
  readonly #chain: FheChain;
  readonly #fhevm: FhevmClient;

  constructor(config: FhevmRelayerConfig) {
    this.#chain = config.chain;
    const params = {
      publicClient: createPublicClient({
        transport:
          typeof this.#chain.network === "string"
            ? http(this.#chain.network)
            : custom(this.#chain.network),
      }),
      chain: toFhevmChain(this.#chain),
      options: config.options,
    };
    this.#fhevm = config.cleartext ? createFhevmCleartextClient(params) : createFhevmClient(params);
  }

  get chain() {
    return this.#chain;
  }

  decryptPublicValue: FhevmClient["decryptPublicValue"] = async (parameters) => {
    await this.#fhevm.init();
    return this.#fhevm.decryptPublicValue({
      ...parameters,
      options: { ...parameters.options, auth: this.#chain.auth },
    });
  };

  decryptPublicValues: FhevmClient["decryptPublicValues"] = async (parameters) => {
    await this.#fhevm.init();
    return this.#fhevm.decryptPublicValues({
      ...parameters,
      options: { ...parameters.options, auth: this.#chain.auth },
    });
  };

  decryptPublicValuesWithSignatures: FhevmClient["decryptPublicValuesWithSignatures"] = async (
    parameters,
  ) => {
    await this.#fhevm.init();
    return this.#fhevm.decryptPublicValuesWithSignatures({
      ...parameters,
      options: { ...parameters.options, auth: this.#chain.auth },
    });
  };

  encryptValue: FhevmClient["encryptValue"] = async (parameters) => {
    await this.#fhevm.init();
    return this.#fhevm.encryptValue({
      ...parameters,
      options: { ...parameters.options, auth: this.#chain.auth },
    });
  };

  encryptValues: FhevmClient["encryptValues"] = async (parameters) => {
    await this.#fhevm.init();
    return this.#fhevm.encryptValues({
      ...parameters,
      options: { ...parameters.options, auth: this.#chain.auth },
    });
  };

  decryptValue: FhevmClient["decryptValue"] = async (parameters) => {
    await this.#fhevm.init();
    return this.#fhevm.decryptValue({
      ...parameters,
      options: { ...parameters.options, auth: this.#chain.auth },
    });
  };

  decryptValues: FhevmClient["decryptValues"] = async (parameters) => {
    await this.#fhevm.init();
    return this.#fhevm.decryptValues({
      ...parameters,
      options: { ...parameters.options, auth: this.#chain.auth },
    });
  };

  decryptValuesFromPairs: FhevmClient["decryptValuesFromPairs"] = async (parameters) => {
    await this.#fhevm.init();
    return this.#fhevm.decryptValuesFromPairs({
      ...parameters,
      options: { ...parameters.options, auth: this.#chain.auth },
    });
  };

  fetchFheEncryptionKeyBytes: FhevmClient["fetchFheEncryptionKeyBytes"] = async (parameters) => {
    await this.#fhevm.init();
    return this.#fhevm.fetchFheEncryptionKeyBytes({
      ...parameters,
      options: { ...parameters?.options, auth: this.#chain.auth },
    });
  };

  signDecryptionPermit: FhevmClient["signDecryptionPermit"] = async (parameters) => {
    await this.#fhevm.init();
    return this.#fhevm.signDecryptionPermit(parameters);
  };

  // Non-network passthroughs — no relayer round-trip, so no `auth` to inject.

  serializeTransportKeyPair: FhevmClient["serializeTransportKeyPair"] = (parameters) =>
    this.#fhevm.serializeTransportKeyPair(parameters);

  serializeSignedDecryptionPermit: FhevmClient["serializeSignedDecryptionPermit"] = (parameters) =>
    this.#fhevm.serializeSignedDecryptionPermit(parameters);

  parseTransportKeyPair: FhevmClient["parseTransportKeyPair"] = (parameters) =>
    this.#fhevm.parseTransportKeyPair(parameters);

  parseSignedDecryptionPermit: FhevmClient["parseSignedDecryptionPermit"] = (parameters) =>
    this.#fhevm.parseSignedDecryptionPermit(parameters);

  generateTransportKeyPair: FhevmClient["generateTransportKeyPair"] = async () => {
    await this.#fhevm.init();
    return this.#fhevm.generateTransportKeyPair();
  };
}
