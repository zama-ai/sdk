# Wagmi-Inspired Config Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add compile-time chain↔transport enforcement via const generics and lazy relayer initialization in CompositeRelayer.

**Architecture:** Thread a `TChains` const generic through config types so TypeScript rejects missing transport entries. Replace eager relayer construction in `buildRelayer` with lazy construction inside `CompositeRelayer.#current()`. Remove `buildRelayer` from the public API.

**Tech Stack:** TypeScript (const generics, mapped types), vitest

---

## File Structure

| File                                                | Action | Responsibility                                                                           |
| --------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| `packages/sdk/src/chains/types.ts`                  | Modify | Add `TId` generic to `FheChain`                                                          |
| `packages/sdk/src/chains/utils.ts`                  | Modify | Preserve literal `chainId` in `toFheChain` return type                                   |
| `packages/sdk/src/config/types.ts`                  | Modify | Add `TChains` generic to all config interfaces                                           |
| `packages/sdk/src/config/resolve.ts`                | Modify | Delete `buildRelayer`, export `CompositeRelayer` constructor helper                      |
| `packages/sdk/src/config/index.ts`                  | Modify | Add const generic, replace `buildRelayer` with direct `CompositeRelayer`, update exports |
| `packages/sdk/src/relayer/composite-relayer.ts`     | Modify | Accept config map, construct relayers lazily                                             |
| `packages/react-sdk/src/wagmi/config.ts`            | Modify | Replace `buildRelayer` with `CompositeRelayer`, add `TChains` generic                    |
| `packages/sdk/src/config/__tests__/resolve.test.ts` | Modify | Update tests for lazy init, remove `buildRelayer` tests                                  |
| `packages/sdk/src/config/__tests__/types.test-d.ts` | Create | Type-level tests for chain↔transport enforcement                                         |

---

### Task 1: Add `TId` generic to `FheChain` and fix `toFheChain`

**Files:**

- Modify: `packages/sdk/src/chains/types.ts:1-5`
- Modify: `packages/sdk/src/chains/utils.ts:1-9`

- [ ] **Step 1: Write the type-level test**

Create `packages/sdk/src/config/__tests__/types.test-d.ts`:

```ts
import { describe, expectTypeOf, it } from "vitest";
import { mainnet, sepolia } from "../../chains";
import type { FheChain } from "../../chains";

describe("FheChain", () => {
  it("preset chains carry literal id types", () => {
    expectTypeOf(sepolia.id).toEqualTypeOf<11155111>();
    expectTypeOf(mainnet.id).toEqualTypeOf<1>();
  });

  it("FheChain<number> is backwards compatible", () => {
    const chain: FheChain = sepolia;
    expectTypeOf(chain.id).toEqualTypeOf<number>();
  });
});
```

- [ ] **Step 2: Run the type test to confirm it fails**

Run: `cd packages/sdk && npx vitest typecheck --run src/config/__tests__/types.test-d.ts`

Expected: FAIL — `sepolia.id` is `number`, not `11155111` (because `toFheChain` erases the literal).

- [ ] **Step 3: Add `TId` generic to `FheChain`**

Replace `packages/sdk/src/chains/types.ts` entirely:

```ts
import type { ExtendedFhevmInstanceConfig } from "../relayer/relayer-utils";

export interface FheChain<TId extends number = number> extends Omit<
  ExtendedFhevmInstanceConfig,
  "chainId"
> {
  readonly id: TId;
}
```

- [ ] **Step 4: Update `toFheChain` to preserve literal `chainId`**

Replace `packages/sdk/src/chains/utils.ts` entirely:

```ts
import type { ExtendedFhevmInstanceConfig } from "../relayer/relayer-utils";
import type { FheChain } from "./types";

export function toFheChain<T extends ExtendedFhevmInstanceConfig>({
  chainId,
  ...config
}: T): FheChain<T["chainId"]> {
  return { ...config, id: chainId } as FheChain<T["chainId"]>;
}
```

- [ ] **Step 5: Run the type test to confirm it passes**

Run: `cd packages/sdk && npx vitest typecheck --run src/config/__tests__/types.test-d.ts`

Expected: PASS

- [ ] **Step 6: Run full typecheck to confirm no regressions**

Run: `cd packages/sdk && npx tsc --noEmit`

Expected: PASS (the `FheChain` default of `number` keeps all existing usages valid).

- [ ] **Step 7: Commit**

```bash
git add packages/sdk/src/chains/types.ts packages/sdk/src/chains/utils.ts packages/sdk/src/config/__tests__/types.test-d.ts
git commit -m "feat(sdk): add TId generic to FheChain, preserve literal chainId in toFheChain"
```

---

### Task 2: Thread `TChains` generic through config types

**Files:**

- Modify: `packages/sdk/src/config/types.ts:1-58`

- [ ] **Step 1: Add type-level tests for chain↔transport enforcement**

Append to `packages/sdk/src/config/__tests__/types.test-d.ts`:

```ts
import { web, cleartext } from "../transports";
import type { ZamaConfigBase, CreateZamaConfigBaseParams } from "../types";
import type { GenericSigner } from "../../types";

describe("ZamaConfigBase transports", () => {
  it("requires transport for every chain in the tuple", () => {
    type Cfg = ZamaConfigBase<readonly [typeof sepolia, typeof mainnet]>;
    expectTypeOf<Cfg["transports"]>().toEqualTypeOf<{
      [K in 11155111 | 1]: import("../transports").TransportConfig;
    }>();
  });

  it("rejects missing transport keys", () => {
    // @ts-expect-error — mainnet transport missing
    const _bad: ZamaConfigBase<readonly [typeof sepolia, typeof mainnet]> = {
      chains: [sepolia, mainnet],
      transports: { [sepolia.id]: web() },
    };
  });

  it("accepts complete transport map", () => {
    const _good: ZamaConfigBase<readonly [typeof sepolia, typeof mainnet]> = {
      chains: [sepolia, mainnet],
      transports: { [sepolia.id]: web(), [mainnet.id]: web() },
    };
  });
});
```

- [ ] **Step 2: Run the type test to confirm it fails**

Run: `cd packages/sdk && npx vitest typecheck --run src/config/__tests__/types.test-d.ts`

Expected: FAIL — `ZamaConfigBase` doesn't accept a generic yet.

- [ ] **Step 3: Add `TChains` generic to all config interfaces**

Replace `packages/sdk/src/config/types.ts` entirely:

```ts
import type { Provider, Signer } from "ethers";
import type { EIP1193Provider, PublicClient, WalletClient } from "viem";
import type { FheChain } from "../chains";
import type { ZamaSDKEventListener } from "../events";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { GenericSigner, GenericStorage } from "../types";
import type { TransportConfig } from "./transports";

/** At least one chain is required. */
type AtLeastOneChain = readonly [FheChain, ...FheChain[]];

/** Shared options across all adapter paths. */
export interface ZamaConfigBase<TChains extends AtLeastOneChain = AtLeastOneChain> {
  /** FHE chain configurations. Defines which chains support FHE operations. */
  chains: TChains;
  /** Per-chain transport configuration. Every chain must have a transport entry. */
  transports: { [K in TChains[number]["id"]]: TransportConfig };
  /** Credential storage. Default: IndexedDB in browser, memory in Node. */
  storage?: GenericStorage;
  /** Session storage. Default: IndexedDB in browser, memory in Node. */
  sessionStorage?: GenericStorage;
  /** ML-KEM keypair TTL in seconds. Default: 2592000 (30 days). */
  keypairTTL?: number;
  /** Session signature TTL in seconds. Default: 2592000 (30 days). */
  sessionTTL?: number | "infinite";
  /** Registry cache TTL in seconds. Default: 86400 (24h). */
  registryTTL?: number;
  /** SDK lifecycle event listener. */
  onEvent?: ZamaSDKEventListener;
}

/** Viem path — takes native viem clients. */
export interface ZamaConfigViem<
  TChains extends AtLeastOneChain = AtLeastOneChain,
> extends ZamaConfigBase<TChains> {
  viem: {
    publicClient: PublicClient;
    walletClient?: WalletClient;
    ethereum?: EIP1193Provider;
  };
  relayer?: never;
  signer?: never;
  ethers?: never;
}

/** Ethers path — takes native ethers types. */
export interface ZamaConfigEthers<
  TChains extends AtLeastOneChain = AtLeastOneChain,
> extends ZamaConfigBase<TChains> {
  ethers: { ethereum: EIP1193Provider } | { signer: Signer } | { provider: Provider };
  relayer?: never;
  signer?: never;
  viem?: never;
}

/** Custom GenericSigner with explicit transports. */
export interface ZamaConfigCustomSigner<
  TChains extends AtLeastOneChain = AtLeastOneChain,
> extends ZamaConfigBase<TChains> {
  signer: GenericSigner;
  relayer?: never;
  viem?: never;
  ethers?: never;
}

/** Config params accepted by the base SDK (no wagmi). */
export type CreateZamaConfigBaseParams<TChains extends AtLeastOneChain = AtLeastOneChain> =
  | ZamaConfigViem<TChains>
  | ZamaConfigEthers<TChains>
  | ZamaConfigCustomSigner<TChains>;

/** @internal Nominal brand — prevents constructing ZamaConfig as a plain object literal. */
declare const __brand: unique symbol;

/** Opaque config object returned by {@link createZamaConfig}. */
export interface ZamaConfig {
  /** @internal */ readonly [__brand]: true;
  /** @internal */ readonly chains: readonly FheChain[];
  /** @internal */ readonly relayer: RelayerSDK;
  /** @internal */ readonly signer: GenericSigner;
  /** @internal */ readonly storage: GenericStorage;
  /** @internal */ readonly sessionStorage: GenericStorage;
  /** @internal */ readonly keypairTTL: number | undefined;
  /** @internal */ readonly sessionTTL: number | "infinite" | undefined;
  /** @internal */ readonly registryTTL: number | undefined;
  /** @internal */ readonly onEvent: ZamaSDKEventListener | undefined;
}
```

- [ ] **Step 4: Run the type test to confirm it passes**

Run: `cd packages/sdk && npx vitest typecheck --run src/config/__tests__/types.test-d.ts`

Expected: PASS

- [ ] **Step 5: Run full typecheck to confirm no regressions**

Run: `cd packages/sdk && npx tsc --noEmit`

Expected: PASS (defaults keep existing usages valid).

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/config/types.ts packages/sdk/src/config/__tests__/types.test-d.ts
git commit -m "feat(sdk): thread TChains generic through config types for compile-time transport enforcement"
```

---

### Task 3: Add const generic to `createZamaConfig`

**Files:**

- Modify: `packages/sdk/src/config/index.ts:39-60`

- [ ] **Step 1: Add type-level test for `createZamaConfig` inference**

Append to `packages/sdk/src/config/__tests__/types.test-d.ts`:

```ts
import { createZamaConfig } from "..";

describe("createZamaConfig", () => {
  it("infers chain IDs and requires matching transports", () => {
    // This should type-error — mainnet transport missing.
    // @ts-expect-error
    createZamaConfig({
      chains: [sepolia, mainnet],
      transports: { [sepolia.id]: web() },
      signer: {} as GenericSigner,
    });
  });

  it("accepts complete config", () => {
    createZamaConfig({
      chains: [sepolia],
      transports: { [sepolia.id]: web() },
      signer: {} as GenericSigner,
    });
  });
});
```

- [ ] **Step 2: Run the type test to confirm the `@ts-expect-error` test fails**

Run: `cd packages/sdk && npx vitest typecheck --run src/config/__tests__/types.test-d.ts`

Expected: FAIL — `@ts-expect-error` is unused because `createZamaConfig` doesn't enforce generics yet.

- [ ] **Step 3: Add const generic to `createZamaConfig`**

In `packages/sdk/src/config/index.ts`, replace the function signature and add the `FheChain` import:

Replace line 22-23:

```ts
import type { CreateZamaConfigBaseParams, ZamaConfig } from "./types";
import { resolveStorage, resolveSigner, resolveChainTransports, buildRelayer } from "./resolve";
```

With:

```ts
import type { FheChain } from "../chains";
import type { CreateZamaConfigBaseParams, ZamaConfig } from "./types";
import { resolveStorage, resolveSigner, resolveChainTransports, buildRelayer } from "./resolve";
```

Replace lines 39-60 (the function):

```ts
export function createZamaConfig<const TChains extends readonly [FheChain, ...FheChain[]]>(
  params: CreateZamaConfigBaseParams<TChains>,
): ZamaConfig {
  const { storage, sessionStorage } = resolveStorage(params.storage, params.sessionStorage);
  const signer = resolveSigner(params as CreateZamaConfigBaseParams);
  const chainTransports = resolveChainTransports(
    params.chains as FheChain[],
    params.transports as Record<number, import("./transports").TransportConfig>,
    (params.chains as FheChain[]).map((c) => c.id),
  );
  const relayer = buildRelayer(chainTransports, () => signer.getChainId());

  return {
    chains: params.chains,
    relayer,
    signer,
    storage,
    sessionStorage,
    keypairTTL: params.keypairTTL,
    sessionTTL: params.sessionTTL,
    registryTTL: params.registryTTL,
    onEvent: params.onEvent,
  } as unknown as ZamaConfig;
}
```

Note: The `as` casts widen the const-generic types back to the runtime types expected by `resolveSigner` and `resolveChainTransports`. This is safe — the generics only exist for call-site checking, not internal logic.

- [ ] **Step 4: Run the type test to confirm it passes**

Run: `cd packages/sdk && npx vitest typecheck --run src/config/__tests__/types.test-d.ts`

Expected: PASS

- [ ] **Step 5: Run full typecheck across all packages**

Run: `pnpm run --parallel --recursive '/^typecheck/'`

Expected: PASS

- [ ] **Step 6: Run existing tests to confirm no runtime regressions**

Run: `cd packages/sdk && npx vitest run src/config/__tests__/resolve.test.ts`

Expected: PASS (runtime behavior unchanged)

- [ ] **Step 7: Commit**

```bash
git add packages/sdk/src/config/index.ts packages/sdk/src/config/__tests__/types.test-d.ts
git commit -m "feat(sdk): add const generic to createZamaConfig for compile-time transport enforcement"
```

---

### Task 4: Make `CompositeRelayer` construct relayers lazily

**Files:**

- Modify: `packages/sdk/src/relayer/composite-relayer.ts:27-64`

- [ ] **Step 1: Write the lazy-init test**

Create a new test section. Append to `packages/sdk/src/config/__tests__/resolve.test.ts`, replacing the existing `buildRelayer` describe block. First, add the needed imports at the top of the file after existing imports:

Add after line 21 (`const { resolveChainTransports, buildRelayer } = await import("../resolve");`):

```ts
const { CompositeRelayer } = await import("../../relayer/composite-relayer");
const { relayersMap } = await import("../relayers");
```

Then replace the entire `describe("buildRelayer", ...)` block (lines 107-156) with:

```ts
describe("CompositeRelayer (lazy init)", () => {
  it("does not call transport handler at construction time", () => {
    const handlerSpy = vi.fn();
    const origWeb = relayersMap.get("web")!;
    relayersMap.set("web", handlerSpy);

    const transports = resolveChainTransports([sepoliaChain], { [11155111]: web() }, [11155111]);
    new CompositeRelayer(() => Promise.resolve(11155111), transports);

    expect(handlerSpy).not.toHaveBeenCalled();
    relayersMap.set("web", origWeb);
  });

  it("calls transport handler on first SDK operation", async () => {
    const transports = resolveChainTransports([sepoliaChain], { [11155111]: web() }, [11155111]);
    const relayer = new CompositeRelayer(() => Promise.resolve(11155111), transports);

    // generateKeypair triggers #current() which triggers lazy init
    await relayer.generateKeypair();
    // If we get here without error, the handler was called and RelayerWeb mock was constructed
  });

  it("throws for unconfigured chain on first use", async () => {
    const transports = resolveChainTransports([sepoliaChain], { [11155111]: web() }, [11155111]);
    const relayer = new CompositeRelayer(() => Promise.resolve(999999), transports);

    await expect(relayer.generateKeypair()).rejects.toThrow(
      "No relayer configured for chain 999999",
    );
  });

  it("throws for unregistered transport handler on first use", async () => {
    const transports = resolveChainTransports([sepoliaChain], { [11155111]: node() }, [11155111]);
    const relayer = new CompositeRelayer(() => Promise.resolve(11155111), transports);

    await expect(relayer.generateKeypair()).rejects.toThrow(
      'No transport handler registered for type "node"',
    );
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd packages/sdk && npx vitest run src/config/__tests__/resolve.test.ts`

Expected: FAIL — `CompositeRelayer` still expects `Map<number, Promise<RelayerSDK>>`, not `Map<number, ResolvedChainTransport>`.

- [ ] **Step 3: Rewrite `CompositeRelayer` for lazy init**

Replace `packages/sdk/src/relayer/composite-relayer.ts` entirely:

```ts
import type {
  InputProofBytesType,
  KeypairType,
  KmsDelegatedUserDecryptEIP712Type,
  ZKProofLike,
} from "@zama-fhe/relayer-sdk/bundle";
import type { Address, Hex } from "viem";
import { ConfigurationError } from "../errors";
import { relayersMap } from "../config/relayers";
import type { ResolvedChainTransport } from "../config/resolve";
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
  UserDecryptParams,
} from "./relayer-sdk.types";

/**
 * Dispatches RelayerSDK calls to the correct per-chain relayer based on the
 * current chain ID. Relayers are constructed lazily on first use per chain.
 * Supports mixed modes (e.g. RelayerWeb on mainnet + RelayerCleartext on a
 * testnet) within a single SDK instance.
 */
export class CompositeRelayer implements RelayerSDK {
  readonly #configs: Map<number, ResolvedChainTransport>;
  readonly #resolved = new Map<number, RelayerSDK>();
  readonly #pending = new Map<number, Promise<RelayerSDK>>();
  readonly #resolveChainId: () => Promise<number>;

  constructor(resolveChainId: () => Promise<number>, configs: Map<number, ResolvedChainTransport>) {
    this.#resolveChainId = resolveChainId;
    this.#configs = new Map(configs);
  }

  async #current(): Promise<RelayerSDK> {
    let chainId: number;
    try {
      chainId = await this.#resolveChainId();
    } catch (cause) {
      throw new ConfigurationError(
        "Failed to resolve the current chain ID. Ensure a wallet is connected.",
        { cause },
      );
    }

    const resolved = this.#resolved.get(chainId);
    if (resolved) return resolved;

    // Deduplicate concurrent init for the same chain
    const pending = this.#pending.get(chainId);
    if (pending) return pending;

    const config = this.#configs.get(chainId);
    if (!config) {
      throw new ConfigurationError(
        `No relayer configured for chain ${chainId}. ` +
          `Add it to the chains array and transports map.`,
      );
    }

    const handler = relayersMap.get(config.transport.type);
    if (!handler) {
      const hint =
        config.transport.type === "node"
          ? ' Import "@zama-fhe/sdk/node" to enable Node.js transports.'
          : "";
      throw new ConfigurationError(
        `No transport handler registered for type "${config.transport.type}".${hint}`,
      );
    }

    const promise = handler(config.chain, config.transport).then((relayer) => {
      this.#resolved.set(chainId, relayer);
      this.#pending.delete(chainId);
      return relayer;
    });
    this.#pending.set(chainId, promise);
    return promise;
  }

  async generateKeypair(): Promise<KeypairType<Hex>> {
    return (await this.#current()).generateKeypair();
  }

  async createEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays?: number,
  ): Promise<EIP712TypedData> {
    return (await this.#current()).createEIP712(
      publicKey,
      contractAddresses,
      startTimestamp,
      durationDays,
    );
  }

  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    return (await this.#current()).encrypt(params);
  }

  async userDecrypt(params: UserDecryptParams): Promise<Readonly<Record<Handle, ClearValueType>>> {
    return (await this.#current()).userDecrypt(params);
  }

  async publicDecrypt(handles: Handle[]): Promise<PublicDecryptResult> {
    return (await this.#current()).publicDecrypt(handles);
  }

  async createDelegatedUserDecryptEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    delegatorAddress: Address,
    startTimestamp: number,
    durationDays?: number,
  ): Promise<KmsDelegatedUserDecryptEIP712Type> {
    return (await this.#current()).createDelegatedUserDecryptEIP712(
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp,
      durationDays,
    );
  }

  async delegatedUserDecrypt(
    params: DelegatedUserDecryptParams,
  ): Promise<Readonly<Record<Handle, ClearValueType>>> {
    return (await this.#current()).delegatedUserDecrypt(params);
  }

  async requestZKProofVerification(zkProof: ZKProofLike): Promise<InputProofBytesType> {
    return (await this.#current()).requestZKProofVerification(zkProof);
  }

  async getPublicKey(): Promise<{
    publicKeyId: string;
    publicKey: Uint8Array;
  } | null> {
    return (await this.#current()).getPublicKey();
  }

  async getPublicParams(
    bits: number,
  ): Promise<{ publicParams: Uint8Array; publicParamsId: string } | null> {
    return (await this.#current()).getPublicParams(bits);
  }

  async getAclAddress(): Promise<Address> {
    return (await this.#current()).getAclAddress();
  }

  terminate(): void {
    const errors: Error[] = [];
    for (const r of new Set(this.#resolved.values())) {
      try {
        r.terminate();
      } catch (e) {
        errors.push(toError(e));
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more relayers failed to terminate");
    }
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd packages/sdk && npx vitest run src/config/__tests__/resolve.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/relayer/composite-relayer.ts packages/sdk/src/config/__tests__/resolve.test.ts
git commit -m "feat(sdk): lazy relayer construction in CompositeRelayer"
```

---

### Task 5: Delete `buildRelayer` and update `createZamaConfig`

**Files:**

- Modify: `packages/sdk/src/config/resolve.ts:131-169` (delete `buildRelayer`)
- Modify: `packages/sdk/src/config/index.ts:18-47` (update exports and `createZamaConfig`)

- [ ] **Step 1: Delete `buildRelayer` from `resolve.ts`**

In `packages/sdk/src/config/resolve.ts`, remove these imports that are only used by `buildRelayer`:

Remove from the imports:

```ts
import { CompositeRelayer } from "../relayer/composite-relayer";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import { relayersMap } from "./relayers";
```

Then delete the entire `buildRelayer` function and its section comment (lines 131-169):

```ts
// ── Relayer building ─────────────────────────────────────────────────────────

export function buildRelayer(
  ...
}
```

- [ ] **Step 2: Update `config/index.ts` exports and `createZamaConfig`**

Replace `packages/sdk/src/config/index.ts` entirely:

````ts
export { web, cleartext } from "./transports";
export type {
  WebTransportConfig,
  NodeTransportConfig,
  CleartextTransportConfig,
  TransportConfig,
} from "./transports";

export type {
  ZamaConfig,
  ZamaConfigBase,
  ZamaConfigViem,
  ZamaConfigEthers,
  ZamaConfigCustomSigner,
  CreateZamaConfigBaseParams,
} from "./types";

export { resolveChainTransports, resolveStorage } from "./resolve";
export { registerRelayer as registerTransportHandler } from "./relayers";
export type { ConfigWithTransports, ResolvedChainTransport } from "./resolve";

import type { FheChain } from "../chains";
import { CompositeRelayer } from "../relayer/composite-relayer";
import type { TransportConfig } from "./transports";
import type { CreateZamaConfigBaseParams, ZamaConfig } from "./types";
import { resolveStorage, resolveSigner, resolveChainTransports } from "./resolve";

/**
 * Create a {@link ZamaConfig} that wires together relayer, signer, and storage.
 *
 * @example
 * ```ts
 * import { sepolia } from "@zama-fhe/sdk/chains";
 * const config = createZamaConfig({
 *   chains: [sepolia],
 *   signer,
 *   transports: { [sepolia.id]: web({ relayerUrl: "https://relayer.testnet.zama.org/v2" }) },
 * });
 * const sdk = new ZamaSDK(config);
 * ```
 */
export function createZamaConfig<const TChains extends readonly [FheChain, ...FheChain[]]>(
  params: CreateZamaConfigBaseParams<TChains>,
): ZamaConfig {
  const { storage, sessionStorage } = resolveStorage(params.storage, params.sessionStorage);
  const signer = resolveSigner(params as CreateZamaConfigBaseParams);
  const chainTransports = resolveChainTransports(
    params.chains as FheChain[],
    params.transports as Record<number, TransportConfig>,
    (params.chains as FheChain[]).map((c) => c.id),
  );
  const relayer = new CompositeRelayer(() => signer.getChainId(), chainTransports);

  return {
    chains: params.chains,
    relayer,
    signer,
    storage,
    sessionStorage,
    keypairTTL: params.keypairTTL,
    sessionTTL: params.sessionTTL,
    registryTTL: params.registryTTL,
    onEvent: params.onEvent,
  } as unknown as ZamaConfig;
}
````

- [ ] **Step 3: Run full typecheck**

Run: `pnpm run --parallel --recursive '/^typecheck/'`

Expected: May FAIL in react-sdk due to missing `buildRelayer` import — that's expected and fixed in Task 6.

- [ ] **Step 4: Run SDK tests**

Run: `cd packages/sdk && npx vitest run src/config/__tests__/resolve.test.ts`

Expected: FAIL — test file still imports `buildRelayer`. That's expected and fixed in the next step.

- [ ] **Step 5: Update resolve.test.ts to remove `buildRelayer` import**

In `packages/sdk/src/config/__tests__/resolve.test.ts`, replace line 21:

```ts
const { resolveChainTransports, buildRelayer } = await import("../resolve");
```

With:

```ts
const { resolveChainTransports } = await import("../resolve");
```

The `buildRelayer` tests were already replaced in Task 4 Step 1 with the lazy-init tests.

- [ ] **Step 6: Run SDK tests to confirm pass**

Run: `cd packages/sdk && npx vitest run src/config/__tests__/resolve.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/sdk/src/config/resolve.ts packages/sdk/src/config/index.ts packages/sdk/src/config/__tests__/resolve.test.ts
git commit -m "feat(sdk)!: remove buildRelayer, wire lazy CompositeRelayer into createZamaConfig"
```

---

### Task 6: Update react-sdk wagmi adapter

**Files:**

- Modify: `packages/react-sdk/src/wagmi/config.ts:1-44`

- [ ] **Step 1: Update wagmi config to use CompositeRelayer directly**

Replace `packages/react-sdk/src/wagmi/config.ts` entirely:

```ts
import {
  resolveChainTransports,
  resolveStorage,
  type GenericSigner,
  type ResolvedChainTransport,
  type TransportConfig,
  type ZamaConfig,
  type ZamaConfigBase,
} from "@zama-fhe/sdk";
import type { FheChain } from "@zama-fhe/sdk/chains";
import { CompositeRelayer } from "@zama-fhe/sdk/relayer/composite-relayer";
import type { Config } from "wagmi";
import { getChainId } from "wagmi/actions";
import { WagmiSigner } from "./wagmi-signer";

/** Wagmi-backed config — signer derived from wagmi Config. */
export interface ZamaConfigWagmi<T = Config> extends ZamaConfigBase {
  wagmiConfig: T;
  relayer?: never;
  signer?: never;
  viem?: never;
  ethers?: never;
}

/** Create a {@link ZamaConfig} from a wagmi `Config`. */
export function createZamaConfig(params: ZamaConfigWagmi): ZamaConfig {
  const { wagmiConfig } = params;
  const signer: GenericSigner = new WagmiSigner({ config: wagmiConfig });
  const getChainIdFn = () => Promise.resolve(getChainId(wagmiConfig));

  const chainIds = wagmiConfig.chains.map((c) => c.id);
  const { storage, sessionStorage } = resolveStorage(params.storage, params.sessionStorage);
  const chainTransports = resolveChainTransports(
    params.chains as FheChain[],
    params.transports as Record<number, TransportConfig>,
    chainIds,
  );
  const relayer = new CompositeRelayer(getChainIdFn, chainTransports);

  return {
    chains: params.chains,
    relayer,
    signer,
    storage,
    sessionStorage,
    keypairTTL: params.keypairTTL,
    sessionTTL: params.sessionTTL,
    registryTTL: params.registryTTL,
    onEvent: params.onEvent,
  } as unknown as ZamaConfig;
}
```

Note: The `CompositeRelayer` import path depends on the SDK's package exports. If `@zama-fhe/sdk/relayer/composite-relayer` is not an exported subpath, import it from the main entry point instead. Check `packages/sdk/package.json` exports field — if `CompositeRelayer` isn't exported, add it to the SDK's public exports in `packages/sdk/src/config/index.ts`:

```ts
export { CompositeRelayer } from "../relayer/composite-relayer";
```

- [ ] **Step 2: Run full typecheck across all packages**

Run: `pnpm run --parallel --recursive '/^typecheck/'`

Expected: PASS

- [ ] **Step 3: Run all tests**

Run: `pnpm run --parallel --recursive '/^test/'`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/react-sdk/src/wagmi/config.ts packages/sdk/src/config/index.ts
git commit -m "feat(react-sdk): update wagmi adapter to use lazy CompositeRelayer"
```

---

### Task 7: Update API reports

**Files:**

- Modify: `packages/sdk/etc/sdk.api.md` (auto-generated)

- [ ] **Step 1: Regenerate API reports**

Run: `pnpm run --recursive '/^api/'` or the equivalent api-extractor command used in this project. Check `package.json` scripts for the exact command.

- [ ] **Step 2: Review the diff**

Verify:

- `buildRelayer` is removed from the API report
- `ResolvedChainTransport` is now properly exported (fixes the `ae-forgotten-export` warning)
- `FheChain` shows the `TId` generic parameter
- `ZamaConfigBase` and variants show the `TChains` generic parameter
- `createZamaConfig` shows the const generic signature
- `CompositeRelayer` appears if it was added to exports

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/etc/ packages/react-sdk/etc/
git commit -m "chore(sdk): update API reports after wagmi-inspired config improvements"
```
