import type {
  DecryptPublicValueParameters,
  DecryptPublicValuesParameters,
  DecryptPublicValuesWithSignaturesParameters,
} from "@fhevm/sdk/actions/base";
import type {
  FetchFheEncryptionKeyBytesParameters,
  ParseSignedDecryptionPermitParameters,
  ParseTransportKeyPairParameters,
  SerializeSignedDecryptionPermitParameters,
  SerializeTransportKeyPairParameters,
} from "@fhevm/sdk/actions/chain";
import type {
  DecryptValueParameters,
  DecryptValuesFromPairsParameters,
  DecryptValuesParameters,
} from "@fhevm/sdk/actions/decrypt";
import type { EncryptValueParameters, EncryptValuesParameters } from "@fhevm/sdk/actions/encrypt";
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

  decryptPublicValue = async (
    parameters: DecryptPublicValueParameters,
  ): Promise<Awaited<ReturnType<FhevmClient["decryptPublicValue"]>>> => {
    await this.#fhevm.init();
    return this.#fhevm.decryptPublicValue({
      ...parameters,
      options: { ...parameters.options, auth: this.#chain.auth },
    });
  };

  decryptPublicValues = async (parameters: DecryptPublicValuesParameters) => {
    await this.#fhevm.init();
    return this.#fhevm.decryptPublicValues({
      ...parameters,
      options: { ...parameters.options, auth: this.#chain.auth },
    });
  };

  decryptPublicValuesWithSignatures = async (
    parameters: DecryptPublicValuesWithSignaturesParameters,
  ) => {
    await this.#fhevm.init();
    return this.#fhevm.decryptPublicValuesWithSignatures({
      ...parameters,
      options: { ...parameters.options, auth: this.#chain.auth },
    });
  };

  encryptValue = async (parameters: EncryptValueParameters) => {
    await this.#fhevm.init();
    return this.#fhevm.encryptValue({
      ...parameters,
      options: { ...parameters.options, auth: this.#chain.auth },
    });
  };

  encryptValues = async (parameters: EncryptValuesParameters) => {
    await this.#fhevm.init();
    return this.#fhevm.encryptValues({
      ...parameters,
      options: { ...parameters.options, auth: this.#chain.auth },
    });
  };

  decryptValue = async (
    parameters: DecryptValueParameters,
  ): Promise<Awaited<ReturnType<FhevmClient["decryptValue"]>>> => {
    await this.#fhevm.init();
    return this.#fhevm.decryptValue({
      ...parameters,
      options: { ...parameters.options, auth: this.#chain.auth },
    });
  };

  decryptValues = async (parameters: DecryptValuesParameters) => {
    await this.#fhevm.init();
    return this.#fhevm.decryptValues({
      ...parameters,
      options: { ...parameters.options, auth: this.#chain.auth },
    });
  };

  decryptValuesFromPairs = async (parameters: DecryptValuesFromPairsParameters) => {
    await this.#fhevm.init();
    return this.#fhevm.decryptValuesFromPairs({
      ...parameters,
      options: { ...parameters.options, auth: this.#chain.auth },
    });
  };

  fetchFheEncryptionKeyBytes = async (
    parameters?: FetchFheEncryptionKeyBytesParameters,
  ): Promise<Awaited<ReturnType<FhevmClient["fetchFheEncryptionKeyBytes"]>>> => {
    await this.#fhevm.init();
    return this.#fhevm.fetchFheEncryptionKeyBytes({
      ...parameters,
      options: { ...parameters?.options, auth: this.#chain.auth },
    });
  };

  // Non-network passthroughs — no relayer round-trip, so no `auth` to inject.

  get signDecryptionPermit(): FhevmClient["signDecryptionPermit"] {
    return this.#fhevm.signDecryptionPermit;
  }

  serializeTransportKeyPair = (parameters: SerializeTransportKeyPairParameters) =>
    this.#fhevm.serializeTransportKeyPair(parameters);

  serializeSignedDecryptionPermit = (parameters: SerializeSignedDecryptionPermitParameters) =>
    this.#fhevm.serializeSignedDecryptionPermit(parameters);

  parseTransportKeyPair = (parameters: ParseTransportKeyPairParameters) =>
    this.#fhevm.parseTransportKeyPair(parameters);

  parseSignedDecryptionPermit = (
    parameters: ParseSignedDecryptionPermitParameters,
  ): ReturnType<FhevmClient["parseSignedDecryptionPermit"]> =>
    this.#fhevm.parseSignedDecryptionPermit(parameters);

  generateTransportKeyPair = async () => {
    await this.#fhevm.init();
    return this.#fhevm.generateTransportKeyPair();
  };
}
