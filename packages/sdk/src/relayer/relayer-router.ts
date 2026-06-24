import type { FheChain } from "../chains/types";
import { resolveChainRelayers } from "../config/resolve";
import type { RelayerConfig } from "../config/types";
import { ConfigurationError } from "../errors";
import { assertNonNullable } from "../utils";
import type { RelayerSDK } from "./types";

/**
 * Multichain router. Owns chain management (chains / chain / switchChain) and
 * hands out the single-chain {@link RelayerSDK} backend for the currently active
 * chain via {@link RelayerRouter.relayer}. Builds one backend per chain from its
 * {@link RelayerConfig}.
 */
export class RelayerRouter {
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

    // One backend per chain. A shared config object can yield the same backend
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
    assertNonNullable(chain, "RelayerRouter: chain");
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

  /** The single-chain backend for the currently active chain. */
  get relayer(): RelayerSDK {
    const relayer = this.#relayers.get(this.#chainId);
    assertNonNullable(relayer, "RelayerRouter: relayer");
    return relayer;
  }
}
