// oxlint-disable no-empty-pattern
// oxlint-disable eslint-plugin-react-hooks/rules-of-hooks
import { vi } from "vitest";
import { ChainRouter } from "../chains/router";
import type { FheChain } from "../chains/types";
import type { RelayerSDK } from "../relayer/types";
import { LoggerService } from "../services/logger-service";
import { createMockChain } from "./chain";
import { createMockRelayer } from "./relayer";
import type { FixturesOf } from "./types";

export interface CreateMockRouterOverrides {
  /** Chains the router knows about. Defaults to a single chain `31337`. */
  chains?: readonly [FheChain, ...FheChain[]];
  /** Single backend shared by every chain. Falls back to a fresh mock relayer. */
  relayer?: RelayerSDK;
  /** Per-chain backends, keyed by chain id. Takes precedence over `relayer`. */
  relayers?: Record<number, RelayerSDK>;
  /** Initially active chain id. Defaults to the first chain. */
  activeChainId?: number;
  /**
   * Custom `switchChain`. Defaults to a `vi.fn` that updates the active chain
   * (so `router.relayer` / `router.chain` reflect the switch). Pass your own to
   * observe ordering or inject side effects — you then own the active-chain state.
   */
  switchChain?: ChainRouter["switchChain"];
}

/**
 * A real {@link ChainRouter} subclass for tests. It overrides chain/backend
 * resolution with controllable mock state, so it is `instanceof ChainRouter`
 * and needs no unsafe cast. Unlike the base it does not validate chain ids on
 * `switchChain`, letting unit tests drive arbitrary chains; the genuine
 * construction/validation path stays covered by the `ChainRouter` and
 * multichain integration suites.
 */
class MockChainRouter extends ChainRouter {
  readonly #chainList: readonly [FheChain, ...FheChain[]];
  readonly #backends: Map<number, RelayerSDK>;
  readonly #backendFor: (id: number) => RelayerSDK;
  readonly #switchChainImpl: ChainRouter["switchChain"];
  #activeChainId: number;

  constructor(overrides: CreateMockRouterOverrides) {
    const chains: readonly [FheChain, ...FheChain[]] = overrides.chains ?? [
      createMockChain({ id: 31337 }),
    ];
    const backendFor = (id: number): RelayerSDK =>
      overrides.relayers?.[id] ?? overrides.relayer ?? createMockRelayer();

    const configs = Object.fromEntries(
      chains.map((c) => [
        c.id,
        { type: "web", createRelayer: (chain: FheChain) => backendFor(chain.id) },
      ]),
    );
    // The base constructor builds one backend per chain; hand it a config that
    // returns our mock backends so construction succeeds. The getters below
    // route off our own state, so the base's maps are never read.
    super(chains, configs, new LoggerService());

    this.#chainList = chains;
    this.#activeChainId = overrides.activeChainId ?? chains[0].id;
    this.#backendFor = backendFor;
    this.#backends = new Map(chains.map((c) => [c.id, backendFor(c.id)]));
    this.#switchChainImpl =
      overrides.switchChain ??
      vi.fn((id: number) => {
        this.#activeChainId = id;
      });
  }

  override get chains(): readonly FheChain[] {
    return this.#chainList;
  }

  override get chain(): FheChain {
    return this.#chainList.find((c) => c.id === this.#activeChainId) ?? this.#chainList[0];
  }

  override get relayer(): RelayerSDK {
    let backend = this.#backends.get(this.#activeChainId);
    if (!backend) {
      backend = this.#backendFor(this.#activeChainId);
      this.#backends.set(this.#activeChainId, backend);
    }
    return backend;
  }

  override switchChain(chainId: number): void {
    this.#switchChainImpl(chainId);
  }
}

/**
 * Build a controllable mock {@link ChainRouter} for tests. See
 * {@link MockChainRouter}.
 */
export function createMockRouter(overrides: CreateMockRouterOverrides = {}): ChainRouter {
  return new MockChainRouter(overrides);
}

export interface RouterFixtures {
  router: ChainRouter;
  createMockRouter: typeof createMockRouter;
}

export const routerFixtures: FixturesOf<RouterFixtures> = {
  router: async ({}, use) => {
    await use(createMockRouter());
  },
  createMockRouter: async ({}, use) => {
    await use(createMockRouter);
  },
};
