# Entry-Point-Scoped `createZamaConfig` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `createZamaConfig` out of the main SDK entry into `/viem`, `/ethers`, and `/wagmi` sub-entries, each accepting only its own adapter type with flattened config fields.

**Architecture:** A shared internal `buildZamaConfig(signer, params, resolveChainId?)` in `config/build.ts` handles the common work (storage, chain-transport resolution, relayer construction). Each entry point creates its signer, then delegates to the builder. The union type and `resolveSigner` are deleted.

**Tech Stack:** TypeScript, vitest (type-level tests with `expectTypeOf`)

---

### File Structure

| File                                       | Role                                                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `sdk/src/config/build.ts`                  | **Create.** Internal `buildZamaConfig` builder.                                                                  |
| `sdk/src/config/types.ts`                  | **Modify.** Remove `ZamaConfigViem`, `ZamaConfigEthers`, `ZamaConfigCustomSigner`, `CreateZamaConfigBaseParams`. |
| `sdk/src/config/index.ts`                  | **Modify.** Remove `createZamaConfig`, export `buildZamaConfig` as `@internal`.                                  |
| `sdk/src/config/resolve.ts`                | **Modify.** Remove `resolveSigner`, `ConfigWithTransports`.                                                      |
| `sdk/src/viem/types.ts`                    | **Create.** Flattened `ZamaConfigViem`.                                                                          |
| `sdk/src/viem/index.ts`                    | **Modify.** Add `createZamaConfig`.                                                                              |
| `sdk/src/ethers/types.ts`                  | **Create.** `ZamaConfigEthers` (matches existing `EthersSignerConfig` union).                                    |
| `sdk/src/ethers/index.ts`                  | **Modify.** Add `createZamaConfig`.                                                                              |
| `sdk/src/index.ts`                         | **Modify.** Remove `createZamaConfig` and deleted types, re-export relocated types.                              |
| `react-sdk/src/wagmi/config.ts`            | **Modify.** Use `buildZamaConfig` instead of duplicating logic.                                                  |
| `sdk/src/config/__tests__/types.test-d.ts` | **Modify.** Add type tests for entry-point config types.                                                         |
| `react-sdk/src/__tests__/config.test.ts`   | **Modify.** Update imports and test assertions.                                                                  |

---

### Task 1: Create `buildZamaConfig` internal builder

**Files:**

- Create: `sdk/src/config/build.ts`
- Modify: `sdk/src/config/index.ts`

- [ ] **Step 1: Write the failing test**

No new test file — `buildZamaConfig` is internal and will be tested through the entry-point tests in Task 6. Instead, write the implementation directly (it's extracted from existing tested code).

- [ ] **Step 2: Create `sdk/src/config/build.ts`**

```ts
import type { FheChain } from "../chains";
import type { GenericSigner, GenericStorage } from "../types";
import type { ZamaSDKEventListener } from "../events";
import type { ZamaConfig, ZamaConfigBase } from "./types";
import { resolveStorage, resolveChainTransports, buildRelayer } from "./resolve";

/**
 * @internal Shared config builder — not part of the public API.
 *
 * Each entry point (`/viem`, `/ethers`, wagmi) creates its signer,
 * then delegates here for the common resolution work.
 */
export function buildZamaConfig(
  signer: GenericSigner,
  params: ZamaConfigBase,
  resolveChainId?: () => Promise<number>,
): ZamaConfig {
  const { storage, sessionStorage } = resolveStorage(params.storage, params.sessionStorage);
  const chainTransports = resolveChainTransports(
    params.chains,
    params.transports,
    params.chains.map((c) => c.id),
  );
  const relayer = buildRelayer(chainTransports, resolveChainId ?? (() => signer.getChainId()));

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

- [ ] **Step 3: Export `buildZamaConfig` from `config/index.ts`**

Add to `sdk/src/config/index.ts`:

```ts
export { buildZamaConfig } from "./build";
```

Remove from `sdk/src/config/index.ts`:

- The `createZamaConfig` function definition (lines 39–60)
- The import of `CreateZamaConfigBaseParams` and `ZamaConfig` from `./types` (line 22)
- The import of `resolveSigner` from `./resolve` (line 23)

The file should end up exporting transport factories, types, resolve utilities, and `buildZamaConfig`.

- [ ] **Step 4: Verify typecheck passes**

Run: `cd packages/sdk && pnpm typecheck`
Expected: May have errors from removed `createZamaConfig` usages — that's expected, we fix those in later tasks.

- [ ] **Step 5: Commit**

```
git add packages/sdk/src/config/build.ts packages/sdk/src/config/index.ts
git commit -m "refactor(sdk): extract buildZamaConfig internal builder"
```

---

### Task 2: Create flattened `ZamaConfigViem` and add `createZamaConfig` to `/viem`

**Files:**

- Create: `sdk/src/viem/types.ts`
- Modify: `sdk/src/viem/index.ts`

- [ ] **Step 1: Create `sdk/src/viem/types.ts`**

```ts
import type { EIP1193Provider, PublicClient, WalletClient } from "viem";
import type { ZamaConfigBase } from "../config/types";

/** Viem config — pass native viem clients directly. */
export interface ZamaConfigViem extends ZamaConfigBase {
  publicClient: PublicClient;
  walletClient?: WalletClient;
  ethereum?: EIP1193Provider;
}
```

- [ ] **Step 2: Add `createZamaConfig` to `sdk/src/viem/index.ts`**

Add these imports and the function at the top of the file, before existing exports:

```ts
import type { ZamaConfig } from "../config/types";
import { buildZamaConfig } from "../config/build";
import { ViemSigner } from "./viem-signer";

export type { ZamaConfigViem } from "./types";

/** Create a {@link ZamaConfig} from viem clients. */
export function createZamaConfig(params: ZamaConfigViem): ZamaConfig {
  const signer = new ViemSigner({
    publicClient: params.publicClient,
    walletClient: params.walletClient,
    ethereum: params.ethereum,
  });
  return buildZamaConfig(signer, params);
}
```

Add the missing import for `ZamaConfigViem`:

```ts
import type { ZamaConfigViem } from "./types";
```

- [ ] **Step 3: Verify typecheck passes**

Run: `cd packages/sdk && pnpm typecheck`
Expected: PASS (or errors only from files not yet migrated)

- [ ] **Step 4: Commit**

```
git add packages/sdk/src/viem/types.ts packages/sdk/src/viem/index.ts
git commit -m "feat(sdk): add createZamaConfig to @zama-fhe/sdk/viem"
```

---

### Task 3: Create `ZamaConfigEthers` type and add `createZamaConfig` to `/ethers`

**Files:**

- Create: `sdk/src/ethers/types.ts`
- Modify: `sdk/src/ethers/index.ts`

`EthersSigner` and `EthersSignerConfig` are unchanged — the existing mutually exclusive union stays as-is.

- [ ] **Step 1: Create `sdk/src/ethers/types.ts`**

```ts
import type { Signer } from "ethers";
import type { ethers } from "ethers";
import type { EIP1193Provider } from "viem";
import type { ZamaConfigBase } from "../config/types";

/**
 * Ethers config — pass an EIP-1193 provider, ethers Signer, or ethers Provider.
 *
 * The three variants are mutually exclusive, matching {@link EthersSignerConfig}:
 * - `{ ethereum }` — browser EIP-1193 provider
 * - `{ signer }` — ethers Signer (e.g. Wallet)
 * - `{ provider }` — ethers Provider (read-only)
 */
export type ZamaConfigEthers = ZamaConfigBase &
  ({ ethereum: EIP1193Provider } | { signer: Signer } | { provider: ethers.Provider });
```

- [ ] **Step 2: Add `createZamaConfig` to `sdk/src/ethers/index.ts`**

Add these imports and function at the top, before existing exports:

```ts
import type { ZamaConfig } from "../config/types";
import { buildZamaConfig } from "../config/build";
import { EthersSigner } from "./ethers-signer";
import type { ZamaConfigEthers } from "./types";

export type { ZamaConfigEthers } from "./types";

/** Create a {@link ZamaConfig} from ethers types. */
export function createZamaConfig(params: ZamaConfigEthers): ZamaConfig {
  const signer = new EthersSigner(params);
  return buildZamaConfig(signer, params);
}
```

- [ ] **Step 4: Verify typecheck passes**

Run: `cd packages/sdk && pnpm typecheck`
Expected: PASS (or errors only from files not yet migrated)

- [ ] **Step 5: Commit**

```
git add packages/sdk/src/ethers/types.ts packages/sdk/src/ethers/index.ts
git commit -m "feat(sdk): add createZamaConfig to @zama-fhe/sdk/ethers"
```

---

### Task 4: Clean up `config/types.ts`, `config/resolve.ts`, and `sdk/src/index.ts`

**Files:**

- Modify: `sdk/src/config/types.ts`
- Modify: `sdk/src/config/resolve.ts`
- Modify: `sdk/src/config/index.ts`
- Modify: `sdk/src/index.ts`

- [ ] **Step 1: Remove adapter-specific types from `sdk/src/config/types.ts`**

Delete these from `config/types.ts`:

- `ZamaConfigViem` interface (lines 29–39)
- `ZamaConfigEthers` interface (lines 41–47)
- `ZamaConfigCustomSigner` interface (lines 49–55)
- `CreateZamaConfigBaseParams` type alias (line 58)
- The `import type { Provider, Signer } from "ethers"` (line 1)
- The `import type { EIP1193Provider, PublicClient, WalletClient } from "viem"` (line 2)

The file should retain: `ZamaConfigBase`, `ZamaConfig` (branded opaque type), and their supporting imports.

- [ ] **Step 2: Remove `resolveSigner` and `ConfigWithTransports` from `sdk/src/config/resolve.ts`**

Delete from `resolve.ts`:

- The `ConfigWithTransports` type alias (line 54)
- The `resolveSigner` function (lines 56–64)
- The import of `ZamaConfigCustomSigner`, `ZamaConfigEthers`, `ZamaConfigViem` from `./types` (line 13)
- The import of `EthersSigner` from `../ethers` (line 3)
- The import of `ViemSigner` from `../viem` (line 10)

- [ ] **Step 3: Update `sdk/src/config/index.ts` exports**

Remove from the type exports:

- `ZamaConfigViem`
- `ZamaConfigEthers`
- `ZamaConfigCustomSigner`
- `CreateZamaConfigBaseParams`
- `ConfigWithTransports`

Add re-exports of the relocated types:

```ts
export type { ZamaConfigViem } from "../viem/types";
export type { ZamaConfigEthers } from "../ethers/types";
```

- [ ] **Step 4: Update `sdk/src/index.ts`**

Remove:

- `createZamaConfig` from the value export block (line 13)
- `ZamaConfigCustomSigner` from the type export block (line 25)
- `CreateZamaConfigBaseParams` from the type export block (line 26)

The `ZamaConfigViem` and `ZamaConfigEthers` type exports stay — they now resolve through `config/index.ts` which re-exports from the new locations.

- [ ] **Step 5: Verify typecheck**

Run: `cd packages/sdk && pnpm typecheck`
Expected: May show errors in `react-sdk` tests — those are fixed in Task 5.

- [ ] **Step 6: Commit**

```
git add packages/sdk/src/config/types.ts packages/sdk/src/config/resolve.ts packages/sdk/src/config/index.ts packages/sdk/src/index.ts
git commit -m "refactor(sdk): remove createZamaConfig union, resolveSigner, and deleted types from main entry"
```

---

### Task 5: Migrate wagmi `createZamaConfig` to use `buildZamaConfig`

**Files:**

- Modify: `react-sdk/src/wagmi/config.ts`
- Modify: `react-sdk/src/__tests__/config.test.ts`

- [ ] **Step 1: Update `react-sdk/src/wagmi/config.ts`**

Replace the entire file with:

```ts
import { buildZamaConfig, type ZamaConfig, type ZamaConfigBase } from "@zama-fhe/sdk";
import type { Config } from "wagmi";
import { getChainId } from "wagmi/actions";
import { WagmiSigner } from "./wagmi-signer";

/** Wagmi-backed config — signer derived from wagmi Config. */
export interface ZamaConfigWagmi<T = Config> extends ZamaConfigBase {
  wagmiConfig: T;
}

/** Create a {@link ZamaConfig} from a wagmi `Config`. */
export function createZamaConfig(params: ZamaConfigWagmi): ZamaConfig {
  const { wagmiConfig } = params;
  const signer = new WagmiSigner({ config: wagmiConfig });
  const getChainIdFn = () => Promise.resolve(getChainId(wagmiConfig));
  return buildZamaConfig(signer, params, getChainIdFn);
}
```

- [ ] **Step 2: Update `react-sdk/src/__tests__/config.test.ts`**

Change the import on line 2 from:

```ts
import { createZamaConfig, web } from "@zama-fhe/sdk";
```

to:

```ts
import { web } from "@zama-fhe/sdk";
import { createZamaConfig as createViemZamaConfig } from "@zama-fhe/sdk/viem";
import { createZamaConfig as createEthersZamaConfig } from "@zama-fhe/sdk/ethers";
```

Update each test that currently calls `createZamaConfig(...)`:

**"creates ViemSigner from viem clients" test** — change `createZamaConfig` to `createViemZamaConfig` and flatten the `viem: {}` wrapper:

```ts
it("creates ViemSigner from viem clients", () => {
  const publicClient = {} as any;
  const walletClient = {} as any;
  createViemZamaConfig({
    chains: [sepolia],
    publicClient,
    walletClient,
    transports: { [11155111]: web() },
  });
  expect(MockViemSigner).toHaveBeenCalledWith({
    publicClient,
    walletClient,
    ethereum: undefined,
  });
});
```

**"creates EthersSigner from ethers config" test** — change `createZamaConfig` to `createEthersZamaConfig` and flatten:

```ts
it("creates EthersSigner from ethers config", () => {
  const ethereum = {} as any;
  createEthersZamaConfig({
    chains: [sepolia],
    ethereum,
    transports: { [11155111]: web() },
  });
  expect(MockEthersSigner).toHaveBeenCalledWith(expect.objectContaining({ ethereum }));
});
```

**"uses custom signer as-is" test** — delete entirely (custom signer path removed).

**"uses user-provided storage" test** — use `createViemZamaConfig` with flattened fields instead of `createZamaConfig` with `signer`:

```ts
it("uses user-provided storage", () => {
  const storage = createMockStorage();
  const sessionStorage = createMockStorage();
  const config = createViemZamaConfig({
    chains: [sepolia],
    publicClient: {} as any,
    transports: { [11155111]: web() },
    storage,
    sessionStorage,
  });
  expect(config.storage).toBe(storage);
  expect(config.sessionStorage).toBe(sessionStorage);
});
```

Apply the same pattern to "accepts the same storage instance for both" and "passes keypairTTL, sessionTTL, registryTTL, onEvent through" tests.

**"uses explicit transports for non-wagmi paths" test** — use `createViemZamaConfig`:

```ts
it("uses explicit transports for non-wagmi paths", () => {
  const config = createViemZamaConfig({
    chains: [sepolia],
    publicClient: {} as any,
    transports: { [11155111]: web() },
  });
  expect(config.relayer).toBeDefined();
});
```

- [ ] **Step 3: Run tests**

Run: `cd packages/react-sdk && pnpm vitest run src/__tests__/config.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```
git add packages/react-sdk/src/wagmi/config.ts packages/react-sdk/src/__tests__/config.test.ts
git commit -m "refactor(react-sdk): migrate wagmi createZamaConfig to use buildZamaConfig"
```

---

### Task 6: Add type-level tests

**Files:**

- Modify: `sdk/src/config/__tests__/types.test-d.ts`

- [ ] **Step 1: Add type tests for entry-point configs**

Replace the file contents with:

```ts
import { describe, expectTypeOf, it } from "vitest";
import { mainnet, sepolia } from "../../chains";
import type { FheChain } from "../../chains";
import type { ZamaConfigViem } from "../../viem/types";
import type { ZamaConfigEthers } from "../../ethers/types";

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

describe("ZamaConfigViem", () => {
  it("accepts publicClient at top level", () => {
    expectTypeOf<ZamaConfigViem>().toHaveProperty("publicClient");
  });

  it("does not have a viem wrapper property", () => {
    expectTypeOf<ZamaConfigViem>().not.toHaveProperty("viem");
  });
});

describe("ZamaConfigEthers", () => {
  it("accepts ethereum at top level", () => {
    expectTypeOf<ZamaConfigEthers>().toHaveProperty("ethereum");
  });

  it("does not have an ethers wrapper property", () => {
    expectTypeOf<ZamaConfigEthers>().not.toHaveProperty("ethers");
  });
});
```

- [ ] **Step 2: Run type tests**

Run: `cd packages/sdk && pnpm vitest typecheck --run`
Expected: PASS

- [ ] **Step 3: Commit**

```
git add packages/sdk/src/config/__tests__/types.test-d.ts
git commit -m "test(sdk): add type-level tests for entry-point config types"
```

---

### Task 7: Full verification

**Files:** None (verification only)

- [ ] **Step 1: Run full SDK typecheck**

Run: `cd packages/sdk && pnpm typecheck`
Expected: PASS

- [ ] **Step 2: Run full react-sdk typecheck**

Run: `cd packages/react-sdk && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Run all SDK tests**

Run: `cd packages/sdk && pnpm vitest run`
Expected: PASS

- [ ] **Step 4: Run all react-sdk tests**

Run: `cd packages/react-sdk && pnpm vitest run`
Expected: PASS

- [ ] **Step 5: Run monorepo typecheck**

Run: `pnpm run typecheck` (from repo root)
Expected: PASS
