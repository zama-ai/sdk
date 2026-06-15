import type { FheChain } from "../chains/types";
import type { RelayerConfig } from "../config/types";
import { resolveChainRelayers } from "../config/resolve";
import { ConfigurationError } from "../errors";
import { assertNonNullable, toError } from "../utils";
import type { RelayerSDK } from "./relayer-sdk";

/** Anything with a synchronous `terminate()` method (workers, pools). */
export interface WorkerLike {
  terminate(): void;
}

/**
 * Chain registry + per-chain {@link RelayerSDK} accessor.
 *
 * Owns the multi-chain wiring: groups chains by relayer config reference identity,
 * calls `createWorker` once per group, then `createRelayer` per chain with the
 * shared worker. The currently-active chain is reachable via {@link relayer}; any
 * registered chain via {@link relayerForChain}. Workers are held separately so the router
 * can terminate them directly — relayers never own worker lifecycle.
 */
export class ChainRouter implements Disposable {
  readonly #chains: Map<number, FheChain>;
  readonly #relayers: Map<number, RelayerSDK>;
  readonly #workers: readonly WorkerLike[];
  #chainId: number;

  /**
   * Build the router. The first chain becomes the active chain.
   *
   * @throws ConfigurationError if `chains` is empty or any chain is missing a relayer config.
   *   {@link ConfigurationError}
   */
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

  /** All chains registered with the router, in the order they were declared. */
  get chains(): readonly FheChain[] {
    return [...this.#chains.values()];
  }

  /** The currently active chain. Changes via {@link switchChain}. */
  get chain(): FheChain {
    const chain = this.#chains.get(this.#chainId);
    assertNonNullable(chain, "ChainRouter: chain");
    return chain;
  }

  /** The {@link RelayerSDK} bound to the active chain. */
  get relayer(): RelayerSDK {
    const relayer = this.#relayers.get(this.#chainId);
    assertNonNullable(relayer, "ChainRouter: active relayer");
    return relayer;
  }

  /**
   * The {@link RelayerSDK} bound to a specific chain, independent of the active one.
   *
   * @throws if no chain with this id is registered. {@link ConfigurationError}
   */
  relayerForChain(chainId: number): RelayerSDK {
    const relayer = this.#relayers.get(chainId);
    if (!relayer) {
      throw new ConfigurationError(
        `No relayer configured for chain ${chainId}. Add it to the chains array.`,
      );
    }
    return relayer;
  }

  /**
   * Make `chainId` the active chain. Subsequent {@link chain} / {@link relayer} reads
   * resolve to it.
   *
   * @throws if no chain with this id is registered. {@link ConfigurationError}
   */
  switchChain(chainId: number): void {
    if (!this.#chains.has(chainId)) {
      throw new ConfigurationError(
        `No relayer configured for chain ${chainId}. Add it to the chains array.`,
      );
    }
    this.#chainId = chainId;
  }

  /**
   * Tear down every relayer cache and worker. Safe to call once at SDK shutdown.
   *
   * @throws if one or more terminations fail; all are attempted regardless. {@link AggregateError}
   */
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

  /** Enables `using router = new ChainRouter(...)` — delegates to {@link terminate}. */
  [Symbol.dispose](): void {
    this.terminate();
  }
}
