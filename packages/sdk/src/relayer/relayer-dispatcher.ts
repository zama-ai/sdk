import type { Address, Hex } from "viem";
import type { FheChain } from "../chains/types";
import type { RelayerConfig } from "../config/types";
import { resolveChainRelayers } from "../config/resolve";
import type { TransportKeyPair } from "../credentials/types";
import { ConfigurationError } from "../errors";
import { assertNonNullable, toError } from "../utils";
import type {
  ClearValue,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
  EncryptedValue,
  FheEncryptionKey,
  PublicDecryptResult,
  RelayerSDK,
  UserDecryptParams,
} from "./relayer-sdk.types";

/**
 * Owns chain management (chains / activeChain / switchChain) and delegates
 * every {@link RelayerSDK} operation to the relayer for the currently active
 * chain. Builds one relayer per chain from its {@link RelayerConfig}.
 */
export class RelayerDispatcher implements RelayerSDK, Disposable {
  readonly #chains: Map<number, FheChain>;
  readonly #relayers: Map<number, RelayerSDK>;
  #chainId: number;

  constructor(
    chains: readonly [FheChain, ...FheChain[]],
    configs: Readonly<Record<number, RelayerConfig>>,
  ) {
    if (chains.length === 0) {
      throw new ConfigurationError("At least one chain is required.");
    }
    this.#chains = new Map(chains.map((c) => [c.id, c]));
    this.#chainId = chains[0].id;

    // One relayer per chain. A shared config object can yield the same relayer
    // instance for several chains (createRelayer decides); terminate() dedupes.
    const relayers = new Map<number, RelayerSDK>();
    for (const [chainId, { relayer, chain }] of resolveChainRelayers(chains, configs)) {
      relayers.set(chainId, relayer.createRelayer(chain));
    }
    this.#relayers = relayers;
  }

  get chains(): readonly FheChain[] {
    return [...this.#chains.values()];
  }

  get chain(): FheChain {
    const chain = this.#chains.get(this.#chainId);
    assertNonNullable(chain, "RelayerDispatcher: chain");
    return chain;
  }

  switchChain(chainId: number): void {
    if (!this.#chains.has(chainId)) {
      throw new ConfigurationError(
        `No relayer configured for chain ${chainId}. Add it to the chains array.`,
      );
    }
    this.#chainId = chainId;
  }

  get #active(): RelayerSDK {
    const relayer = this.#relayers.get(this.#chainId);
    assertNonNullable(relayer, "RelayerDispatcher: relayer");
    return relayer;
  }

  generateTransportKeyPair(): Promise<TransportKeyPair> {
    return this.#active.generateTransportKeyPair();
  }

  createEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays?: number,
  ): Promise<EIP712TypedData> {
    return this.#active.createEIP712(publicKey, contractAddresses, startTimestamp, durationDays);
  }

  encrypt(params: EncryptParams): Promise<EncryptResult> {
    return this.#active.encrypt(params);
  }

  decryptValues(params: UserDecryptParams): Promise<Readonly<Record<EncryptedValue, ClearValue>>> {
    return this.#active.decryptValues(params);
  }

  decryptPublicValues(encryptedValues: EncryptedValue[]): Promise<PublicDecryptResult> {
    return this.#active.decryptPublicValues(encryptedValues);
  }

  createDelegatedUserDecryptEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    delegatorAddress: Address,
    startTimestamp: number,
    durationDays?: number,
  ): Promise<EIP712TypedData> {
    return this.#active.createDelegatedUserDecryptEIP712(
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp,
      durationDays,
    );
  }

  delegatedDecryptValues(
    params: DelegatedUserDecryptParams,
  ): Promise<Readonly<Record<EncryptedValue, ClearValue>>> {
    return this.#active.delegatedDecryptValues(params);
  }

  fetchFheEncryptionKeyBytes(): Promise<FheEncryptionKey | null> {
    return this.#active.fetchFheEncryptionKeyBytes();
  }

  getAclAddress(): Address {
    return this.#active.getAclAddress();
  }

  terminate(): void {
    const errors: Error[] = [];

    // Clean up relayer-owned caches (deduped: a shared config can yield one
    // relayer instance across chains).
    for (const r of new Set(this.#relayers.values())) {
      try {
        r.terminate();
      } catch (e) {
        errors.push(toError(e));
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, "Failed to terminate relayer resources");
    }
  }

  [Symbol.dispose](): void {
    this.terminate();
  }
}
