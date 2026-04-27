import type {
  InputProofBytesType,
  KeypairType,
  KmsDelegatedUserDecryptEIP712Type,
  ZKProofLike,
} from "@zama-fhe/relayer-sdk/bundle";
import type { Address, Hex } from "viem";
import type { FheChain } from "../chains/types";
import { ConfigurationError } from "../errors";
import { toError } from "../utils";
import type { RelayerSDK } from "./relayer-sdk";
import type {
  ClearValueType,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
  Handle,
  PublicDecryptResult,
  PublicKeyData,
  PublicParamsData,
  UserDecryptParams,
} from "./relayer-sdk.types";

/** Anything with a synchronous `terminate()` method (workers, pools). */
export interface WorkerLike {
  terminate(): void;
}

/**
 * Owns chain management (chains / activeChain / switchChain) and delegates
 * every {@link RelayerSDK} operation to the relayer for the currently active
 * chain.  Each value in the relayers map is a single-chain RelayerWeb or
 * RelayerNode instance.
 *
 * Workers/pools are held separately from relayers so the dispatcher can
 * terminate them directly — relayers never own worker lifecycle.
 */
export class RelayerDispatcher implements RelayerSDK, Disposable {
  readonly #chains: Map<number, FheChain>;
  readonly #relayers: Map<number, RelayerSDK>;
  readonly #workers: readonly WorkerLike[];
  #chainId: number;

  constructor(
    chains: readonly [FheChain, ...FheChain[]],
    relayers: Map<number, RelayerSDK>,
    workers: readonly WorkerLike[] = [],
  ) {
    if (chains.length === 0) {
      throw new ConfigurationError("At least one chain is required.");
    }
    this.#chains = new Map(chains.map((c) => [c.id, c]));
    this.#relayers = new Map(relayers);
    this.#workers = workers;
    this.#chainId = chains[0].id;

    // Validate every chain has a relayer
    for (const chain of chains) {
      if (!this.#relayers.has(chain.id)) {
        throw new ConfigurationError(`No relayer instance for chain ${chain.id}.`);
      }
    }
  }

  get chains(): readonly FheChain[] {
    return [...this.#chains.values()];
  }

  get chain(): FheChain {
    // Safe: #chainId always points to a valid chain (enforced by constructor + switchChain)
    return this.#chains.get(this.#chainId) as FheChain;
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
    // Safe: constructor validates every chain has a relayer, switchChain validates chain exists
    return this.#relayers.get(this.#chainId) as RelayerSDK;
  }

  generateKeypair(): Promise<KeypairType<Hex>> {
    return this.#active.generateKeypair();
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

  userDecrypt(params: UserDecryptParams): Promise<Readonly<Record<Handle, ClearValueType>>> {
    return this.#active.userDecrypt(params);
  }

  publicDecrypt(handles: Handle[]): Promise<PublicDecryptResult> {
    return this.#active.publicDecrypt(handles);
  }

  createDelegatedUserDecryptEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    delegatorAddress: Address,
    startTimestamp: number,
    durationDays?: number,
  ): Promise<KmsDelegatedUserDecryptEIP712Type> {
    return this.#active.createDelegatedUserDecryptEIP712(
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp,
      durationDays,
    );
  }

  delegatedUserDecrypt(
    params: DelegatedUserDecryptParams,
  ): Promise<Readonly<Record<Handle, ClearValueType>>> {
    return this.#active.delegatedUserDecrypt(params);
  }

  requestZKProofVerification(zkProof: ZKProofLike): Promise<InputProofBytesType> {
    return this.#active.requestZKProofVerification(zkProof);
  }

  getPublicKey(): Promise<PublicKeyData | null> {
    return this.#active.getPublicKey();
  }

  getPublicParams(bits: number): Promise<PublicParamsData | null> {
    return this.#active.getPublicParams(bits);
  }

  getAclAddress(): Promise<Address> {
    return this.#active.getAclAddress();
  }

  terminate(): void {
    const errors: Error[] = [];

    // Clean up relayer-owned caches (no worker termination).
    for (const r of new Set(this.#relayers.values())) {
      try {
        r.terminate();
      } catch (e) {
        errors.push(toError(e));
      }
    }

    // Terminate the actual workers/pools (deduplicated).
    for (const w of new Set(this.#workers)) {
      try {
        w.terminate();
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
