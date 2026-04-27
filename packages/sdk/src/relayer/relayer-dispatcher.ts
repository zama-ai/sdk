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
  #chainId: number | null = null;

  constructor(
    chains: Map<number, FheChain>,
    relayers: Map<number, RelayerSDK>,
    workers: readonly WorkerLike[] = [],
  ) {
    if (chains.size === 0) {
      throw new ConfigurationError("At least one chain is required.");
    }
    if (chains.size === 1) {
      const [chain] = chains.values();
      this.#chainId = chain ? chain.id : null;
    }
    this.#chains = new Map(chains);
    this.#relayers = new Map(relayers);
    this.#workers = workers;
  }

  get chains(): readonly FheChain[] {
    return [...this.#chains.values()];
  }

  get chain(): FheChain {
    if (this.#chainId === null) {
      throw new ConfigurationError("No active chain. Call switchChain() first.");
    }
    const chain = this.#chains.get(this.#chainId);
    if (!chain) {
      throw new ConfigurationError(`Active chain ${this.#chainId} not found in configured chains.`);
    }
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

  #active(): RelayerSDK {
    if (this.#chainId === null) {
      throw new ConfigurationError("No active chain. Call switchChain() first.");
    }
    const relayer = this.#relayers.get(this.#chainId);
    if (!relayer) {
      throw new ConfigurationError(`No relayer instance for active chain ${this.#chainId}.`);
    }
    return relayer;
  }

  generateKeypair(): Promise<KeypairType<Hex>> {
    return this.#active().generateKeypair();
  }

  createEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays?: number,
  ): Promise<EIP712TypedData> {
    return this.#active().createEIP712(publicKey, contractAddresses, startTimestamp, durationDays);
  }

  encrypt(params: EncryptParams): Promise<EncryptResult> {
    return this.#active().encrypt(params);
  }

  userDecrypt(params: UserDecryptParams): Promise<Readonly<Record<Handle, ClearValueType>>> {
    return this.#active().userDecrypt(params);
  }

  publicDecrypt(handles: Handle[]): Promise<PublicDecryptResult> {
    return this.#active().publicDecrypt(handles);
  }

  createDelegatedUserDecryptEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    delegatorAddress: Address,
    startTimestamp: number,
    durationDays?: number,
  ): Promise<KmsDelegatedUserDecryptEIP712Type> {
    return this.#active().createDelegatedUserDecryptEIP712(
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
    return this.#active().delegatedUserDecrypt(params);
  }

  requestZKProofVerification(zkProof: ZKProofLike): Promise<InputProofBytesType> {
    return this.#active().requestZKProofVerification(zkProof);
  }

  getPublicKey(): Promise<PublicKeyData | null> {
    return this.#active().getPublicKey();
  }

  getPublicParams(bits: number): Promise<PublicParamsData | null> {
    return this.#active().getPublicParams(bits);
  }

  getAclAddress(): Promise<Address> {
    return this.#active().getAclAddress();
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

    // Terminate the actual workers/pools.
    for (const w of this.#workers) {
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
