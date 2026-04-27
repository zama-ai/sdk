import type {
  InputProofBytesType,
  KeypairType,
  KmsDelegatedUserDecryptEIP712Type,
  ZKProofLike,
} from "@zama-fhe/relayer-sdk/bundle";
import type { Address, Hex } from "viem";
import type { FheChain } from "../chains/types";
import type { RelayerConfig } from "../config/relayers";
import { resolveChainRelayers } from "../config/resolve";
import { ConfigurationError } from "../errors";
import { assertNonNullable, toError } from "../utils";
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
 * chain.
 *
 * Groups chains by relayer config reference identity, calls `createWorker`
 * once per group with all chain configs, then calls `createRelayer`
 * per chain with the shared worker.
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
    configs: Readonly<Record<number, RelayerConfig>>,
  ) {
    if (chains.length === 0) {
      throw new ConfigurationError("At least one chain is required.");
    }
    this.#chains = new Map(chains.map((c) => [c.id, c]));
    this.#chainId = chains[0].id;

    const chainRelayers = resolveChainRelayers(chains, configs);

    // Group chains by relayer config reference — same object = same group = shared worker.
    const groups = new Map<RelayerConfig, Array<[number, FheChain]>>();
    for (const [chainId, config] of chainRelayers) {
      const key = config.relayer;
      let group = groups.get(key);
      if (!group) {
        group = [];
        groups.set(key, group);
      }
      group.push([chainId, config.chain]);
    }

    // For each group: create shared worker once, then create per-chain relayers.
    const relayers = new Map<number, RelayerSDK>();
    const workers: WorkerLike[] = [];
    try {
      for (const [relayerCfg, groupChains] of groups) {
        const allChainConfigs = groupChains.map(([, chain]) => chain);
        const worker = relayerCfg.createWorker?.(allChainConfigs);
        if (worker) {
          workers.push(worker);
        }
        for (const [chainId, chain] of groupChains) {
          relayers.set(chainId, relayerCfg.createRelayer(chain, worker));
        }
      }
    } catch (error) {
      for (const w of workers) {
        try {
          w.terminate();
        } catch {
          /* best-effort cleanup */
        }
      }
      throw error;
    }

    this.#relayers = relayers;
    this.#workers = workers;
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
