# Multichain Transport Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add orphaned-transport-key validation, empty-relayerUrl guard, optional relayerKey grouping, and a custom() transport variant to the multichain transport system.

**Architecture:** Three additive changes to the existing `resolveChainTransports` → `buildRelayer` pipeline: two validation guards that throw `ConfigurationError` at config time, a `relayerKey` string field for explicit relayer grouping, and a `custom()` factory that injects a user-provided `RelayerSDK` for a specific chain.

**Tech Stack:** TypeScript, vitest, `@zama-fhe/sdk`

---

### Task 1: Orphaned transport key validation

**Files:**

- Modify: `packages/sdk/src/config/resolve.ts:70-118` (end of `resolveChainTransports`)
- Test: `packages/sdk/src/config/__tests__/resolve.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the `resolveChainTransports` describe block in `packages/sdk/src/config/__tests__/resolve.test.ts`:

```ts
it("throws for orphaned transport keys not in chainIds", () => {
  expect(() =>
    resolveChainTransports([sepoliaChain], { [11155111]: web(), [999]: web() }, [11155111]),
  ).toThrow("Transport entries for chain(s) [999]");
});

it("throws for multiple orphaned transport keys", () => {
  expect(() =>
    resolveChainTransports(
      [sepoliaChain],
      { [11155111]: web(), [999]: web(), [888]: node() },
      [11155111],
    ),
  ).toThrow("Transport entries for chain(s) [999, 888]");
});
```

Also update the existing test that previously allowed orphaned keys:

```ts
// REPLACE the existing "only iterates chainIds, ignoring extra transport keys" test with:
it("throws for transport keys not in chainIds", () => {
  expect(() =>
    resolveChainTransports([sepoliaChain], { [11155111]: web(), [999]: web() }, [11155111]),
  ).toThrow("Transport entries for chain(s) [999]");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/sdk/src/config/__tests__/resolve.test.ts`
Expected: 2 new tests FAIL (no orphan check yet), 1 updated test FAILS

- [ ] **Step 3: Implement orphaned key check**

In `packages/sdk/src/config/resolve.ts`, add after the for-loop (before `return result;` at line 118):

```ts
if (transports) {
  const chainIdSet = new Set(chainIds);
  const orphaned = Object.keys(transports)
    .map(Number)
    .filter((id) => !chainIdSet.has(id));
  if (orphaned.length > 0) {
    throw new ConfigurationError(
      `Transport entries for chain(s) [${orphaned.join(", ")}] have no matching entry ` +
        `in the chains array or wagmi config. Remove them or add the corresponding chain config.`,
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/sdk/src/config/__tests__/resolve.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```
feat(sdk): throw on orphaned transport keys in resolveChainTransports
```

---

### Task 2: Empty relayerUrl guard

**Files:**

- Modify: `packages/sdk/src/config/resolve.ts:180-188` (`toChainEntry` function)
- Test: `packages/sdk/src/config/__tests__/resolve.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the `buildRelayer` describe block in `packages/sdk/src/config/__tests__/resolve.test.ts`:

```ts
it("throws when web transport chain has empty relayerUrl", () => {
  const transports = resolveChainTransports([hoodiChain], { [560048]: web() }, [560048]);
  expect(() => buildRelayer(transports, resolveChainId)).toThrow(
    "Chain 560048 has an empty relayerUrl",
  );
});

it("throws when node transport chain has empty relayerUrl", () => {
  const transports = resolveChainTransports([hoodiChain], { [560048]: node() }, [560048]);
  expect(() => buildRelayer(transports, resolveChainId)).toThrow(
    "Chain 560048 has an empty relayerUrl",
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/sdk/src/config/__tests__/resolve.test.ts`
Expected: 2 new tests FAIL

- [ ] **Step 3: Implement empty relayerUrl guard**

In `packages/sdk/src/config/resolve.ts`, replace the `toChainEntry` function:

```ts
function toChainEntry(
  chain: ExtendedFhevmInstanceConfig,
  transport: WebTransportConfig | NodeTransportConfig,
): ChainEntry {
  const merged = { ...chain, ...transport.chain };
  if (!merged.relayerUrl) {
    throw new ConfigurationError(
      `Chain ${chain.chainId} has an empty relayerUrl. ` +
        `Use cleartext() for chains without a relayer.`,
    );
  }
  return {
    chain: merged,
    relayer: transport.relayer,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/sdk/src/config/__tests__/resolve.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```
feat(sdk): throw on empty relayerUrl with web/node transport
```

---

### Task 3: Add relayerKey to transport types and factories

**Files:**

- Modify: `packages/sdk/src/config/transports.ts`
- Test: `packages/sdk/src/config/__tests__/transports.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `packages/sdk/src/config/__tests__/transports.test.ts`:

```ts
describe("web() with relayerKey", () => {
  it("includes relayerKey when provided", () => {
    expect(web({ relayerUrl: "https://r.example.com" }, undefined, "shared")).toEqual({
      type: "web",
      chain: { relayerUrl: "https://r.example.com" },
      relayer: undefined,
      relayerKey: "shared",
    });
  });

  it("omits relayerKey when not provided", () => {
    const result = web();
    expect(result).not.toHaveProperty("relayerKey");
  });
});

describe("node() with relayerKey", () => {
  it("includes relayerKey when provided", () => {
    expect(node({ relayerUrl: "https://r.example.com" }, undefined, "shared")).toEqual({
      type: "node",
      chain: { relayerUrl: "https://r.example.com" },
      relayer: undefined,
      relayerKey: "shared",
    });
  });

  it("omits relayerKey when not provided", () => {
    const result = node();
    expect(result).not.toHaveProperty("relayerKey");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/sdk/src/config/__tests__/transports.test.ts`
Expected: 2 of 4 new tests FAIL (the "includes relayerKey" ones)

- [ ] **Step 3: Add relayerKey to interfaces and factories**

In `packages/sdk/src/config/transports.ts`:

Add `relayerKey` to `WebTransportConfig`:

```ts
export interface WebTransportConfig {
  readonly type: "web";
  chain?: Partial<ExtendedFhevmInstanceConfig>;
  relayer?: WebRelayerOptions;
  /** Explicit grouping key. Chains with the same relayerKey share one relayer instance. */
  relayerKey?: string;
}
```

Add `relayerKey` to `NodeTransportConfig`:

```ts
export interface NodeTransportConfig {
  readonly type: "node";
  chain?: Partial<ExtendedFhevmInstanceConfig>;
  relayer?: NodeRelayerOptions;
  /** Explicit grouping key. Chains with the same relayerKey share one relayer instance. */
  relayerKey?: string;
}
```

Update `web()` factory:

```ts
export function web(
  chain?: Partial<ExtendedFhevmInstanceConfig>,
  relayer?: WebRelayerOptions,
  relayerKey?: string,
): WebTransportConfig {
  const config: WebTransportConfig = { type: "web", chain, relayer };
  if (relayerKey !== undefined) config.relayerKey = relayerKey;
  return config;
}
```

Update `node()` factory:

```ts
export function node(
  chain?: Partial<ExtendedFhevmInstanceConfig>,
  relayer?: NodeRelayerOptions,
  relayerKey?: string,
): NodeTransportConfig {
  const config: NodeTransportConfig = { type: "node", chain, relayer };
  if (relayerKey !== undefined) config.relayerKey = relayerKey;
  return config;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/sdk/src/config/__tests__/transports.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```
feat(sdk): add optional relayerKey to web() and node() transport factories
```

---

### Task 4: Implement relayerKey grouping logic

**Files:**

- Modify: `packages/sdk/src/config/resolve.ts:123-146` (`ChainEntry`, `groupByRelayer`)
- Test: `packages/sdk/src/config/__tests__/resolve.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the `buildRelayer` describe block in `packages/sdk/src/config/__tests__/resolve.test.ts`:

```ts
it("shares relayer for chains with same relayerKey", () => {
  const transports = resolveChainTransports(
    [sepoliaChain, mainnetChain],
    {
      [11155111]: web(undefined, { threads: 2 }, "shared"),
      [1]: web(undefined, { threads: 2 }, "shared"),
    },
    [11155111, 1],
  );
  const relayer = buildRelayer(transports, resolveChainId);
  // Same relayerKey → single RelayerWeb, no CompositeRelayer
  expect(relayer.constructor.name).not.toBe("CompositeRelayer");
});

it("throws when same relayerKey has different relayer options", () => {
  const transports = resolveChainTransports(
    [sepoliaChain, mainnetChain],
    {
      [11155111]: web(undefined, { threads: 2 }, "shared"),
      [1]: web(undefined, { threads: 4 }, "shared"),
    },
    [11155111, 1],
  );
  expect(() => buildRelayer(transports, resolveChainId)).toThrow('relayerKey "shared"');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/sdk/src/config/__tests__/resolve.test.ts`
Expected: 2 new tests FAIL

- [ ] **Step 3: Update ChainEntry and groupByRelayer**

In `packages/sdk/src/config/resolve.ts`, update `ChainEntry`:

```ts
interface ChainEntry {
  chain: ExtendedFhevmInstanceConfig;
  relayer: Record<string, unknown> | undefined;
  relayerKey: string | undefined;
}
```

Replace `groupByRelayer`:

```ts
function groupByRelayer(entries: ChainEntry[]): ChainEntry[][] {
  const keyedGroups = new Map<string, ChainEntry[]>();
  const refGroups = new Map<object | undefined, ChainEntry[]>();

  for (const entry of entries) {
    if (entry.relayerKey !== undefined) {
      const existing = keyedGroups.get(entry.relayerKey);
      if (existing) {
        // Validate that all entries with the same key have structurally equal relayer options
        const first = existing[0]!;
        if (JSON.stringify(first.relayer) !== JSON.stringify(entry.relayer)) {
          throw new ConfigurationError(
            `Chains with relayerKey "${entry.relayerKey}" have different relayer options. ` +
              `Chains sharing a relayerKey must use identical relayer options.`,
          );
        }
        existing.push(entry);
      } else {
        keyedGroups.set(entry.relayerKey, [entry]);
      }
    } else {
      const group = refGroups.get(entry.relayer);
      if (group) {
        group.push(entry);
      } else {
        refGroups.set(entry.relayer, [entry]);
      }
    }
  }

  return [...keyedGroups.values(), ...refGroups.values()];
}
```

Update `toChainEntry` to pass through `relayerKey`:

```ts
function toChainEntry(
  chain: ExtendedFhevmInstanceConfig,
  transport: WebTransportConfig | NodeTransportConfig,
): ChainEntry {
  const merged = { ...chain, ...transport.chain };
  if (!merged.relayerUrl) {
    throw new ConfigurationError(
      `Chain ${chain.chainId} has an empty relayerUrl. ` +
        `Use cleartext() for chains without a relayer.`,
    );
  }
  return {
    chain: merged,
    relayer: transport.relayer,
    relayerKey: transport.relayerKey,
  };
}
```

Add the `ConfigurationError` import if not already present (it is).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/sdk/src/config/__tests__/resolve.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```
feat(sdk): support relayerKey-based grouping in buildRelayer
```

---

### Task 5: Add custom() transport factory

**Files:**

- Modify: `packages/sdk/src/config/transports.ts`
- Test: `packages/sdk/src/config/__tests__/transports.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/sdk/src/config/__tests__/transports.test.ts`:

```ts
describe("custom()", () => {
  it("returns tagged config with user-provided relayer", () => {
    const mockRelayer = { terminate: () => {} } as any;
    expect(custom(mockRelayer)).toEqual({
      type: "custom",
      relayer: mockRelayer,
    });
  });

  it("preserves relayer reference identity", () => {
    const mockRelayer = { terminate: () => {} } as any;
    const result = custom(mockRelayer);
    expect(result.relayer).toBe(mockRelayer);
  });
});
```

Update the import at the top of the file:

```ts
import { web, node, cleartext, custom } from "../transports";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/sdk/src/config/__tests__/transports.test.ts`
Expected: Import error — `custom` not exported

- [ ] **Step 3: Implement CustomTransportConfig and custom()**

In `packages/sdk/src/config/transports.ts`, add the interface after `CleartextTransportConfig`:

```ts
/** Tagged transport: user-provided RelayerSDK for a specific chain. */
export interface CustomTransportConfig {
  readonly type: "custom";
  relayer: RelayerSDK;
}
```

Add the import at the top of the file:

```ts
import type { RelayerSDK } from "../relayer/relayer-sdk";
```

Update the `TransportConfig` union:

```ts
export type TransportConfig =
  | WebTransportConfig
  | NodeTransportConfig
  | CleartextTransportConfig
  | CustomTransportConfig;
```

Add the factory after the `cleartext()` function:

````ts
/**
 * Custom transport — inject a user-provided RelayerSDK for a specific chain.
 *
 * @example
 * ```ts
 * transports: { [mainnet.id]: custom(myRelayer) }
 * ```
 */
export function custom(relayer: RelayerSDK): CustomTransportConfig {
  return { type: "custom", relayer };
}
````

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/sdk/src/config/__tests__/transports.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```
feat(sdk): add custom() transport factory and CustomTransportConfig
```

---

### Task 6: Handle custom transport in resolution and building

**Files:**

- Modify: `packages/sdk/src/config/resolve.ts:70-118` (`resolveChainTransports`) and `190-238` (`buildRelayer`)
- Test: `packages/sdk/src/config/__tests__/resolve.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the `resolveChainTransports` describe block:

```ts
it("resolves chains with custom transport", () => {
  const mockRelayer = { terminate: () => {} } as any;
  const transport = custom(mockRelayer);
  const result = resolveChainTransports([sepoliaChain], { [11155111]: transport }, [11155111]);
  expect(result.get(11155111)?.transport).toBe(transport);
});

it("throws for custom transport with missing chain config", () => {
  const mockRelayer = { terminate: () => {} } as any;
  expect(() => resolveChainTransports([], { [999]: custom(mockRelayer) }, [999])).toThrow(
    "transport configured but no entry in the chains array",
  );
});
```

Add to the `buildRelayer` describe block:

```ts
it("uses custom relayer directly without constructing", () => {
  const mockRelayer = { terminate: vi.fn() } as any;
  const transports = resolveChainTransports(
    [sepoliaChain],
    { [11155111]: custom(mockRelayer) },
    [11155111],
  );
  const relayer = buildRelayer(transports, resolveChainId);
  expect(relayer).toBe(mockRelayer);
});

it("returns CompositeRelayer for mixed web + custom", () => {
  const mockRelayer = { terminate: vi.fn() } as any;
  const transports = resolveChainTransports(
    [sepoliaChain, mainnetChain],
    { [11155111]: web(), [1]: custom(mockRelayer) },
    [11155111, 1],
  );
  const relayer = buildRelayer(transports, resolveChainId);
  expect(relayer.constructor.name).toBe("CompositeRelayer");
});
```

Update the import at the top of the test file:

```ts
import { web, node, cleartext, custom } from "../transports";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/sdk/src/config/__tests__/resolve.test.ts`
Expected: 4 new tests FAIL

- [ ] **Step 3: Handle custom in resolveChainTransports**

In `packages/sdk/src/config/resolve.ts`, update the import:

```ts
import type {
  CustomTransportConfig,
  NodeTransportConfig,
  TransportConfig,
  WebTransportConfig,
} from "./transports";
```

In `resolveChainTransports`, add a `"custom"` case after the `"cleartext"` block (after line 98):

```ts
if (userTransport?.type === "custom") {
  if (!chainConfig) {
    throw new ConfigurationError(
      `Chain ${id} has a transport configured but no entry in the chains array. ` +
        `Add the chain config to the chains array.`,
    );
  }
  result.set(id, { chain: chainConfig, transport: userTransport });
  continue;
}
```

- [ ] **Step 4: Handle custom in buildRelayer**

In `packages/sdk/src/config/resolve.ts`, in the `buildRelayer` for-loop (after the cleartext block), add:

```ts
if (transport.type === "custom") {
  perChainRelayers.set(chain.chainId, transport.relayer);
  continue;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run packages/sdk/src/config/__tests__/resolve.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```
feat(sdk): handle custom transport in resolveChainTransports and buildRelayer
```

---

### Task 7: Export custom from config and SDK entry points

**Files:**

- Modify: `packages/sdk/src/config/index.ts`
- Modify: `packages/sdk/src/index.ts`

- [ ] **Step 1: Update config/index.ts exports**

In `packages/sdk/src/config/index.ts`, update line 1:

```ts
export { web, node, cleartext, custom } from "./transports";
```

Update the type export:

```ts
export type {
  WebTransportConfig,
  NodeTransportConfig,
  CleartextTransportConfig,
  CustomTransportConfig,
  TransportConfig,
} from "./transports";
```

- [ ] **Step 2: Update sdk/src/index.ts exports**

In `packages/sdk/src/index.ts`, update the config factory export (line 14):

```ts
export {
  createZamaConfig,
  web,
  node,
  cleartext,
  custom,
  resolveChainTransports,
  buildRelayer,
  resolveStorage,
} from "./config";
```

Update the type export (line 30):

```ts
export type {
  ZamaConfig,
  ZamaConfigBase,
  ZamaConfigViem,
  ZamaConfigEthers,
  ZamaConfigCustomSigner,
  ZamaConfigCustomRelayer,
  CreateZamaConfigBaseParams,
  TransportConfig,
  WebTransportConfig,
  NodeTransportConfig,
  CleartextTransportConfig,
  CustomTransportConfig,
} from "./config";
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: All packages pass

- [ ] **Step 4: Run all affected tests**

Run: `pnpm vitest run packages/sdk/src/config/__tests__/ packages/sdk/src/relayer/__tests__/composite-relayer.test.ts packages/react-sdk/src/__tests__/config.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```
feat(sdk): export custom() and CustomTransportConfig from SDK entry points
```
