---
title: Migrate from v2 to v3
description: Step-by-step guide to upgrade an app from @zama-fhe/sdk 2.x to 3.x — config factory, relayer factories, permits, operators, encrypt/decrypt glossary.
---

# Migrate from v2 to v3

This guide upgrades an application that uses `@zama-fhe/sdk` and `@zama-fhe/react-sdk` from **2.5.0** (the last 2.x release) to the **3.x** line. Each step has an explicit _Before (2.x)_ / _After (3.x)_ pair and a find/replace rule, so it works whether you migrate by hand or hand it to an [AI coding agent](#migrate-with-an-ai-coding-agent).

**The happy path:** for most apps the migration is **Step 1 (how you construct the SDK)** plus a set of mechanical renames. The high-level `Token` flow API — `shield`, `confidentialTransfer`, `unshield`, `unshieldAll`, `decryptBalanceAs` — keeps its signatures. Only three surfaces really moved: `approve` became the operator model (Step 4), token-level delegation moved to `sdk.delegations.*` (Step 3), and balance reads now take the holder address (Step 4).

{% hint style="info" %}
**Scope.** This guide targets the current 3.x line. Most developer-facing changes landed in 3.1; the 3.0 major bump itself was an on-chain wrapper/registry contract upgrade (Step 6), not a TypeScript API change.
{% endhint %}

## Migrate with an AI coding agent

This guide is built to be executed by an AI coding agent (Claude Code, Cursor,
Copilot, …). The fastest path is to point an agent at your repository with the
prompt below. Read the rest of this page if you'd rather migrate by hand — or to
review what the agent is doing.

{% hint style="warning" %}
Agents trained before this SDK existed routinely confuse `@zama-fhe/sdk` (this
**high-level** SDK) with the legacy low-level `@zama-fhe/relayer-sdk`
(`createInstance` / `initSDK`). The prompt forbids that — keep the instruction to
treat this guide as the source of truth.
{% endhint %}

```text
Upgrade this repository from @zama-fhe/sdk and @zama-fhe/react-sdk v2.x to v3.x.

SOURCE OF TRUTH — follow it exactly:
https://docs.zama.org/protocol/sdk/guides/migrate-v2-to-v3.md

Rules:
1. Fetch and read that guide BEFORE doing anything. It is authoritative. Do NOT
   rely on prior knowledge of the "Zama SDK": this is the high-level
   @zama-fhe/sdk, NOT the legacy @zama-fhe/relayer-sdk (createInstance/initSDK).
   For any symbol you're unsure about, use the guide's symbol-mapping table; for
   anything it doesn't cover, fetch
   https://raw.githubusercontent.com/zama-ai/sdk/main/llms.txt and follow its links.
2. First print a short PLAN: list every file importing @zama-fhe/sdk or
   @zama-fhe/react-sdk and which guide Steps apply to each. Then proceed.
3. Apply the Steps IN ORDER, starting with Step 1 (configuration) — it unblocks
   the rest. Use the symbol table for renames. Respect the per-symbol notes: the
   React hook calling convention is MIXED — see the Step 4 convention table (most
   hooks are positional `useX(address)`, the rest take `{ address }`, and the old
   `{ tokenAddress }` field is gone), and several signatures changed (e.g.
   balanceOf(owner), isOperator(holder, spender)).
4. Do NOT change app logic or unrelated code. The high-level Token flow API
   (shield, confidentialTransfer, unshield, …) is unchanged except where the
   guide says otherwise.
5. Bump the @zama-fhe/* deps to ^3 using this repo's package manager.
6. VALIDATE: run the type checker and the guide's final leftover-symbol `rg`
   sweep; fix until both are clean. Inspect the false-positive cases the guide
   calls out (.chainId on viem/EIP-1193 objects, token.approve on the underlying
   ERC-20, tokenAddress in your own variable names) instead of blind-replacing.
7. Show the result as a diff and flag anything ambiguous for human review.
```

No repo access (a plain chat assistant)? Paste this page as the source of truth,
then the contents of your SDK-using files, and ask for the v3 rewrite of each
under the same rules.

## Step 0 — Install

```bash
pnpm add @zama-fhe/sdk@^3 @zama-fhe/react-sdk@^3
# the react-sdk peer-depends on @zama-fhe/sdk@^3
```

## Symbol mapping (quick reference)

The tables below are the authoritative list of renames. Skim for the symbol you
need and jump to the cited **Step**, or read Steps 1→7 in order for a full
migration.

### `@zama-fhe/sdk` (core)

| 2.x                                                                                       | 3.x                                                                                                              | Step    |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------- |
| `ZamaSDKConfig`                                                                           | `ZamaConfig` (+ `ZamaConfigViem`/`ZamaConfigEthers`/`ZamaConfigWagmi`)                                           | [1][s1] |
| `new ZamaSDK({ relayer, signer, storage })`                                               | `new ZamaSDK(createConfig({ chains, …client, relayers, storage }))`                                              | [1][s1] |
| `SepoliaConfig` / `MainnetConfig` / `HardhatConfig` (from `@zama-fhe/sdk`)                | `sepolia` / `mainnet` / `hardhat` (+ `hoodi`, `anvil`, `ingenTestnet`, `bscTestnet`) from `@zama-fhe/sdk/chains` | [1][s1] |
| `<chainConfig>.chainId`                                                                   | `<chain>.id`                                                                                                     | [1][s1] |
| `ViemSigner` / `EthersSigner` (constructed)                                               | pass `publicClient`/`walletClient` (or ethers `provider`/`signer`) to `createConfig`                             | [1][s1] |
| `keypairTTL` (config option)                                                              | `transportKeyPairTTL`                                                                                            | [1][s1] |
| `new RelayerWeb(...)`                                                                     | `web()` from `@zama-fhe/sdk/web`                                                                                 | [2][s2] |
| `new RelayerNode(...)`                                                                    | `node()` from `@zama-fhe/sdk/node`                                                                               | [2][s2] |
| `CredentialsManager` / `DelegatedCredentialsManager`                                      | `Permits` / `Delegations` / `Decryption`                                                                         | [3][s3] |
| `CredentialsManagerConfig`, `Credentials*Event`, `StoredCredentials`, `StoredKeypair`     | `Permission`, `StoredTransportKeyPair` (+ permit events)                                                         | [3][s3] |
| `token.approve(spender[, expiry])`                                                        | `token.setOperator(operator[, expiry])`                                                                          | [4][s4] |
| `token.isApproved(spender[, owner])`                                                      | `token.isOperator(holder, spender)`                                                                              | [4][s4] |
| `token.balanceOf()` (self default)                                                        | `token.balanceOf(owner)` — owner address now required                                                            | [4][s4] |
| `EncryptResult.handles` (bytes)                                                           | `EncryptResult.encryptedValues` (hex; `inputProof` is now hex too)                                               | [5][s5] |
| `extractEncryptedHandles(...)`                                                            | **removed** — read `result.encryptedValues`                                                                      | [5][s5] |
| `Handle` (type), `ClearValueType`                                                         | `EncryptedValue` (term), `ClearValue`                                                                            | [5][s5] |
| `ZERO_HANDLE` / `isZeroHandle()`                                                          | `ZERO_ENCRYPTED_VALUE` / `isEncryptedValueZero()`                                                                | [5][s5] |
| `UserDecryptParams`, `PublicDecryptResult`, `DelegatedUserDecryptParams`, `DecryptHandle` | `DecryptValuesParams`, `DecryptPublicValuesResult`, `DelegatedDecryptValuesParams`, `DecryptInput`               | [5][s5] |
| `applyDecryptedValues`, `DecryptCache`                                                    | **removed** — handled by the SDK's internal cache                                                                | [5][s5] |
| `KeypairType` / `Keypair`; `generateKeypair()` / `warmKeypair()`                          | `TransportKeyPair`; `generateTransportKeyPair()` / `warmTransportKeyPair()`                                      | [5][s5] |
| relayer `getPublicKey()`; `PublicKeyData`                                                 | `fetchFheEncryptionKeyBytes()`; `FheEncryptionKey`                                                               | [5][s5] |
| `KeypairExpiredError` / `InvalidKeypairError`                                             | `TransportKeyPairExpiredError` / `InvalidTransportKeyPairError`                                                  | [5][s5] |
| `sdk.createReadonlyToken(addr)`; `sdk.createToken(addr, wrapper?)`                        | `sdk.createToken(addr)` (read/transfer); `sdk.createWrappedToken(addr)` (wrap/shield/unshield)                   | [6][s6] |
| `ReadonlyToken`                                                                           | `Token` (read/transfer) / `WrappedToken` (wrap)                                                                  | [6][s6] |
| `decodeUnwrappedFinalized`, `UnwrappedFinalizedEvent`                                     | `decodeUnwrapFinalized`, `UnwrapFinalizedEvent`                                                                  | [6][s6] |
| `decodeUnwrappedStarted`, `UnwrappedStartedEvent`                                         | **removed**                                                                                                      | [6][s6] |
| `parseActivityFeed`, `ActivityItem`, `ActivityAmount`, `ActivityType`                     | **removed** (activity feed dropped)                                                                              | [7][s7] |
| `totalSupplyContract`, `matchAclRevert`, `sortByBlockNumber`                              | **removed**                                                                                                      | [7][s7] |

### `@zama-fhe/react-sdk` (hooks)

| 2.x                                                                | 3.x                                                                                               | Step    |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------- |
| `<ZamaProvider relayer signer storage sessionStorage onEvent>`     | `<ZamaProvider config={createConfig({…})}>` (no `sessionStorage`)                                 | [1][s1] |
| `new WagmiSigner({ config })`                                      | `createConfig` from `@zama-fhe/react-sdk/wagmi`                                                   | [1][s1] |
| `useAllow` / `useIsAllowed`                                        | `useGrantPermit` / `useHasPermit`                                                                 | [3][s3] |
| `useGenerateKeypair`                                               | **removed** — permits are managed by the SDK                                                      | [3][s3] |
| `useCreateEIP712` / `useCreateDelegatedUserDecryptEIP712`          | **removed** — use `useGrantPermit`                                                                | [3][s3] |
| `useDelegatedUserDecrypt`                                          | `useDelegatedDecryptValues`                                                                       | [3][s3] |
| `useRevoke`                                                        | `useRevokePermits` — revoke permits, keep the transport key pair                                  | [3][s3] |
| `useRevokeSession`                                                 | `useClearCredentials` — full logout (also wipes the transport key pair)                           | [3][s3] |
| `useConfidentialApprove`                                           | `useConfidentialSetOperator`                                                                      | [4][s4] |
| `useConfidentialIsApproved` (+ `Suspense`)                         | `useConfidentialIsOperator` (+ `Suspense`)                                                        | [4][s4] |
| token hooks taking `{ tokenAddress }`                              | positional `(address)` or `{ address }` — see the [convention table](#step-4-approvals-operators) | [4][s4] |
| `useUserDecrypt({ handles })`                                      | `useDecryptValues(inputs)` — renamed + arg shape change, see Step 5                               | [5][s5] |
| `usePublicDecrypt`                                                 | `useDecryptPublicValues` — public-decrypt mutation, see Step 5                                    | [5][s5] |
| `usePublicKey`, `usePublicParams`, `useRequestZKProofVerification` | **removed** — low-level key/proof hooks; the SDK handles these                                    | [5][s5] |
| `useReadonlyToken`                                                 | `useWrappedToken`                                                                                 | [6][s6] |
| `useActivityFeed`                                                  | **removed** (activity feed dropped)                                                               | [7][s7] |

---

## Step 1 — Migrate the SDK configuration

This is the central change and affects every integration. The imperative
"construct a `Signer`, construct a `Relayer`, pass them in" pattern is replaced by
a single declarative `createConfig({ chains, …client, relayers, storage })`.

Key shifts:

- Chain presets move to `@zama-fhe/sdk/chains` and expose `.id` (not `.chainId`).
- You no longer construct `ViemSigner` / `EthersSigner` / `WagmiSigner`. You pass
  the underlying clients (`publicClient` + `walletClient`, ethers `provider` +
  `signer`, or `wagmiConfig`) to `createConfig`.
- Relayers become factories (`web()` / `node()`) placed in a `relayers` map keyed
  by chain id. See [Step 2](#step-2-migrate-the-relayer).
- `new ZamaSDK(config)` / `<ZamaProvider config={config}>` take the object
  returned by `createConfig`.

### Node / backend (viem)

{% tabs %}
{% tab title="Before (2.x)" %}

```ts
import { MemoryStorage, ZamaSDK } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { RelayerNode } from "@zama-fhe/sdk/node";
import { sepolia } from "viem/chains";

const signer = new ViemSigner({ walletClient, publicClient });

const auth = RELAYER_API_KEY
  ? { __type: "ApiKeyHeader" as const, value: RELAYER_API_KEY }
  : undefined;

const relayer = new RelayerNode({
  getChainId: async () => sepolia.id,
  transports: {
    [sepolia.id]: { network: SEPOLIA_RPC_URL, ...(auth && { auth }) },
  },
});

using sdk = new ZamaSDK({ relayer, signer, storage: new MemoryStorage() });
```

{% endtab %}
{% tab title="After (3.x)" %}

```ts
import { MemoryStorage, ZamaSDK } from "@zama-fhe/sdk";
import { sepolia, type FheChain } from "@zama-fhe/sdk/chains";
import { createConfig } from "@zama-fhe/sdk/viem";
import { node } from "@zama-fhe/sdk/node";

const zamaSepolia = {
  ...sepolia,
  network: SEPOLIA_RPC_URL,
  ...(RELAYER_API_KEY && {
    auth: { __type: "ApiKeyHeader" as const, value: RELAYER_API_KEY },
  }),
} as const satisfies FheChain;

using sdk = new ZamaSDK(
  createConfig({
    chains: [zamaSepolia],
    publicClient,
    walletClient,
    storage: new MemoryStorage(),
    relayers: { [zamaSepolia.id]: node() },
  }),
);
```

{% endtab %}
{% endtabs %}

{% hint style="info" %}
If you also construct viem clients here (`createPublicClient` /
`createWalletClient`), import viem's own `sepolia` under an alias (e.g. `sepolia as
viemSepolia`) to avoid colliding with the `sepolia` preset from
`@zama-fhe/sdk/chains`.
{% endhint %}

### React (wagmi)

{% tabs %}
{% tab title="Before (2.x)" %}

```tsx
import { ZamaProvider, RelayerWeb, indexedDBStorage, IndexedDBStorage } from "@zama-fhe/react-sdk";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";
import { SepoliaConfig } from "@zama-fhe/sdk";

const signer = new WagmiSigner({ config: wagmiConfig });
const sessionDBStorage = new IndexedDBStorage("SessionStore");

const relayer = useMemo(
  () =>
    new RelayerWeb({
      getChainId: () => signer.getChainId(),
      transports: {
        [SepoliaConfig.chainId]: {
          ...SepoliaConfig,
          relayerUrl: `${window.location.origin}/api/relayer`,
          network: SEPOLIA_RPC_URL,
        },
      },
    }),
  [],
);

<WagmiProvider config={wagmiConfig}>
  <ZamaProvider
    relayer={relayer}
    signer={signer}
    storage={indexedDBStorage}
    sessionStorage={sessionDBStorage}
    onEvent={handleEvent}
  >
    {children}
  </ZamaProvider>
</WagmiProvider>;
```

{% endtab %}
{% tab title="After (3.x)" %}

```tsx
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { indexedDBStorage } from "@zama-fhe/sdk";
import { sepolia as fheSepolia, type FheChain } from "@zama-fhe/sdk/chains";
import { web } from "@zama-fhe/sdk/web";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

const mySepolia = {
  ...fheSepolia,
  relayerUrl: "/api/relayer",
  network: SEPOLIA_RPC_URL,
} as const satisfies FheChain;

const zamaConfig = createZamaConfig({
  chains: [mySepolia],
  wagmiConfig,
  relayers: { [mySepolia.id]: web() },
  storage: indexedDBStorage,
  // permitStorage defaults to `storage`; pass it only to split the backing store.
  onEvent: handleEvent,
});

<WagmiProvider config={wagmiConfig}>
  <QueryClientProvider client={queryClient}>
    <ZamaProvider config={zamaConfig}>{children}</ZamaProvider>
  </QueryClientProvider>
</WagmiProvider>;
```

The `react-sdk` hooks use TanStack Query internally, so the host app must wrap
`<ZamaProvider>` in a `QueryClientProvider` (a no-op change if your app already
has one). This is the one piece of required wiring that is not captured by
`createConfig`.

{% endtab %}
{% endtabs %}

Notes:

- The wagmi adapter creates the SDK signer/provider and subscribes to wagmi
  connection changes internally — no `useMemo` for the relayer and no
  `walletKey` remount pattern needed.
- The 2.x `sessionStorage` prop is **removed**. There is now a single `storage`
  option (permits reuse it via `permitStorage`, which defaults to `storage`), so
  the separate `new IndexedDBStorage("SessionStore")` is no longer required.
- All wiring (`relayer`, `signer`, `storage`, `onEvent`) moves into
  `createConfig`; `<ZamaProvider>` takes a single `config` prop.

### Other adapters

| Adapter       | `createConfig` import       | Clients to pass                                       |
| ------------- | --------------------------- | ----------------------------------------------------- |
| viem          | `@zama-fhe/sdk/viem`        | `publicClient`, `walletClient`                        |
| ethers        | `@zama-fhe/sdk/ethers`      | `provider`, `signer`                                  |
| wagmi (React) | `@zama-fhe/react-sdk/wagmi` | `wagmiConfig`                                         |
| generic       | `@zama-fhe/sdk`             | `provider`, `signer` (`GenericProvider`/`BaseSigner`) |

## Step 2 — Migrate the relayer

Relayers are no longer classes you instantiate; they are factories placed in a
`relayers` map keyed by chain id inside `createConfig`.

| 2.x                      | 3.x           | Import               |
| ------------------------ | ------------- | -------------------- |
| `new RelayerWeb({...})`  | `web()`       | `@zama-fhe/sdk/web`  |
| `new RelayerNode({...})` | `node()`      | `@zama-fhe/sdk/node` |
| (local dev mock)         | `cleartext()` | `@zama-fhe/sdk`      |

```ts
// Before
const relayer = new RelayerWeb({ getChainId, transports: { [id]: { ... } } });

// After — per-chain network/auth now lives on the chain preset (Step 1),
// the factory only selects the runtime.
relayers: { [chain.id]: web() }
```

The `getChainId` / `transports` plumbing is gone: the network endpoint, relayer
URL and auth are configured on the `FheChain` object (`network`, `relayerUrl`,
`auth`) and the SDK resolves the right relayer per chain via `RelayerDispatcher`.

{% hint style="info" %}
**Imported the relayer config types directly?** They followed the constructor →
factory move: `node()` / `web()` / `cleartext()` return `NodeRelayerConfig` /
`WebRelayerConfig` / `CleartextRelayerConfig` (all extend `RelayerConfig`). The
relayer-sdk-level `RelayerWebConfig` / `RelayerWebSecurityConfig` are unchanged
but now live under `@zama-fhe/sdk/web`.
{% endhint %}

{% hint style="info" %}
**Relayer auth (`FheChain.auth`).** Still `ApiKeyHeader | ApiKeyCookie | BearerToken`.
Pick by deployment: the **Zama-hosted relayer requires `ApiKeyHeader`** (sent as
`x-api-key` — Bearer and cookie are rejected at the edge); use `ApiKeyCookie` for
the SDK→proxy hop behind your own proxy, and `BearerToken` for a self-hosted
relayer whose auth layer expects it. Field names differ: `ApiKeyHeader` uses
`value`, `BearerToken` uses `token`.
{% endhint %}

## Step 3 — Permits & delegated decryption

The "credentials/session" vocabulary is replaced by the **permit** model. A
permit is a reusable EIP-712 signature granting your app decrypt rights for a set
of contracts. See the [Permit model](../concepts/permit-model.md) concept page.

The mental model changed, not just the names:

- **2.x:** your app held a **session** — a decrypt transport key pair
  (`useGenerateKeypair`) plus per-contract **credentials** (the grants).
- **3.x:** the SDK owns the transport key pair; you deal only with **permits**
  (the grants).
- That split is why there are two revocation hooks: `useRevokePermits` drops
  grants but keeps the transport key pair; `useClearCredentials` is a full logout
  that also wipes it.

In most apps you do **not** manage permits manually — decrypt hooks
(`useDecryptValues`, `useConfidentialBalance`) trigger the permit signature
automatically on first use. The explicit hooks are for gating that prompt and for
revocation. The full hook renames are in the [react-sdk symbol table](#zama-fhe-react-sdk-hooks).

Recommended pattern — gate any decrypt UI on `useHasPermit` so users don't get an
unsolicited wallet popup on render:

```tsx
import { useHasPermit, useGrantPermit } from "@zama-fhe/react-sdk";
import type { Address } from "viem";

function DecryptGate({
  contractAddresses,
  children,
}: {
  contractAddresses: Address[];
  children: React.ReactNode;
}) {
  const { data: hasPermit } = useHasPermit({ contractAddresses });
  const { mutate: grantPermit, isPending } = useGrantPermit();
  if (hasPermit) return <>{children}</>; // children can call useDecryptValues without a prompt
  return (
    <button onClick={() => grantPermit(contractAddresses)} disabled={isPending}>
      Enable decryption
    </button>
  );
}
```

SDK-level delegation **moved off the `Token` instance** onto the `sdk.delegations`
namespace, and now takes the contract address explicitly. Only `decryptBalanceAs`
stays on `Token`.

| 2.x                                                  | 3.x                                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `token.delegateDecryption({ delegateAddress })`      | `sdk.delegations.delegateDecryption({ contractAddress: token.address, delegateAddress })` |
| `token.revokeDelegation({ delegateAddress })`        | `sdk.delegations.revokeDelegation({ contractAddress: token.address, delegateAddress })`   |
| `token.getDelegationExpiry({ delegatorAddress, … })` | `sdk.delegations.getExpiry({ contractAddress, delegatorAddress, delegateAddress })`       |
| _(no Token-level status check)_                      | `sdk.delegations.isActive({ contractAddress, delegatorAddress, delegateAddress })`        |
| `token.decryptBalanceAs(...)`                        | **unchanged** — stays on `Token`                                                          |

## Step 4 — Approvals → operators

ERC-7984 uses an **operator** model instead of ERC-20-style allowances.

{% tabs %}
{% tab title="Before (2.x)" %}

```ts
await token.approve("0xSpender"); // default 1h
await token.approve("0xSpender", expiry); // custom expiry
const ok = await token.isApproved("0xSpender"); // self as owner
const ok2 = await token.isApproved("0xSpender", "0xOwner");
```

```tsx
const { mutateAsync: approve } = useConfidentialApprove({ tokenAddress });
const { data: isApproved } = useConfidentialIsApproved({ tokenAddress, spender: "0xSpender" });
await approve({ spender: "0xSpender" });
```

{% endtab %}
{% tab title="After (3.x)" %}

```ts
await token.setOperator("0xOperator"); // default 1h
await token.setOperator("0xOperator", expiry); // custom expiry
const ok = await token.isOperator("0xHolder", "0xSpender");
```

```tsx
const { mutateAsync: setOperator } = useConfidentialSetOperator(tokenAddress);
const { data: isOperator } = useConfidentialIsOperator({
  address: tokenAddress,
  holder: "0xHolder",
  spender: "0xOperator",
});
await setOperator({ operator: "0xOperator" });
```

{% endtab %}
{% endtabs %}

### The hook calling convention changed for every single-token hook

This is the easiest thing to under-migrate. The 2.x `UseZamaConfig` type
(`{ tokenAddress }`) was **removed**. Every single-token hook either takes the
token address **positionally** as its first argument, or keeps a config object
with the field renamed `tokenAddress` → `address`. Don't assume a hook is
unchanged just because its name is:

| Calling convention                                              | Hooks                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Positional — `useX(address, options?)`                          | `useConfidentialSetOperator`, `useConfidentialTransferFrom`, `useApproveUnderlying`, `useUnshield`, `useUnshieldAll`, `useUnwrap`, `useUnwrapAll`, `useResumeUnshield`, `useFinalizeUnwrap`, `useDelegateDecryption`, `useRevokeDelegation`, `useDecryptBalanceAs`, `useToken`, `useWrappedToken` |
| Config object — `useX({ address, … })` (was `{ tokenAddress }`) | `useShield`, `useConfidentialTransfer`, `useConfidentialBalance`, `useConfidentialBalances`, `useConfidentialIsOperator`, `useUnderlyingAllowance`, `useDelegationStatus`                                                                                                                         |

Read hooks that target a holder (`useConfidentialBalance`, `useConfidentialBalances`)
also now require an explicit `account`. On the SDK class side, `isOperator` takes
`(holder, spender)` whereas `isApproved` defaulted the owner to the caller.

### Balance reads now take the holder explicitly

The 2.x convenience of defaulting balance reads to the connected account is gone —
pass the holder address:

```ts
// Before: token.balanceOf();          After: token.balanceOf(owner)
const balance = await token.balanceOf(owner);
```

The React hook config changed to match: `useConfidentialBalance({ tokenAddress })`
becomes `useConfidentialBalance({ address, account })` — `address` is the token,
`account` is the holder to read.

## Step 5 — Encrypt (hex) & decrypt glossary

### Encrypt returns contract-ready hex

`encrypt` results are now hex strings ready to pass straight to a contract call —
no more `bytesToHex(...)`. The field `handles` is renamed `encryptedValues` (and
`inputProof` is hex too), and `extractEncryptedHandles(...)` is removed — read
`result.encryptedValues` directly.

{% tabs %}
{% tab title="Before (2.x)" %}

```ts
import { bytesToHex } from "viem";

const encrypted = await encrypt.mutateAsync({
  values: [{ value: 42n, type: "euint64" }],
  contractAddress,
  userAddress,
});

await sdk.signer.writeContract({
  address: contractAddress,
  abi,
  functionName: "store",
  args: [bytesToHex(encrypted.handles[0]!), bytesToHex(encrypted.inputProof)],
});
```

{% endtab %}
{% tab title="After (3.x)" %}

```ts
const encrypted = await encrypt.mutateAsync({
  values: [{ value: 42n, type: "euint64" }],
  contractAddress,
  userAddress,
});

if (!sdk.signer) throw new Error("No signer — connect a wallet to write");
await sdk.signer.writeContract({
  address: contractAddress,
  abi,
  functionName: "store",
  args: [encrypted.encryptedValues[0]!, encrypted.inputProof],
});
```

{% endtab %}
{% endtabs %}

{% hint style="info" %}
**`sdk.signer` may be `undefined` in 3.x.** In 2.x the signer was passed at
construction and always present; in 3.x it is `undefined` in read-only mode (no
wallet connected) — hence the `if (!sdk.signer) throw …` guard above. Prefer that
over asserting `sdk.signer!`, which only hides the `undefined` until it crashes at
the call site. Reads never need the signer — use `sdk.provider`.
{% endhint %}

### Decrypt glossary: `handle` → `encryptedValue`

`useUserDecrypt` was renamed `useDecryptValues`, and its argument changed: from an
object `{ handles }` to a positional array of `{ encryptedValue, contractAddress }`.
Result objects are keyed by `encryptedValue` (not `handle`). Reads also move from
`sdk.signer.readContract` to `sdk.provider.readContract` — `sdk.provider` is
always available, whereas in 2.x reads went through the signer.

{% tabs %}
{% tab title="Before (2.x)" %}

```tsx
import { useUserDecrypt } from "@zama-fhe/react-sdk";

const [handles, setHandles] = useState<{ handle: string; contractAddress: `0x${string}` }[]>([]);
const { data: decrypted } = useUserDecrypt({ handles });

const handle = (await sdk.signer.readContract({
  /* ... */
})) as string;
setHandles([{ handle, contractAddress }]);
// read result:
decrypted?.[handles[0].handle];
```

{% endtab %}
{% tab title="After (3.x)" %}

```tsx
import { useDecryptValues } from "@zama-fhe/react-sdk";

const [inputs, setInputs] = useState<{ encryptedValue: string; contractAddress: `0x${string}` }[]>(
  [],
);
const { data: decrypted } = useDecryptValues(inputs);

const encryptedValue = (await sdk.provider.readContract({
  /* ... */
})) as string;
setInputs([{ encryptedValue, contractAddress }]);
// read result:
decrypted?.[inputs[0].encryptedValue];
```

{% endtab %}
{% endtabs %}

Public (non-permit) decryption follows the same rename: `usePublicDecrypt` →
`useDecryptPublicValues`. Both are mutations, so only the hook name changes — no
permit is involved since the values are already publicly decryptable.

{% hint style="warning" %}
**Cache ownership changed.** `DecryptCache` and `applyDecryptedValues` were public
in 2.x; in 3.x the cache is internal and invalidates automatically (on
`permits.revokePermits()`, `permits.clear()`, wallet account/chain change, and
disconnect). There is **no** public API to populate or evict it — remove any 2.x
logic that did, as there's no compile-time signal for its loss.
{% endhint %}

### Key glossary: transport key pair & FHE encryption key

The glossary pass split two keys the old names blurred: the **transport key pair**
(your locally-held decrypt keys — `keypair*` → `transportKeyPair*`) and the
**FHE encryption key** (the network's input-encryption key — `getPublicKey()` /
`PublicKeyData` → `fetchFheEncryptionKeyBytes()` / `FheEncryptionKey`). The
[core symbol table](#zama-fhe-sdk-core) lists every rename; most apps touch none
of them, since `createConfig`, the `Token` API, and the hooks manage keys
internally.

{% hint style="info" %}
**Error codes are stable.** Only the error class names and `ZamaErrorCode` enum
keys changed (`KeypairExpiredError` → `TransportKeyPairExpiredError`, enum key
`KeypairExpired` → `TransportKeyPairExpired`, etc.). The string code **values**
(`KEYPAIR_EXPIRED` / `INVALID_KEYPAIR`) are unchanged, so `matchZamaError` and
`err.code === "KEYPAIR_EXPIRED"` checks keep working.
{% endhint %}

## Step 6 — Token / WrappedToken & upgraded contracts

- `ReadonlyToken` was the read-only base in 2.x. In 3.x the base read/transfer
  class is **`Token`**, and **`WrappedToken`** extends it with wrap/shield/unshield.
  Build them via `sdk.createToken(addr)` (read/transfer) or
  `sdk.createWrappedToken(addr)` — the 2.x `sdk.createReadonlyToken(addr)` is
  removed and `sdk.createToken(addr, wrapper?)` lost its second argument. The hook
  `useReadonlyToken` → `useWrappedToken`.
- The wrapper/registry contracts were upgraded in 3.0. If you read registry
  results, check the new `isValid` flag before using a wrapper:

```ts
const registryResult = await sdk.registry.getConfidentialToken(tokenAddress);
if (!registryResult || !registryResult.isValid) {
  throw new Error("No valid confidential wrapper registered");
}
const { confidentialTokenAddress } = registryResult;
```

- Unwrap events/results now carry a new optional `unwrapRequestId` field. If you
  decode unwrap events directly: `decodeUnwrappedFinalized` → `decodeUnwrapFinalized`
  (and `UnwrappedFinalizedEvent` → `UnwrapFinalizedEvent`), and the "started"
  decoder/event (`decodeUnwrappedStarted` / `UnwrappedStartedEvent`) were
  **removed**. If you only use `unshield`/`unshieldAll`/`useUnshield`, no change
  is needed.
- If you call `Token.finalizeUnwrap` directly (an escape hatch — most apps use
  `unshield`), its argument changed from `burnAmountHandle` to
  `unwrapRequestId: EncryptedValue` (the id returned by the request phase).
- If you read decoded transfer events directly, the field
  `ConfidentialTransferEvent.encryptedAmountHandle` was renamed `encryptedAmount`
  (part of the `handle` → `encryptedValue` glossary shift, Step 5).
- If you hardcoded `ERC7984_WRAPPER_INTERFACE_ID`, its value changed; import the
  constant instead of inlining it.

## Step 7 — Removed with no replacement

- **Activity feed** is gone: `useActivityFeed`, `parseActivityFeed`,
  `ActivityItem`, `ActivityAmount`, `ActivityType`, `activityFeedQueryOptions`,
  `deriveActivityFeedLogsKey`. Rebuild any history view from your own indexer or
  from on-chain event logs.
- Utility exports `totalSupplyContract`, `matchAclRevert`, `sortByBlockNumber`
  are removed.

## Validation checklist

After applying the steps:

1. `pnpm typecheck` — the SDK is strongly typed; most missed renames surface here.
2. Search your codebase for leftover 2.x symbols:

   ```bash
   rg -n 'ZamaSDKConfig|ViemSigner|EthersSigner|WagmiSigner|RelayerWeb|RelayerNode|SepoliaConfig|MainnetConfig|HardhatConfig|\.chainId\b|ReadonlyToken|useReadonlyToken|createReadonlyToken|useConfidentialApprove|useConfidentialIsApproved|token\.approve\(|token\.isApproved\(|\.handles\b|bytesToHex\(encrypted\.(handles|inputProof)|useActivityFeed|parseActivityFeed|CredentialsManager|extractEncryptedHandles|applyDecryptedValues|DecryptCache|useUserDecrypt|useDelegatedUserDecrypt|usePublicDecrypt|usePublicKey|usePublicParams|useAllow|useIsAllowed|useGenerateKeypair|useCreateEIP712|useRevokeSession|decodeUnwrapped(Finalized|Started)|encryptedAmountHandle|keypairTTL|KeypairType|KeypairExpiredError|InvalidKeypairError|StoredKeypair|PublicKeyData|ZERO_HANDLE|isZeroHandle|UserDecryptParams|PublicDecryptResult|DelegatedUserDecryptParams|DecryptHandle|\.getPublicKey\(|\.generateKeypair\(|\.warmKeypair\(|tokenAddress|\.balanceOf\(\)'
   ```

   A few atoms can still produce hits that don't need migrating — inspect rather
   than blind-replace: `.chainId` is legitimate on viem/EIP-1193 objects (only
   chain-preset accesses like `SepoliaConfig.chainId` migrate to `.id`),
   `token.approve(` only matters for the Zama confidential token (approving an
   underlying ERC-20 before a manual `wrap` is unchanged), and `tokenAddress`
   appears in plenty of your own variable names — only the hook config field
   migrates to `address`.

3. Verify the SDK is built once via `createConfig` and `<ZamaProvider>` /
   `new ZamaSDK` receive its result.
4. Run a smoke flow (shield → transfer → unshield, or encrypt → store → decrypt)
   against a testnet.

## Next steps

- [Configuration](configuration.md)
- [Operator approvals](operator-approvals.md)
- [Encrypt & decrypt](encrypt-decrypt.md)
- [Delegated decryption](delegated-decryption.md)
- [Permit model](../concepts/permit-model.md)

<!-- Step anchors for the Symbol mapping tables -->
[s1]: #step-1-migrate-the-sdk-configuration
[s2]: #step-2-migrate-the-relayer
[s3]: #step-3-permits-delegated-decryption
[s4]: #step-4-approvals-operators
[s5]: #step-5-encrypt-hex-decrypt-glossary
[s6]: #step-6-token-wrappedtoken-upgraded-contracts
[s7]: #step-7-removed-with-no-replacement
