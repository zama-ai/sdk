# Config-First API Redesign

**Date:** 2026-03-08
**Scope:** Breaking API changes to `createFhevmConfig`, `FhevmProvider`, wallet adapters, and relayer auto-resolution
**Strategy:** Clean break — replaces the manual wiring pattern with a config-first approach
**Supersedes:** Parts of `2026-02-25-sdk-api-improvements-design.md` (items 2, 3, 7, 10)

## Goal

Make the default setup feel like wagmi. Push every FHE-specific choice behind config defaults. Frontend developers should think about **chain**, **wallet**, **contract address**, and **value** — not verifier addresses, worker lifecycle, storage shape, or relayer mode.

## Before / After

### Before (current)

```tsx
import { RelayerWeb, WagmiSigner, indexedDBStorage, SepoliaConfig } from "@zama-fhe/sdk";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { getChainId } from "@wagmi/core";

// 1. Create relayer manually
const relayer = new RelayerWeb({
  transports: { [11155111]: SepoliaConfig },
  getChainId: async () => getChainId(wagmiConfig),
  security: { integrityCheck: true },
});

// 2. Create signer manually
const signer = new WagmiSigner({ config: wagmiConfig });

// 3. Create storage manually
const storage = indexedDBStorage();

// 4. Wire everything into provider
<ZamaProvider
  relayer={relayer}
  signer={signer}
  storage={storage}
  keypairTTL={86400}
  onEvent={(e) => analytics.track(e)}
>
  <App />
</ZamaProvider>;
```

### After (proposed)

```tsx
import { createFhevmConfig, wagmiAdapter } from "@zama-fhe/react-sdk";
import { FhevmProvider } from "@zama-fhe/react-sdk";
import { fhevmSepolia } from "@zama-fhe/sdk/chains";

const config = createFhevmConfig({
  chains: [fhevmSepolia],
  wallet: wagmiAdapter(),
});

<FhevmProvider config={config}>
  <App />
</FhevmProvider>;
```

## Design Decisions

### 1. `createFhevmConfig` — single entry point

```ts
function createFhevmConfig(options: FhevmConfigOptions): FhevmConfig;

interface FhevmConfigOptions {
  /** One or more chain definitions. */
  chains: FhevmChain[];

  /** Wallet signer. Omit for read-only browsing (auto read-only client from chain RPC). */
  wallet?: GenericSigner | WagmiAdapter;

  /** Override auto-resolved relayer. Omit to let chain definitions drive resolution. */
  relayer?: RelayerOverride;

  /** Credential/session storage. Defaults to memoryStorage(). */
  storage?: GenericStorage;

  /** Advanced tuning knobs. */
  advanced?: {
    /** WASM thread count (requires COOP/COEP headers). Default: 1. */
    threads?: number;
    /** ML-KEM keypair TTL in seconds. Default: 86400 (1 day). */
    keypairTTL?: number;
    /** Session signature TTL in seconds. Default: 2592000 (30 days). 0 = re-sign every op. */
    sessionTTL?: number;
    /** Event listener for debugging/telemetry. */
    onEvent?: ZamaSDKEventListener;
    /** CDN integrity verification. Default: true. */
    integrityCheck?: boolean;
  };
}
```

**Key property: `createFhevmConfig` returns a plain, inert config object.** No side effects, no worker allocation, no network requests. All instantiation is deferred to `FhevmProvider`.

### 2. Storage defaults to memory

```ts
// Default — nothing persists, safe, predictable
const config = createFhevmConfig({
  chains: [fhevmSepolia],
  wallet: wagmiAdapter(),
});
// storage = memoryStorage() — users re-sign on reload

// Opt in to persistence
const config = createFhevmConfig({
  chains: [fhevmSepolia],
  wallet: wagmiAdapter(),
  storage: indexedDBStorage(),
});
```

**Rationale:** The safe default is "nothing persists". Requiring explicit storage was too much friction for the getting-started path. Users who want sessions to survive reloads opt in to `indexedDBStorage()` or `chromeSessionStorage()`.

### 3. Chain identity separated from execution mode

Chain definitions are pure network descriptors. Execution mode (real FHE vs cleartext) is auto-resolved, not embedded in the chain object.

```ts
// Chain definition — no isMock, no mode
interface FhevmChain {
  id: number;
  name: string;
  // ... standard chain metadata
}

// Preset chains exported from @zama-fhe/sdk/chains
export const fhevmSepolia: FhevmChain;
export const fhevmMainnet: FhevmChain;
export const fhevmHardhat: FhevmChain;
```

### 4. Relayer auto-resolution

The relayer is **always** auto-resolved. No `relayer` field needed on the happy path. Every chain with an fhEVM deployment is a known chain with a preset in the SDK. Unknown chains default to cleartext mode.

**Resolution table:**

| Chain                | Resolved mode                          |
| -------------------- | -------------------------------------- |
| `mainnet` (1)        | Zama production relayer                |
| `sepolia` (11155111) | Zama testnet relayer                   |
| `hardhat` (31337)    | Cleartext (`HardhatCleartextConfig`)   |
| `hoodi` (560048)     | Cleartext (`hoodiCleartextConfig`)     |
| Unknown              | Cleartext (all fhEVM chains are known) |

**The `relayer` field exists only as an override** — to point a known chain at custom infrastructure:

```ts
const config = createFhevmConfig({
  chains: [fhevmSepolia],
  wallet: wagmiAdapter(),
  relayer: {
    transports: {
      [fhevmSepolia.id]: {
        relayerUrl: "https://my-self-hosted-relayer.example.com/v2",
        gatewayUrl: "https://my-gateway.example.com",
      },
    },
  },
});
```

**Relayer override type:**

```ts
interface RelayerOverride {
  transports: Record<number, Partial<FhevmInstanceConfig>>;
}
```

There is no `mode` field. Users never think about "cleartext" vs "real" — the SDK resolves that from the chain definition. The `relayer` field is purely for overriding transport URLs (self-hosted relayer, custom gateway).

### 5. `FhevmProvider` takes only config

```tsx
<FhevmProvider config={config}>
  <App />
</FhevmProvider>
```

No `relayer`, `signer`, `storage`, or wallet props on the provider. Everything comes from `config`. The provider is responsible for:

- Instantiating `RelayerWeb` or `CleartextFhevmInstance` (deferred from config)
- Resolving the wallet adapter into a `GenericSigner`
- Creating `ZamaSDK` and providing it via context
- Managing lifecycle (disposal, chain switching)

**Props type:**

```ts
interface FhevmProviderProps {
  config: FhevmConfig;
  /** Optional TanStack QueryClient. If omitted, uses the nearest QueryClientProvider. */
  queryClient?: QueryClient;
  children: React.ReactNode;
}
```

### 6. Wallet — optional, direct signers

The `wallet` field accepts either a `GenericSigner` directly (viem, ethers, custom) or `wagmiAdapter()` (the only adapter — needed because wagmi requires React context).

**When `wallet` is omitted**, `FhevmProvider` auto-creates a read-only client from the chain's RPC URL. Read hooks work (metadata, totalSupply, public decrypt). Write hooks throw `"No wallet connected"`.

#### No wallet (read-only browsing)

```ts
const config = createFhevmConfig({
  chains: [fhevmSepolia],
  // no wallet — read-only mode from chain RPC
});

<FhevmProvider config={config}>
  {/* useMetadata(addr) ✔ */}
  {/* useTotalSupply(addr) ✔ */}
  {/* useShield() → throws "No wallet connected" */}
</FhevmProvider>
```

Internally, `FhevmProvider` creates a minimal read-only signer:

```ts
// Inside FhevmProvider when wallet is omitted:
const signer = new ViemSigner({
  publicClient: createPublicClient({
    chain: config.chains[0],
    transport: http(config.chains[0].rpcUrl),
  }),
  // no walletClient — writes throw
});
```

#### wagmi (React — lazy, the only adapter)

```ts
import { wagmiAdapter } from "@zama-fhe/react-sdk/wagmi";

const config = createFhevmConfig({
  chains: [fhevmSepolia],
  wallet: wagmiAdapter(),
});
```

`wagmiAdapter()` is the only adapter factory. It returns a `{ type: 'wagmi' }` descriptor. Inside `FhevmProvider`, the wagmi `Config` is resolved via `useConfig()` and a `WagmiSigner` is created. Wallet connection/disconnection is handled reactively by wagmi — no config recreation needed.

#### viem (direct signer)

```ts
import { ViemSigner } from "@zama-fhe/sdk/viem";

const config = createFhevmConfig({
  chains: [fhevmSepolia],
  wallet: new ViemSigner({ walletClient, publicClient }),
});
```

#### ethers (direct signer)

```ts
import { EthersSigner } from "@zama-fhe/sdk/ethers";

const config = createFhevmConfig({
  chains: [fhevmSepolia],
  wallet: new EthersSigner({ ethereum: window.ethereum }),
});
```

#### Custom signer (escape hatch)

Any object implementing `GenericSigner`:

```ts
const config = createFhevmConfig({
  chains: [fhevmSepolia],
  wallet: myCustomSigner, // implements GenericSigner
});
```

#### Dynamic wallet connection (viem/ethers)

For non-wagmi React apps where the user connects after mount:

```ts
function App() {
  const [signer, setSigner] = useState<GenericSigner>();

  const config = useMemo(
    () => createFhevmConfig({ chains: [fhevmSepolia], wallet: signer }),
    [signer],
  );

  return (
    <FhevmProvider config={config}>
      <ConnectButton
        onConnect={(wc, pc) => setSigner(new ViemSigner({ walletClient: wc, publicClient: pc }))}
      />
      <App />
    </FhevmProvider>
  );
}
```

**Wallet type:**

```ts
/** Lazy wagmi adapter — resolved inside FhevmProvider via useConfig(). */
interface WagmiAdapter {
  type: "wagmi";
}

/** What createFhevmConfig accepts for the wallet field. */
type WalletOption = GenericSigner | WagmiAdapter;
```

### 7. Worker is fully automatic

No worker configuration in the happy path. The runtime environment determines the execution strategy:

| Environment    | Strategy                     |
| -------------- | ---------------------------- |
| Browser        | Web Worker (automatic)       |
| Node.js        | Direct / Node worker pool    |
| Cleartext mode | Lightweight client (no WASM) |

The `threads` knob is available under `advanced` for users who need WASM parallelism:

```ts
const config = createFhevmConfig({
  chains: [fhevmSepolia],
  wallet: wagmiAdapter(),
  advanced: {
    threads: 4, // requires COOP/COEP headers
  },
});
```

## Package export map (updated)

```
@zama-fhe/sdk              → core classes, types, ABIs, contract builders
@zama-fhe/sdk/chains       → chain definitions (sepolia, mainnet, hardhat) [NEW]
@zama-fhe/sdk/viem         → ViemSigner
@zama-fhe/sdk/ethers       → EthersSigner
@zama-fhe/sdk/query        → query/mutation option factories (unchanged)
@zama-fhe/sdk/cleartext    → CleartextFhevmInstance (unchanged)
@zama-fhe/sdk/node         → RelayerNode, worker pool (unchanged)

@zama-fhe/react-sdk        → FhevmProvider, createFhevmConfig, hooks, re-exports
@zama-fhe/react-sdk/wagmi  → wagmiAdapter(), WagmiSigner (kept for direct use)
```

## Migration guide (summary)

1. Replace `new RelayerWeb({...})` + `new WagmiSigner({...})` + `indexedDBStorage()` with `createFhevmConfig({ chains, wallet })`.
2. Replace `<ZamaProvider relayer={...} signer={...} storage={...}>` with `<FhevmProvider config={config}>`.
3. Replace `useZamaSDK()` with `useFhevmClient()`.
4. Import chain definitions from `@zama-fhe/sdk/chains`.
5. Move `keypairTTL`, `sessionTTL`, `onEvent` into `advanced` config.
6. If using custom relayer config, pass it via the `relayer` field on `createFhevmConfig`.
7. For wagmi users: replace `new WagmiSigner({ config })` with `wagmiAdapter()`. For viem/ethers users: pass your signer directly to `wallet`.
8. To support read-only browsing (no wallet), simply omit the `wallet` field.

## What this does NOT change

- Hook API surface (all hooks remain as-is)
- Query option factories (`@zama-fhe/sdk/query`)
- Token/ReadonlyToken class API
- Contract call builders
- Error types and `matchZamaError`
- Event system (`ZamaSDKEvents`)
- On-chain event decoders
- Activity feed helpers
- Query key structure
