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
**The good news.** The high-level token API did **not** change. `Token` methods
(`shield`, `confidentialTransfer`, `unshield`, `unshieldAll`, `balanceOf`,
`setOperator`, `delegateDecryption`, `decryptBalanceAs`, …) keep the same
signatures. The bulk of the migration is **how you construct the SDK** (Step 1)
plus a set of mechanical renames.
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

The single source of truth for mechanical renames. `—` means _removed with no
direct replacement_ (see the relevant step).

### `@zama-fhe/sdk` (core)

| 2.x                                                                        | 3.x                                                                                    | Step |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---- |
| `ZamaSDKConfig`                                                            | `ZamaConfig` (+ `ZamaConfigViem`/`ZamaConfigEthers`/`ZamaConfigWagmi`)                 | 1    |
| `new ZamaSDK({ relayer, signer, storage })`                                | `new ZamaSDK(createConfig({ chains, …client, relayers, storage }))`                    | 1    |
| `SepoliaConfig` / `MainnetConfig` / `HardhatConfig` (from `@zama-fhe/sdk`) | `sepolia` / `mainnet` / `hardhat` (+ `anvil`, `hoodi`) from `@zama-fhe/sdk/chains`     | 1    |
| `<chainConfig>.chainId`                                                    | `<chain>.id`                                                                           | 1    |
| `ViemSigner` / `EthersSigner` (constructed)                                | pass `publicClient`/`walletClient` (or ethers `provider`/`signer`) to `createConfig`   | 1    |
| `new RelayerWeb(...)`                                                      | `web()` from `@zama-fhe/sdk/web`                                                       | 2    |
| `new RelayerNode(...)`                                                     | `node()` from `@zama-fhe/sdk/node`                                                     | 2    |
| `RelayerWebConfig` / `RelayerWebSecurityConfig` / `RelayerNode`            | `RelayerConfig` / `CleartextRelayerConfig` / `NodeRelayerConfig` / `RelayerDispatcher` | 2    |
| `buildRelayer(...)`                                                        | **removed** — use `web()`/`node()`/`cleartext()` factories                             | 2    |
| `CredentialsManager` / `DelegatedCredentialsManager`                       | `Permits` / `Delegations` / `Decryption`                                               | 3    |
| `CredentialsManagerConfig`, `Credentials*Event`, `StoredCredentials`, …    | `CredentialBundle`, `Permission`, `StoredKeypair` (+ permit events)                    | 3    |
| `EncryptResult.handles` (bytes)                                            | `EncryptResult.encryptedValues` (hex)                                                  | 5    |
| `EncryptResult.inputProof` (bytes)                                         | `EncryptResult.inputProof` (hex)                                                       | 5    |
| `extractEncryptedHandles(...)`                                             | **removed** — read `result.encryptedValues`                                            | 5    |
| `Handle` (type), `ClearValueType`                                          | `EncryptedValue` (term), `ClearValue`                                                  | 5    |
| `applyDecryptedValues`, `DecryptCache`                                     | **removed** — handled by the SDK CachingService                                        | 5    |
| `ReadonlyToken`                                                            | `WrappedToken`                                                                         | 6    |
| `token.approve(spender[, expiry])`                                         | `token.setOperator(operator[, expiry])`                                                | 4    |
| `token.isApproved(spender[, owner])`                                       | `token.isOperator(holder, spender)`                                                    | 4    |
| `parseActivityFeed`, `ActivityItem`, `ActivityAmount`, `ActivityType`      | **removed** (activity feed dropped)                                                    | 7    |
| `totalSupplyContract`, `matchAclRevert`, `sortByBlockNumber`               | **removed**                                                                            | 7    |

### `@zama-fhe/react-sdk` (hooks)

| 2.x                                                            | 3.x                                                        | Step |
| -------------------------------------------------------------- | ---------------------------------------------------------- | ---- |
| `<ZamaProvider relayer signer storage sessionStorage onEvent>` | `<ZamaProvider config={createConfig({…})}>`                | 1    |
| `new WagmiSigner({ config })`                                  | `createConfig` from `@zama-fhe/react-sdk/wagmi`            | 1    |
| `useReadonlyToken`                                             | `useWrappedToken`                                          | 6    |
| `useConfidentialApprove`                                       | `useConfidentialSetOperator`                               | 4    |
| `useConfidentialIsApproved` (+ `Suspense`)                     | `useConfidentialIsOperator` (+ `Suspense`)                 | 4    |
| `useAllow` / `useIsAllowed`                                    | `useConfidentialSetOperator` / `useConfidentialIsOperator` | 4    |
| `useUserDecrypt({ handles })`                                  | `useUserDecrypt(inputs)` — arg shape change, see Step 5    | 5    |
| `useGenerateKeypair`                                           | **removed** — permits are managed by the SDK               | 3    |
| `useCreateEIP712` / `useCreateDelegatedUserDecryptEIP712`      | **removed** — use `useGrantPermit`                         | 3    |
| `useDelegatedUserDecrypt`                                      | `useDelegatedDecrypt`                                      | 3    |
| `useRevokeSession`, `useRevoke`                                | `useRevokePermits` / `useClearCredentials`                 | 3    |
| `useActivityFeed`                                              | **removed** (activity feed dropped)                        | 7    |

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
Import viem's own `sepolia` under an alias (e.g. `sepolia as viemSepolia`) to
avoid colliding with the `sepolia` preset from `@zama-fhe/sdk/chains`. viem's
chain is still used for `createPublicClient`/`createWalletClient`.
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
  sessionStorage: indexedDBStorage,
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
- `storage` and `sessionStorage` can now share the same `indexedDBStorage`
  instance; the separate `new IndexedDBStorage("SessionStore")` is no longer
  required.
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
| `buildRelayer(...)`      | **removed**   | —                    |

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

## Step 3 — Permits & delegated decryption

The "credentials/session" vocabulary is replaced by the **permit** model. A
permit is a reusable EIP-712 signature granting your app decrypt rights for a set
of contracts. See the [Permit model](/concepts/permit-model) concept page.

In most apps you do **not** manage permits manually — decrypt hooks
(`useUserDecrypt`, `useConfidentialBalance`) trigger the permit signature
automatically on first use. The explicit hooks are for gating that prompt and for
revocation.

| 2.x                                                         | 3.x                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------- |
| `useGenerateKeypair`, `useCreateEIP712`                     | **removed** — handled automatically; gate with `useHasPermit` |
| `useCreateDelegatedUserDecryptEIP712`                       | `useGrantPermit`                                              |
| `useDelegatedUserDecrypt`                                   | `useDelegatedDecrypt`                                         |
| `useRevokeSession`, `useRevoke`                             | `useRevokePermits` / `useClearCredentials`                    |
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
  if (hasPermit) return <>{children}</>; // children can call useUserDecrypt without a prompt
  return (
    <button onClick={() => grantPermit(contractAddresses)} disabled={isPending}>
      Enable decryption
    </button>
  );
}
```

SDK-level delegation on a token instance is unchanged
(`token.delegateDecryption`, `token.isDelegated`, `token.revokeDelegation`,
`token.decryptBalanceAs`).

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

Watch the signature changes: the token-scoped React hooks now take `tokenAddress`
**positionally** (`useConfidentialSetOperator(tokenAddress)`,
`useConfidentialTransferFrom(tokenAddress)`) instead of `({ tokenAddress })`. The
SDK method `isOperator` takes `(holder, spender)` whereas `isApproved` defaulted
the owner to the caller.

## Step 5 — Encrypt (hex) & decrypt glossary

### Encrypt returns contract-ready hex

`encrypt` results are now hex strings ready to pass straight to a contract call —
no more `bytesToHex(...)`. The field `handles` is renamed `encryptedValues`.

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

await sdk.signer!.writeContract({
  address: contractAddress,
  abi,
  functionName: "store",
  args: [encrypted.encryptedValues[0]!, encrypted.inputProof],
});
```

{% endtab %}
{% endtabs %}

### Decrypt glossary: `handle` → `encryptedValue`

`useUserDecrypt` keeps its name but its argument changed: from an object
`{ handles }` to a positional array of `{ encryptedValue, contractAddress }`.
Result objects are keyed by `encryptedValue` (not `handle`). Reads move from
`sdk.signer` to `sdk.provider`, and `sdk.signer` is now nullable (`sdk.signer!`).

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
import { useUserDecrypt } from "@zama-fhe/react-sdk";

const [inputs, setInputs] = useState<{ encryptedValue: string; contractAddress: `0x${string}` }[]>(
  [],
);
const { data: decrypted } = useUserDecrypt(inputs);

const encryptedValue = (await sdk.provider.readContract({
  /* ... */
})) as string;
setInputs([{ encryptedValue, contractAddress }]);
// read result:
decrypted?.[inputs[0].encryptedValue];
```

{% endtab %}
{% endtabs %}

`applyDecryptedValues` / `DecryptCache` are removed — caching is handled by the
SDK's internal CachingService (scoped per signer + contract, survives reloads).

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
- If you hardcoded `ERC7984_WRAPPER_INTERFACE_ID`, its value changed; import the
  constant instead of inlining it.

## Step 7 — Removed with no replacement

- **Activity feed** is gone: `useActivityFeed`, `parseActivityFeed`,
  `ActivityItem`, `ActivityAmount`, `ActivityType`, `activityFeedQueryOptions`,
  `deriveActivityFeedLogsKey`. Rebuild any history view from your own indexer or
  from on-chain event logs.
- Utility exports `totalSupplyContract`, `matchAclRevert`, `sortByBlockNumber`,
  `extractEncryptedHandles` are removed.

## Validation checklist

After applying the steps:

1. `pnpm typecheck` — the SDK is strongly typed; most missed renames surface here.
2. Search your codebase for leftover 2.x symbols:

   ```bash
   rg -n 'ZamaSDKConfig|ViemSigner|WagmiSigner|RelayerWeb|RelayerNode|buildRelayer|SepoliaConfig|MainnetConfig|HardhatConfig|\.chainId|ReadonlyToken|useReadonlyToken|useConfidentialApprove|useConfidentialIsApproved|\.approve\(|\.isApproved\(|\.handles\b|bytesToHex\(.*encrypted|useActivityFeed|CredentialsManager|extractEncryptedHandles'
   ```

3. Verify the SDK is built once via `createConfig` and `<ZamaProvider>` /
   `new ZamaSDK` receive its result.
4. Run a smoke flow (shield → transfer → unshield, or encrypt → store → decrypt)
   against a testnet.

## See also

- [Configuration](/guides/configuration)
- [Operator approvals](/guides/operator-approvals)
- [Encrypt & decrypt](/guides/encrypt-decrypt)
- [Delegated decryption](/guides/delegated-decryption)
- [Permit model](/concepts/permit-model)
