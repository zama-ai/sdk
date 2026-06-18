---
title: Migrate from v2 to v3
description: Step-by-step guide to upgrade an app from @zama-fhe/sdk 2.x to 3.x — config factory, relayer factories, permits, operators, encrypt/decrypt glossary.
---

# Migrate from v2 to v3

This guide upgrades an application that uses `@zama-fhe/sdk` and `@zama-fhe/react-sdk` from **2.5.0** (the last 2.x release) to the **3.x** line.

It is written to be executed by an LLM or a developer: each step has an explicit
_Before (2.x)_ / _After (3.x)_ pair and a find/replace rule. Apply the steps in
order — Step 1 (configuration) unblocks everything else.

{% hint style="info" %}
**The good news.** The high-level token transfer/balance API is mostly unchanged.
`Token` methods (`shield`, `confidentialTransfer`, `unshield`, `unshieldAll`,
`decryptBalanceAs`, …) keep the same signatures. The bulk of the migration is
**how you construct the SDK** (Step 1) plus a set of mechanical renames. A few
surfaces did move: ERC-20-style `approve` became the operator model (Step 4),
token-level delegation moved to `sdk.delegations.*` (Step 3), and balance reads
now take the holder address explicitly (Step 4).
{% endhint %}

{% hint style="warning" %}
**Scope.** This guide targets the current 3.x line. Most of the developer-facing
changes landed in 3.1; the 3.0 major bump itself was driven by an on-chain
wrapper/registry contract upgrade (see Step 6) rather than TypeScript API changes.
{% endhint %}

## 0. Install

```bash
pnpm add @zama-fhe/sdk@^3 @zama-fhe/react-sdk@^3
# the react-sdk peer-depends on @zama-fhe/sdk@^3
```

## Symbol mapping (quick reference)

The tables below are the authoritative list of renames. Skim for the symbol you
need and jump to the cited **Step**, or read Steps 1→7 in order for a full
migration.

### `@zama-fhe/sdk` (core)

| 2.x                                                                        | 3.x                                                                                                              | Step |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---- |
| `ZamaSDKConfig`                                                            | `ZamaConfig` (+ `ZamaConfigViem`/`ZamaConfigEthers`/`ZamaConfigWagmi`)                                           | 1    |
| `new ZamaSDK({ relayer, signer, storage })`                                | `new ZamaSDK(createConfig({ chains, …client, relayers, storage }))`                                              | 1    |
| `SepoliaConfig` / `MainnetConfig` / `HardhatConfig` (from `@zama-fhe/sdk`) | `sepolia` / `mainnet` / `hardhat` (+ `hoodi`, `anvil`, `ingenTestnet`, `bscTestnet`) from `@zama-fhe/sdk/chains` | 1    |
| `<chainConfig>.chainId`                                                    | `<chain>.id`                                                                                                     | 1    |
| `ViemSigner` / `EthersSigner` (constructed)                                | pass `publicClient`/`walletClient` (or ethers `provider`/`signer`) to `createConfig`                             | 1    |
| `new RelayerWeb(...)`                                                      | `web()` from `@zama-fhe/sdk/web`                                                                                 | 2    |
| `new RelayerNode(...)`                                                     | `node()` from `@zama-fhe/sdk/node`                                                                               | 2    |
| `CredentialsManager` / `DelegatedCredentialsManager`                       | `Permits` / `Delegations` / `Decryption`                                                                         | 3    |
| `CredentialsManagerConfig`, `Credentials*Event`, `StoredCredentials`, …    | `Permission`, `StoredTransportKeyPair` (+ permit events)                                                         | 3    |
| `EncryptResult.handles` (bytes)                                            | `EncryptResult.encryptedValues` (hex)                                                                            | 5    |
| `EncryptResult.inputProof` (bytes)                                         | `EncryptResult.inputProof` (hex)                                                                                 | 5    |
| `extractEncryptedHandles(...)`                                             | **removed** — read `result.encryptedValues`                                                                      | 5    |
| `Handle` (type), `ClearValueType`                                          | `EncryptedValue` (term), `ClearValue`                                                                            | 5    |
| `applyDecryptedValues`, `DecryptCache`                                     | **removed** — handled by the SDK's internal cache                                                                | 5    |
| `ReadonlyToken`                                                            | `WrappedToken`                                                                                                   | 6    |
| `token.approve(spender[, expiry])`                                         | `token.setOperator(operator[, expiry])`                                                                          | 4    |
| `token.isApproved(spender[, owner])`                                       | `token.isOperator(holder, spender)`                                                                              | 4    |
| `token.balanceOf()` (self default)                                         | `token.balanceOf(owner)` — owner address now required                                                            | 4    |
| `parseActivityFeed`, `ActivityItem`, `ActivityAmount`, `ActivityType`      | **removed** (activity feed dropped)                                                                              | 7    |
| `totalSupplyContract`, `matchAclRevert`, `sortByBlockNumber`               | **removed**                                                                                                      | 7    |
| `keypairTTL` (config option)                                               | `transportKeyPairTTL`                                                                                            | 1    |
| `KeypairType`; relayer `getPublicKey()` / `generateKeypair()`              | `TransportKeyPair`; `fetchFheEncryptionKeyBytes()` / `generateTransportKeyPair()`                                | 5    |
| `KeypairExpiredError` / `InvalidKeypairError`                              | `TransportKeyPairExpiredError` / `InvalidTransportKeyPairError`                                                  | 5    |

### `@zama-fhe/react-sdk` (hooks)

| 2.x                                                            | 3.x                                                                 | Step |
| -------------------------------------------------------------- | ------------------------------------------------------------------- | ---- |
| `<ZamaProvider relayer signer storage sessionStorage onEvent>` | `<ZamaProvider config={createConfig({…})}>` (no `sessionStorage`)   | 1    |
| `new WagmiSigner({ config })`                                  | `createConfig` from `@zama-fhe/react-sdk/wagmi`                     | 1    |
| `useReadonlyToken`                                             | `useWrappedToken`                                                   | 6    |
| `useConfidentialApprove`                                       | `useConfidentialSetOperator`                                        | 4    |
| `useConfidentialIsApproved` (+ `Suspense`)                     | `useConfidentialIsOperator` (+ `Suspense`)                          | 4    |
| `useConfidentialBalance({ tokenAddress })`                     | `useConfidentialBalance({ address, account })` — holder explicit    | 4    |
| `useAllow` / `useIsAllowed`                                    | `useGrantPermit` / `useHasPermit`                                   | 3    |
| `useUserDecrypt({ handles })`                                  | `useDecryptValues(inputs)` — renamed + arg shape change, see Step 5 | 5    |
| `usePublicDecrypt`                                             | `useDecryptPublicValues` — public-decrypt mutation, see Step 5      | 5    |
| `useGenerateKeypair`                                           | **removed** — permits are managed by the SDK                        | 3    |
| `useCreateEIP712` / `useCreateDelegatedUserDecryptEIP712`      | **removed** — use `useGrantPermit`                                  | 3    |
| `useDelegatedUserDecrypt`                                      | `useDelegatedDecryptValues`                                         | 3    |
| `useRevoke`                                                    | `useRevokePermits` — revoke permits, keep the keypair               | 3    |
| `useRevokeSession`                                             | `useClearCredentials` — full logout (also wipes keypair)            | 3    |
| `useActivityFeed`                                              | **removed** (activity feed dropped)                                 | 7    |

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

If you imported the relayer **config types** directly, they followed the
constructor → factory move: the `node()` / `web()` / `cleartext()` factories
return `NodeRelayerConfig` / `WebRelayerConfig` / `CleartextRelayerConfig` (all
extend `RelayerConfig`). The relayer-sdk-level `RelayerWebConfig` /
`RelayerWebSecurityConfig` are unchanged but now live under `@zama-fhe/sdk/web`.

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

The mental model changed, not just the names. In 2.x your app held a **session**:
a decrypt **keypair** it generated (`useGenerateKeypair`) plus per-contract
**credentials** (the grants). In 3.x the SDK owns the keypair for you — you only
deal with **permits** (the grants). That split is exactly what separates the two
revocation hooks: `useRevokePermits` drops grants for some (or all) contracts but
keeps the keypair, while `useClearCredentials` is a full logout that also discards
the locally-managed keypair.

In most apps you do **not** manage permits manually — decrypt hooks
(`useDecryptValues`, `useConfidentialBalance`) trigger the permit signature
automatically on first use. The explicit hooks are for gating that prompt and for
revocation.

| 2.x                                                         | 3.x                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------- |
| `useAllow` / `useIsAllowed`                                 | `useGrantPermit` / `useHasPermit`                             |
| `useGenerateKeypair`, `useCreateEIP712`                     | **removed** — handled automatically; gate with `useHasPermit` |
| `useCreateDelegatedUserDecryptEIP712`                       | `useGrantPermit`                                              |
| `useDelegatedUserDecrypt`                                   | `useDelegatedDecryptValues`                                   |
| `useRevoke`                                                 | `useRevokePermits` — revokes permits, keeps the keypair       |
| `useRevokeSession`                                          | `useClearCredentials` — full logout, also wipes the keypair   |
| `CredentialsManager` / `DelegatedCredentialsManager` (core) | `Permits` / `Delegations` / `Decryption`                      |

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

Watch the signature changes — the React calling convention is **mixed**, so don't
blanket-convert. Only the single-token _mutation_ hooks
`useConfidentialSetOperator(address)` and `useConfidentialTransferFrom(address)`
take the token address **positionally**; the other token-scoped hooks
(`useConfidentialTransfer`, `useConfidentialBalance`, `useConfidentialIsOperator`)
still take a **config object** (with the holder now passed explicitly). On the SDK
side, `isOperator` takes `(holder, spender)` whereas `isApproved` defaulted the
owner to the caller.

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
no more `bytesToHex(...)`. The field `handles` is renamed `encryptedValues`, and
`extractEncryptedHandles(...)` is removed — read `result.encryptedValues` directly.

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
**Cache ownership changed.** In 2.x `DecryptCache` and `applyDecryptedValues` were
public — you could seed, prune, or clear the decrypt cache on your own schedule. In
3.x the cache is internal to the SDK: invalidation runs automatically on
`permits.revokePermits()`, `permits.clear()`, wallet account/chain change, and
disconnect. There is **no** public API for manual population or eviction. If your
2.x code called `applyDecryptedValues` or `DecryptCache.clearAll()` (e.g. in a
custom logout flow), remove that logic — there is no compile-time signal for it.
{% endhint %}

### Key glossary: `keypair` → `transport key pair`

The same glossary pass renamed the key vocabulary. Most apps never touch this —
`createConfig`, the `Token` API, and the hooks manage keys internally — so it
matters only if you set the key-pair TTL, catch the key errors, or call the
low-level relayer key API directly.

- **Config:** `keypairTTL` → `transportKeyPairTTL` (same seconds units), on `createConfig` / `ZamaConfig`.
- **Errors:** `KeypairExpiredError` / `InvalidKeypairError` → `TransportKeyPairExpiredError` / `InvalidTransportKeyPairError`. The error **code** strings are unchanged (`KEYPAIR_EXPIRED` / `INVALID_KEYPAIR`), so `matchZamaError` and `.code` checks keep working — only the imported class names changed.
- **Types:** `KeypairType` → `TransportKeyPair`; the persisted `StoredKeypair` → `StoredTransportKeyPair`.
- **Low-level relayer (rare):** `relayer.getPublicKey()` → `fetchFheEncryptionKeyBytes()`, `relayer.generateKeypair()` → `generateTransportKeyPair()` — the high-level SDK calls these for you. The internal credentials bundle (`CredentialBundle`) is no longer a public type; `permits.grantPermit()` returns `void`.

## Step 6 — Token / WrappedToken & upgraded contracts

- `ReadonlyToken` → `WrappedToken`; the hook `useReadonlyToken` → `useWrappedToken`.
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
  decode unwrap events directly, note the rename `decodeUnwrappedFinalized` →
  `decodeUnwrapFinalized` (and `UnwrappedFinalizedEvent` → `UnwrapFinalizedEvent`).
  If you only use `unshield`/`unshieldAll`/`useUnshield`, no change is needed.
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
   rg -n 'ZamaSDKConfig|ViemSigner|EthersSigner|WagmiSigner|RelayerWeb|RelayerNode|SepoliaConfig|MainnetConfig|HardhatConfig|\.chainId\b|ReadonlyToken|useReadonlyToken|useConfidentialApprove|useConfidentialIsApproved|token\.approve\(|token\.isApproved\(|\.handles\b|bytesToHex\(encrypted\.(handles|inputProof)|useActivityFeed|parseActivityFeed|CredentialsManager|extractEncryptedHandles|applyDecryptedValues|DecryptCache|useUserDecrypt|useDelegatedUserDecrypt|usePublicDecrypt|useAllow|useIsAllowed|useGenerateKeypair|useCreateEIP712|useRevokeSession|decodeUnwrappedFinalized|encryptedAmountHandle|keypairTTL|KeypairType|KeypairExpiredError|InvalidKeypairError|\.balanceOf\(\)'
   ```

   A few atoms can still produce hits that don't need migrating — inspect rather
   than blind-replace: `.chainId` is legitimate on viem/EIP-1193 objects (only
   chain-preset accesses like `SepoliaConfig.chainId` migrate to `.id`), and
   `token.approve(` only matters for the Zama confidential token — approving an
   underlying ERC-20 before a manual `wrap` is unchanged.

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
