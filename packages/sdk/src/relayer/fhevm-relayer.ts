import { createFhevmClient } from "@fhevm/sdk/viem";
import { createFhevmCleartextClient } from "@fhevm/sdk/viem/cleartext";
import { createPublicClient, custom, http } from "viem";
import { toFhevmChain } from "../chains/to-fhevm-chain";
import type { FheChain } from "../chains/types";
import type { FhevmClient, FhevmRelayerOptions, FhevmRelayerSDK, RelayerOptions } from "./types";

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
  /**
   * Per-transport {@link RelayerOptions}: `@fhevm/sdk` client options plus a
   * default request `timeout` applied to every relayer round-trip on the chain.
   */
  options?: RelayerOptions;
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
  readonly #defaultOptions: Partial<FhevmRelayerOptions>;

  constructor(config: FhevmRelayerConfig) {
    this.#chain = config.chain;
    const { timeout, batchRpcCalls, moduleVersions, fheEncryptionKey } = config.options ?? {};
    const params = {
      publicClient: createPublicClient({
        transport:
          typeof this.#chain.network === "string"
            ? http(this.#chain.network)
            : custom(this.#chain.network),
      }),
      chain: toFhevmChain(this.#chain),
      options: { batchRpcCalls, moduleVersions, fheEncryptionKey },
    };
    this.#fhevm = config.cleartext ? createFhevmCleartextClient(params) : createFhevmClient(params);
    this.#defaultOptions = { auth: this.#chain.auth, fetchRetries: 2, timeout };
  }

  get chain() {
    return this.#chain;
  }

  init: FhevmClient["init"] = async () => this.#fhevm.init();

  decryptPublicValue: FhevmClient["decryptPublicValue"] = async (parameters) => {
    await this.init();
    return this.#fhevm.decryptPublicValue({
      ...parameters,
      options: { ...this.#defaultOptions, ...parameters.options },
    });
  };

  decryptPublicValues: FhevmClient["decryptPublicValues"] = async (parameters) => {
    await this.init();
    return this.#fhevm.decryptPublicValues({
      ...parameters,
      options: { ...this.#defaultOptions, ...parameters.options },
    });
  };

  decryptPublicValuesWithSignatures: FhevmClient["decryptPublicValuesWithSignatures"] = async (
    parameters,
  ) => {
    await this.init();
    return this.#fhevm.decryptPublicValuesWithSignatures({
      ...parameters,
      options: { ...this.#defaultOptions, ...parameters.options },
    });
  };

  encryptValue: FhevmClient["encryptValue"] = async (parameters) => {
    await this.init();
    return this.#fhevm.encryptValue({
      ...parameters,
      options: { ...this.#defaultOptions, ...parameters.options },
    });
  };

  encryptValues: FhevmClient["encryptValues"] = async (parameters) => {
    await this.init();
    return this.#fhevm.encryptValues({
      ...parameters,
      options: { ...this.#defaultOptions, ...parameters.options },
    });
  };

  decryptValue: FhevmClient["decryptValue"] = async (parameters) => {
    await this.init();
    return this.#fhevm.decryptValue({
      ...parameters,
      options: { ...this.#defaultOptions, ...parameters.options },
    });
  };

  decryptValues: FhevmClient["decryptValues"] = async (parameters) => {
    await this.init();
    return this.#fhevm.decryptValues({
      ...parameters,
      options: { ...this.#defaultOptions, ...parameters.options },
    });
  };

  decryptValuesFromPairs: FhevmClient["decryptValuesFromPairs"] = async (parameters) => {
    await this.init();
    return this.#fhevm.decryptValuesFromPairs({
      ...parameters,
      options: { ...this.#defaultOptions, ...parameters.options },
    });
  };

  fetchFheEncryptionKeyBytes: FhevmClient["fetchFheEncryptionKeyBytes"] = async (parameters) => {
    await this.init();
    return this.#fhevm.fetchFheEncryptionKeyBytes({
      ...parameters,
      options: { ...this.#defaultOptions, ...parameters?.options },
    });
  };

  signDecryptionPermit: FhevmClient["signDecryptionPermit"] = async (parameters) => {
    await this.init();
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
    await this.init();
    return this.#fhevm.generateTransportKeyPair();
  };
}
