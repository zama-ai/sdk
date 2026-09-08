import type { FheChain } from "./types";
import { resolveChainRelayers } from "../config/resolve";
import type { RelayerConfig } from "../config/types";
import { ConfigurationError } from "../errors";
import type { RelayerSDK } from "../relayer/types";
import type { LoggerService } from "../services/logger-service";

/**
 * Multichain router. Owns chain management (chains / chain / switchChain) and
 * hands out the single-chain {@link RelayerSDK} backend for the currently active
 * chain via {@link ChainRouter.relayer}. Builds one backend per chain from its
 * {@link RelayerConfig}.
 *
 * @internal
 */
export class ChainRouter {
  readonly #chains: Map<number, FheChain>;
  readonly #relayers: Map<number, RelayerSDK>;
  #chainId: number;

  constructor(
    chains: readonly [FheChain, ...FheChain[]],
    configs: Readonly<Record<number, RelayerConfig>>,
    logger: LoggerService,
  ) {
    if (chains.length === 0) {
      throw new ConfigurationError("At least one chain is required.");
    }
    this.#chains = new Map(chains.map((c) => [c.id, c]));
    this.#chainId = chains[0].id;

    // One backend per chain. A caller-supplied createRelayer may return one
    // backend for several chains, so dispose dedupes.
    const relayers = new Map<number, RelayerSDK>();
    for (const [chainId, { relayerConfig, chain }] of resolveChainRelayers(chains, configs)) {
      relayers.set(chainId, relayerConfig.createRelayer(chain, logger));
    }
    this.#relayers = relayers;
  }

  get chains(): readonly FheChain[] {
    return [...this.#chains.values()];
  }

  get chain(): FheChain {
    const chain = this.#chains.get(this.#chainId);
    if (chain === undefined) {
      throw new ConfigurationError(
        `Chain ${this.#chainId} is not configured. Add it to the chains array.`,
      );
    }
    return chain;
  }

  /**
   * Point the router at `chainId`. The active chain follows the wallet even when
   * that chain has no configured backend: the {@link chain} / {@link relayer}
   * getters throw a {@link ConfigurationError} for an unconfigured chain, so an
   * unsupported chain fails loudly at the next operation rather than silently
   * routing to the previously active chain (which would encrypt against, and
   * sign an EIP-712 decryption permit for, the wrong chain's domain and ACL).
   * Switching back to a configured chain restores service.
   */
  switchChain(chainId: number): void {
    this.#chainId = chainId;
  }

  /**
   * Releases every backend's resources, deduping shared instances. Backends
   * stay usable: in-flight work finishes and later calls re-acquire what they need.
   */
  dispose(): void {
    for (const relayer of new Set(this.#relayers.values())) {
      relayer.dispose?.();
    }
  }

  /** The single-chain backend for the currently active chain. */
  get relayer(): RelayerSDK {
    const relayer = this.#relayers.get(this.chain.id);
    if (relayer === undefined) {
      throw new ConfigurationError(
        `No relayer configured for chain ${this.#chainId}. Add it to the relayers object.`,
      );
    }
    return relayer;
  }
}
