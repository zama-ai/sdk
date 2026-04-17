# Single-Chain Relayers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make RelayerWeb and RelayerNode single-chain (one chain config in, one relayer out), removing internal chain-switching logic. Multi-chain orchestration stays in CompositeRelayer via createZamaConfig.

**Architecture:** Replace `{ transports: Record<number, ...>, getChainId }` config with `{ chain: ExtendedFhevmInstanceConfig, ...options }`. Remove `#resolvedChainId`, chain-change detection, and `DefaultConfigs` merge from both relayer classes. Simplify `buildRelayer` in resolve.ts to create one relayer per chain instead of grouping.

**Tech Stack:** TypeScript, vitest, `@zama-fhe/sdk`

---

### Task 1: Update RelayerWebConfig type

**Files:**

- Modify: `packages/sdk/src/relayer/relayer-sdk.types.ts:30-67`

- [ ] **Step 1: Replace RelayerWebConfig**

In `packages/sdk/src/relayer/relayer-sdk.types.ts`, replace the `RelayerWebConfig` interface:

```ts
export interface RelayerWebConfig {
  /** Single chain FHE configuration. Pre-merged — no DefaultConfigs lookup needed. */
  chain: ExtendedFhevmInstanceConfig;
  /** Security options (CSRF, CDN integrity). */
  security?: RelayerWebSecurityConfig;
  /** Optional logger for observing worker lifecycle and request timing. */
  logger?: GenericLogger;
  /**
   * Number of WASM threads for parallel FHE operations inside the Web Worker.
   * Uses `wasm-bindgen-rayon` under the hood via `SharedArrayBuffer`.
   *
   * **Requirements:** The page must be served with COOP/COEP headers:
   * - `Cross-Origin-Opener-Policy: same-origin`
   * - `Cross-Origin-Embedder-Policy: require-corp`
   *
   * 4–8 threads is the practical sweet spot; beyond that, diminishing returns
   * and higher memory usage on low-end devices.
   *
   * When omitted, the relayer SDK uses its default (single-threaded).
   */
  threads?: number;
  /** Called whenever the SDK status changes (e.g. idle → initializing → ready). */
  onStatusChange?: (status: RelayerSDKStatus, error?: Error) => void;
  /**
   * Persistent storage for caching FHE public key and params across sessions.
   *
   * Defaults to `new IndexedDBStorage("FheArtifactCache", 1, "artifacts")`.
   * Pass a custom `IndexedDBStorage` instance to configure the database name,
   * version, or store name. FHE public params can be several MB — avoid
   * `localStorage`-backed storage which caps at ~5 MB.
   *
   * **Not to be confused with `ZamaProvider.storage`** which stores credentials.
   */
  fheArtifactStorage?: GenericStorage;
  /** Cache TTL in seconds for FHE public material. Default: 86 400 (24 h). Set to 0 to revalidate on every operation. Ignored when storage is not set. */
  fheArtifactCacheTTL?: number;
}
```

Add the import for `ExtendedFhevmInstanceConfig` at the top:

```ts
import type { ExtendedFhevmInstanceConfig } from "./relayer-utils";
```

- [ ] **Step 2: Run typecheck to see cascade of errors**

Run: `pnpm typecheck 2>&1 | head -50`
Expected: Type errors in relayer-web.ts (accessing `transports`, `getChainId`)

- [ ] **Step 3: Commit type change**

```
refactor(sdk)!: make RelayerWebConfig single-chain
```

---

### Task 2: Simplify RelayerWeb internals

**Files:**

- Modify: `packages/sdk/src/relayer/relayer-web.ts`

- [ ] **Step 1: Simplify RelayerWeb class**

Remove fields: `#resolvedChainId`

Replace `#getWorkerConfig()` (was async, now sync):

```ts
#getWorkerConfig(): WorkerClientConfig {
  const { chain, security, threads } = this.#config;

  if (threads !== undefined && (!Number.isInteger(threads) || threads < 1)) {
    throw new Error(`Invalid thread count: ${threads}. Must be a positive integer.`);
  }

  if (threads !== undefined && globalThis.SharedArrayBuffer === undefined) {
    this.#config.logger?.warn(
      "threads option requires SharedArrayBuffer (COOP/COEP headers). Falling back to single-threaded.",
    );
  }

  return {
    cdnUrl: CDN_URL,
    fhevmConfig: chain,
    csrfToken: security?.getCsrfToken?.() ?? "",
    integrity: security?.integrityCheck === false ? undefined : CDN_INTEGRITY,
    logger: this.#config.logger,
    thread: threads,
  };
}
```

Replace `#ensureWorkerInner()` — remove chain-switching logic:

```ts
async #ensureWorkerInner(): Promise<RelayerWorkerClient> {
  // Auto-restart after terminate() — supports React StrictMode's
  // unmount→remount cycle and HMR without permanently killing the worker.
  if (this.#terminated) {
    this.#terminated = false;
    this.#workerClient = null;
    this.#initPromise = null;
  }

  // Create cache for current chain.
  // Storage is chain-independent — reuse across chain switches.
  if (!this.#artifactStorage) {
    this.#artifactStorage =
      this.#config.fheArtifactStorage ?? new IndexedDBStorage("FheArtifactCache", 1, "artifacts");
  }
  if (!this.#artifactCache) {
    this.#artifactCache = new FheArtifactCache({
      storage: this.#artifactStorage,
      chainId: this.#config.chain.chainId,
      relayerUrl: this.#config.chain.relayerUrl,
      ttl: this.#config.fheArtifactCacheTTL,
      logger: this.#config.logger,
    });
  }

  // Revalidate cached artifacts if due — never let revalidation block init
  if (this.#artifactCache) {
    let stale = false;
    try {
      stale = await this.#artifactCache.revalidateIfDue();
    } catch (err) {
      this.#config.logger?.warn(
        "Artifact revalidation failed, proceeding with potentially stale cache",
        { error: err instanceof Error ? err.message : String(err) },
      );
    }
    if (stale) {
      this.#config.logger?.info("Cached FHE artifacts are stale — reinitializing");
      this.#tearDown();
    }
  }

  if (!this.#initPromise) {
    this.#setStatus("initializing");
    this.#initPromise = this.#initWorker()
      .then((client) => {
        this.#setStatus("ready");
        return client;
      })
      .catch((error) => {
        this.#initPromise = null;
        const wrappedError =
          error instanceof ZamaError
            ? error
            : new ConfigurationError("Failed to initialize FHE worker", {
                cause: error,
              });
        this.#setStatus("error", wrappedError);
        throw wrappedError;
      });
  }
  return this.#initPromise;
}
```

Replace `#initWorker()` — `#getWorkerConfig()` is now sync:

```ts
async #initWorker(): Promise<RelayerWorkerClient> {
  const workerConfig = this.#getWorkerConfig();
  const client = new RelayerWorkerClient(workerConfig);
  await client.initWorker();
  if (this.#terminated) {
    client.terminate();
    throw new Error("RelayerWeb was terminated during initialization");
  }
  this.#workerClient = client;
  return client;
}
```

Replace `getAclAddress()`:

```ts
async getAclAddress(): Promise<Address> {
  if (!this.#config.chain.aclContractAddress) {
    throw new ConfigurationError(`No ACL address configured for chain ${this.#config.chain.chainId}`);
  }
  return this.#config.chain.aclContractAddress as Address;
}
```

Remove the `DefaultConfigs` import (no longer needed — chain config arrives pre-merged).

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck 2>&1 | head -30`
Expected: RelayerWeb passes. RelayerNode still fails (next task).

- [ ] **Step 3: Commit**

```
refactor(sdk): simplify RelayerWeb to single-chain internals
```

---

### Task 3: Update RelayerNodeConfig and simplify RelayerNode

**Files:**

- Modify: `packages/sdk/src/relayer/relayer-node.ts`

- [ ] **Step 1: Replace RelayerNodeConfig**

```ts
export interface RelayerNodeConfig {
  /** Single chain FHE configuration. Pre-merged — no DefaultConfigs lookup needed. */
  chain: ExtendedFhevmInstanceConfig;
  poolSize?: number;
  /** Optional logger for observing worker lifecycle and request timing. */
  logger?: GenericLogger;
  /**
   * Persistent storage for caching FHE public key and params across sessions.
   * Defaults to `new MemoryStorage()` (in-process, lost on restart).
   * Pass a custom `GenericStorage` with redis for cross-restart persistence.
   */
  fheArtifactStorage?: GenericStorage;
  /** Cache TTL in seconds for FHE public material. Default: 86 400 (24 h). Set to 0 to revalidate on every operation. */
  fheArtifactCacheTTL?: number;
}
```

Add import for `ExtendedFhevmInstanceConfig`:

```ts
import type { ExtendedFhevmInstanceConfig } from "./relayer-utils";
```

- [ ] **Step 2: Simplify RelayerNode class**

Remove fields: `#resolvedChainId`

Replace `#getPoolConfig()` (was async, now sync):

```ts
#getPoolConfig(): NodeWorkerPoolConfig {
  return {
    fhevmConfig: this.#config.chain,
    poolSize: this.#config.poolSize,
    logger: this.#config.logger,
  };
}
```

Replace `#ensurePoolInner()` — remove chain-switching:

```ts
async #ensurePoolInner(): Promise<NodeWorkerPool> {
  if (this.#terminated) {
    throw new ConfigurationError("RelayerNode has been terminated");
  }

  // Create cache for current chain (when storage is provided)
  if (!this.#artifactCache && this.#config.fheArtifactStorage) {
    this.#artifactCache = new FheArtifactCache({
      storage: this.#config.fheArtifactStorage,
      chainId: this.#config.chain.chainId,
      relayerUrl: this.#config.chain.relayerUrl,
      ttl: this.#config.fheArtifactCacheTTL,
      logger: this.#config.logger,
    });
  }

  // Revalidate cached artifacts if due — never let revalidation block init
  if (this.#artifactCache) {
    let stale = false;
    try {
      stale = await this.#artifactCache.revalidateIfDue();
    } catch (err) {
      this.#config.logger?.warn(
        "Artifact revalidation failed, proceeding with potentially stale cache",
        { error: err instanceof Error ? err.message : String(err) },
      );
    }
    if (stale) {
      this.#config.logger?.info("Cached FHE artifacts are stale — reinitializing");
      this.#tearDown();
    }
  }

  if (!this.#initPromise) {
    this.#initPromise = this.#initPool().catch((error) => {
      this.#initPromise = null;
      throw error instanceof ZamaError
        ? error
        : new ConfigurationError("Failed to initialize FHE worker pool", {
            cause: error,
          });
    });
  }
  return this.#initPromise;
}
```

Replace `#initPool()` — sync config:

```ts
async #initPool(): Promise<NodeWorkerPool> {
  const poolConfig = this.#getPoolConfig();
  const pool = new NodeWorkerPool(poolConfig);
  await pool.initPool();
  if (this.#terminated) {
    pool.terminate();
    throw new Error("RelayerNode was terminated during initialization");
  }
  this.#pool = pool;
  return pool;
}
```

Replace `getAclAddress()`:

```ts
async getAclAddress(): Promise<Address> {
  if (!this.#config.chain.aclContractAddress) {
    throw new ConfigurationError(`No ACL address configured for chain ${this.#config.chain.chainId}`);
  }
  return this.#config.chain.aclContractAddress as Address;
}
```

Remove `DefaultConfigs` import.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck 2>&1 | head -30`
Expected: Errors in resolve.ts (still using old constructor shape) and test files.

- [ ] **Step 4: Commit**

```
refactor(sdk)!: make RelayerNodeConfig single-chain
```

---

### Task 4: Simplify buildRelayer in resolve.ts

**Files:**

- Modify: `packages/sdk/src/config/resolve.ts:135-258`

- [ ] **Step 1: Replace the relayer building section**

Remove: `ChainEntry`, `groupByRelayer`, `HttpRelayerCtor`, `buildHttpGroup`, `toChainEntry`.

Replace with simplified `buildRelayer` that creates one relayer per chain:

```ts
export function buildRelayer(
  chainTransports: Map<number, ResolvedChainTransport>,
  resolveChainId: () => Promise<number>,
): RelayerSDK {
  if (chainTransports.size === 0) {
    throw new ConfigurationError(
      "No chain transports configured. Add at least one chain to the chains array.",
    );
  }

  const perChainRelayers = new Map<number, RelayerSDK>();

  for (const { chain, transport } of chainTransports.values()) {
    if (transport.type === "custom") {
      perChainRelayers.set(chain.chainId, transport.relayer);
      continue;
    }
    if (transport.type === "cleartext") {
      perChainRelayers.set(
        chain.chainId,
        new RelayerCleartext({
          ...chain,
          ...transport.chain,
        } as CleartextConfig),
      );
      continue;
    }

    const merged = { ...chain, ...transport.chain };
    if (!merged.relayerUrl) {
      throw new ConfigurationError(
        `Chain ${chain.chainId} has an empty relayerUrl. ` +
          `Use cleartext() for chains without a relayer.`,
      );
    }

    if (transport.type === "web") {
      perChainRelayers.set(chain.chainId, new RelayerWeb({ chain: merged, ...transport.relayer }));
    }
    if (transport.type === "node") {
      perChainRelayers.set(chain.chainId, new RelayerNode({ chain: merged, ...transport.relayer }));
    }
  }

  const uniqueRelayers = new Set(perChainRelayers.values());
  if (uniqueRelayers.size === 1) {
    const [only] = uniqueRelayers;
    if (only) {
      return only;
    }
  }

  return new CompositeRelayer(resolveChainId, perChainRelayers);
}
```

Note: `resolveChainId` is still passed for `CompositeRelayer` — it needs it to dispatch.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck 2>&1 | head -30`
Expected: Source passes. Test files and examples may still have errors.

- [ ] **Step 3: Commit**

```
refactor(sdk): simplify buildRelayer to create one relayer per chain
```

---

### Task 5: Update unit tests

**Files:**

- Modify: `packages/sdk/src/config/__tests__/resolve.test.ts`
- Modify: `packages/sdk/src/relayer/__tests__/relayer.test.ts`
- Modify: `packages/sdk/src/relayer/__tests__/relayer-utils-eip712.test.ts`
- Delete: `test/playwright/tests/node/chain-switching.node.spec.ts`

- [ ] **Step 1: Update resolve.test.ts mocks**

The mocks for RelayerWeb/RelayerNode now need to accept `{ chain, ...options }` instead of `{ transports, getChainId }`:

```ts
vi.mock(import("../../relayer/relayer-web"), async () => ({
  RelayerWeb: vi.fn().mockImplementation(function (this: any) {
    this.terminate = vi.fn();
  }),
}));

vi.mock(import("../../relayer/relayer-node"), async () => ({
  RelayerNode: vi.fn().mockImplementation(function (this: any) {
    this.terminate = vi.fn();
  }),
}));
```

These mocks are already correct — they don't check the constructor args. No change needed.

Remove the test "creates separate relayers for distinct relayer option references" — relayer grouping no longer exists. Each chain always gets its own relayer.

- [ ] **Step 2: Update relayer.test.ts**

Replace `createWebRelayer`:

```ts
function createWebRelayer(
  overrides: Partial<ConstructorParameters<typeof RelayerWeb>[0]> = {},
): RelayerWeb {
  return new RelayerWeb({
    chain: {
      ...DefaultConfigs[CHAIN_ID],
      relayerUrl: "https://relayer.example.com",
    },
    fheArtifactStorage: new MemoryStorage(),
    ...overrides,
  });
}
```

Replace `createNodeRelayer`:

```ts
function createNodeRelayer(
  overrides: Partial<ConstructorParameters<typeof RelayerNode>[0]> = {},
): RelayerNode {
  return new RelayerNode({
    chain: {
      ...DefaultConfigs[CHAIN_ID],
      relayerUrl: "https://relayer.example.com",
    },
    ...overrides,
  });
}
```

Remove `TRANSPORTS` constant.

- [ ] **Step 3: Update relayer-utils-eip712.test.ts**

Replace `createRelayer`:

```ts
function createRelayer() {
  return new RelayerWeb({
    chain: { chainId: 1 } as any,
  });
}
```

- [ ] **Step 4: Delete chain-switching.node.spec.ts**

Chain switching is now handled by CompositeRelayer, not individual relayers. Delete:
`test/playwright/tests/node/chain-switching.node.spec.ts`

- [ ] **Step 5: Update test app and playwright fixtures**

In `test/test-vite/src/providers.tsx`, replace the RelayerWeb construction:

```ts
const relayer = new RelayerWeb({
  chain: {
    ...HardhatConfig,
    relayerUrl: mockRelayerUrl,
    network: rpcUrl,
    chainId: anvil.id,
  },
  threads: 4,
  security: { integrityCheck: false },
});
```

In `test/test-nextjs/src/providers.tsx`, apply the same pattern (read file first to check current shape).

In `test/playwright/fixtures/node-test.ts`, replace the relayer fixture:

```ts
relayer: async ({ transport }, use) => {
  const relayer = new RelayerNode({
    chain: transport,
    poolSize: 1,
  });
  await use(relayer);
  relayer.terminate();
},
```

In `test/playwright/tests/node/server-bootstrap.node.spec.ts`, `worker-pool-concurrency.node.spec.ts`, `error-handling.node.spec.ts` — update any `new RelayerNode({ getChainId, transports })` to the single-chain `{ chain }` shape (read each file to check exact usage).

- [ ] **Step 6: Run all tests**

Run: `pnpm vitest run packages/sdk/src/config/__tests__/ packages/sdk/src/relayer/__tests__/ packages/react-sdk/src/__tests__/config.test.ts`
Expected: All pass.

Run: `pnpm typecheck`
Expected: All pass.

- [ ] **Step 7: Commit**

```
test(sdk): update tests for single-chain relayer constructors
```

---

### Task 6: Update examples

**Files:**

- Modify: `examples/node-viem/src/index.ts`
- Modify: `examples/node-ethers/src/index.ts`

- [ ] **Step 1: Update node-viem example**

Replace relayer construction to use `{ chain: { ...SepoliaConfig, network: SEPOLIA_RPC_URL, ...(auth && { auth }) } }`.

- [ ] **Step 2: Update node-ethers example**

Same pattern as node-viem.

- [ ] **Step 3: Commit**

```
refactor(examples): update node examples for single-chain relayer config
```
