# @zama-fhe/react-sdk

React hooks for confidential contract operations, built on [React Query](https://tanstack.com/query). Provides declarative, declarative hooks for session authorization, balances, confidential transfers, shielding, unshielding, and decryption — so you never deal with raw FHE operations in your components.

## Installation

```bash
pnpm add @zama-fhe/react-sdk @tanstack/react-query
# or
npm install @zama-fhe/react-sdk @tanstack/react-query
# or
yarn add @zama-fhe/react-sdk @tanstack/react-query
```

`@zama-fhe/sdk` is included as a direct dependency — no need to install it separately.

### Peer dependencies

| Package                 | Version | Required?                                     |
| ----------------------- | ------- | --------------------------------------------- |
| `react`                 | >= 18   | Yes                                           |
| `@tanstack/react-query` | >= 5    | Yes                                           |
| `viem`                  | >= 2    | Optional — for `/viem` and `/wagmi` sub-paths |
| `ethers`                | >= 6    | Optional — for `/ethers` sub-path             |
| `wagmi`                 | >= 2    | Optional — for `/wagmi` sub-path              |

## Quick Start

### With wagmi

```tsx
import { WagmiProvider, createConfig, http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider, RelayerWeb, indexedDBStorage } from "@zama-fhe/react-sdk";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";

const wagmiConfig = createConfig({
  chains: [mainnet, sepolia],
  transports: {
    [mainnet.id]: http("https://mainnet.infura.io/v3/YOUR_KEY"),
    [sepolia.id]: http("https://sepolia.infura.io/v3/YOUR_KEY"),
  },
});

const signer = new WagmiSigner({ config: wagmiConfig });

const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [mainnet.id]: {
      relayerUrl: "https://your-app.com/api/relayer/1",
      network: "https://mainnet.infura.io/v3/YOUR_KEY",
    },
    [sepolia.id]: {
      relayerUrl: "https://your-app.com/api/relayer/11155111",
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
  },
});

const queryClient = new QueryClient();

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ZamaProvider relayer={relayer} signer={signer} storage={indexedDBStorage}>
          <TokenBalance />
        </ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

function TokenBalance() {
  const { data: balance, isLoading } = useConfidentialBalance({ tokenAddress: "0xTokenAddress" });

  if (isLoading) return <p>Decrypting balance...</p>;
  return <p>Balance: {balance?.toString()}</p>;
}
```

### With a custom signer

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mainnet, sepolia } from "wagmi/chains"; // or define your own chain IDs
import {
  ZamaProvider,
  RelayerWeb,
  useConfidentialBalance,
  useConfidentialTransfer,
  memoryStorage,
} from "@zama-fhe/react-sdk";

const relayer = new RelayerWeb({
  getChainId: () => yourCustomSigner.getChainId(),
  transports: {
    [mainnet.id]: {
      relayerUrl: "https://your-app.com/api/relayer/1",
      network: "https://mainnet.infura.io/v3/YOUR_KEY",
    },
    [sepolia.id]: {
      relayerUrl: "https://your-app.com/api/relayer/11155111",
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
  },
});

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider relayer={relayer} signer={yourCustomSigner} storage={memoryStorage}>
        <TransferForm />
      </ZamaProvider>
    </QueryClientProvider>
  );
}

function TransferForm() {
  const { data: balance } = useConfidentialBalance({ tokenAddress: "0xTokenAddress" });
  const { mutateAsync: transfer, isPending } = useConfidentialTransfer({
    tokenAddress: "0xTokenAddress",
  });

  const handleTransfer = async () => {
    const txHash = await transfer({ to: "0xRecipient", amount: 100n });
    console.log("Transfer tx:", txHash);
  };

  return (
    <div>
      <p>Balance: {balance?.toString()}</p>
      <button onClick={handleTransfer} disabled={isPending}>
        {isPending ? "Transferring..." : "Send 100 tokens"}
      </button>
    </div>
  );
}
```

## Provider Setup

All setups use `ZamaProvider`. Create a signer with the adapter for your library, then pass it directly.

```tsx
import { ZamaProvider } from "@zama-fhe/react-sdk";

<ZamaProvider
  relayer={relayer} // RelayerSDK (RelayerWeb or RelayerNode instance)
  signer={signer} // GenericSigner (WagmiSigner, ViemSigner, EthersSigner, or custom)
  storage={storage} // GenericStorage
  sessionStorage={sessionStorage} // Optional. Session storage for wallet signatures. Default: in-memory (lost on reload).
  keypairTTL={2592000} // Optional. Seconds the ML-KEM keypair remains valid. Default: 2592000 (30 days).
  sessionTTL={2592000} // Optional. Seconds the session signature remains valid. Default: 2592000 (30 days). 0 = re-sign every operation.
  onEvent={(event) => console.debug(event)} // Optional. Structured event listener for debugging.
>
  {children}
</ZamaProvider>;
```

## Which Hooks Should I Use?

The React SDK exports hooks from two layers. **Pick one layer per operation — never mix them.**

**Use the main import** (`@zama-fhe/react-sdk`) when you have a `ZamaProvider` in your component tree. These hooks handle FHE encryption, cache invalidation, and error wrapping automatically:

```tsx
import { useShield, useConfidentialTransfer } from "@zama-fhe/react-sdk";

const { mutateAsync: shield } = useShield({ tokenAddress });
await shield({ amount: 1000n }); // encryption + approval handled for you
```

```tsx
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { EthersSigner } from "@zama-fhe/sdk/ethers";
```

The `WagmiSigner` is the only adapter in the react-sdk since wagmi is React-specific:

```tsx
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";
```

## Hooks Reference

All hooks require a `ZamaProvider` (or one of its variants) in the component tree.

### SDK Access

#### `useZamaSDK`

Returns the `ZamaSDK` instance from context. Use this when you need direct access to the SDK (e.g. for low-level relayer operations).

```ts
function useZamaSDK(): ZamaSDK;
```

#### `useToken`

Returns a `Token` instance for a given token address. The encrypted ERC-20 contract IS the wrapper, so `wrapperAddress` defaults to `tokenAddress`. Pass it only if they differ. Memoized — same config returns the same instance.

```ts
function useToken(config: { tokenAddress: Address; wrapperAddress?: Address }): Token;
```

#### `useReadonlyToken`

Returns a `ReadonlyToken` instance for a given token address (no wrapper needed). Memoized.

```ts
function useReadonlyToken(tokenAddress: Address): ReadonlyToken;
```

### Balance Hooks

#### `useConfidentialBalance`

Single-token balance with automatic decryption. Calls `token.balanceOf(owner)` which reads the on-chain handle and decrypts via the SDK. Cached values are returned instantly — the relayer is only hit when the handle changes. Pass `refetchInterval` to poll for updates.

```ts
function useConfidentialBalance(
  config: UseConfidentialBalanceConfig,
  options?: UseConfidentialBalanceOptions,
): UseQueryResult<bigint, Error>;

interface UseConfidentialBalanceConfig {
  tokenAddress: Address;
}
```

Options extend `UseQueryOptions`.

```tsx
const {
  data: balance,
  isLoading,
  error,
} = useConfidentialBalance(
  {
    tokenAddress: "0xTokenAddress",
  },
  { refetchInterval: 5_000 },
);
```

#### `useConfidentialBalances`

Multi-token batch balance. Calls `ReadonlyToken.batchBalancesOf()` which decrypts each token's balance via the SDK. Cached values are returned instantly — the relayer is only hit for changed handles. Returns partial results when some tokens fail.

```ts
function useConfidentialBalances(
  config: UseConfidentialBalancesConfig,
  options?: UseConfidentialBalancesOptions,
): UseQueryResult<BatchBalancesResult, Error>;

interface UseConfidentialBalancesConfig {
  tokenAddresses: Address[];
}

interface BatchBalancesResult {
  results: Map<Address, bigint>;
  errors: Map<Address, ZamaError>;
}
```

```tsx
const { data } = useConfidentialBalances({
  tokenAddresses: ["0xTokenA", "0xTokenB", "0xTokenC"],
});

const tokenABalance = data?.results.get("0xTokenA");
if (data && data.errors.size > 0) {
  // some tokens failed — check data.errors
}
```

### Authorization

#### `useAllow`

Pre-authorize FHE decrypt credentials for a list of contract addresses with a single wallet signature. Call this early (e.g. after wallet connect) so that subsequent decrypt operations reuse cached credentials without prompting the wallet again.

```ts
function useAllow(): UseMutationResult<void, Error, Address[]>;
```

```tsx
const { mutateAsync: allow, isPending } = useAllow();

// Pre-authorize all known contracts up front
await allow(allContractAddresses);

// Individual balance decrypts now reuse cached credentials
const { data: balance } = useConfidentialBalance({ tokenAddress: "0xTokenA" });
```

#### `useIsAllowed`

Check whether a session signature is cached, valid, and scoped to the contract addresses you want to decrypt. Returns `true` if decrypt operations can proceed without a wallet prompt. Use this to conditionally enable UI elements (e.g. a "Reveal Balances" button).

```ts
function useIsAllowed(config: {
  contractAddresses: [Address, ...Address[]];
}): UseQueryResult<boolean, Error>;
```

```tsx
const { data: allowed } = useIsAllowed({
  contractAddresses: ["0xTokenA"],
});

<button disabled={!allowed}>Reveal Balance</button>;
```

Automatically invalidated when `useAllow` or `useRevoke` succeed.

#### `useRevoke`

Revoke decrypt authorization for specific contract addresses. Stored credentials remain intact, but the next decrypt operation will require a fresh wallet signature.

```ts
function useRevoke(): UseMutationResult<void, Error, Address[]>;
```

```tsx
const { mutate: revoke } = useRevoke();

// Revoke — addresses are included in the credentials:revoked event
revoke(["0xContractA", "0xContractB"]);
```

### Transfer Hooks

#### `useConfidentialTransfer`

Encrypted transfer. Encrypts the amount and calls the contract. Automatically invalidates balance caches on success.

```ts
function useConfidentialTransfer(
  config: UseZamaConfig,
  options?: UseMutationOptions<Address, Error, ConfidentialTransferParams>,
): UseMutationResult<Address, Error, ConfidentialTransferParams>;

interface ConfidentialTransferParams {
  to: Address;
  amount: bigint;
}
```

```tsx
const { mutateAsync: transfer, isPending } = useConfidentialTransfer({
  tokenAddress: "0xTokenAddress",
});

const txHash = await transfer({ to: "0xRecipient", amount: 1000n });
```

#### `useConfidentialTransferFrom`

Operator transfer on behalf of another address.

```ts
function useConfidentialTransferFrom(
  config: UseZamaConfig,
  options?: UseMutationOptions<Address, Error, ConfidentialTransferFromParams>,
): UseMutationResult<Address, Error, ConfidentialTransferFromParams>;

interface ConfidentialTransferFromParams {
  from: Address;
  to: Address;
  amount: bigint;
}
```

### Shield Hooks

#### `useShield`

Shield public ERC-20 tokens into confidential tokens. Handles ERC-20 approval automatically.

```ts
function useShield(
  config: UseZamaConfig,
  options?: UseMutationOptions<Address, Error, ShieldParams>,
): UseMutationResult<Address, Error, ShieldParams>;

interface ShieldParams {
  amount: bigint;
  approvalStrategy?: "max" | "exact" | "skip"; // default: "exact"
}
```

```tsx
const { mutateAsync: shield } = useShield({ tokenAddress: "0xTokenAddress" });

// Shield 1000 tokens with exact approval (default)
await shield({ amount: 1000n });

// Shield with max approval
await shield({ amount: 1000n, approvalStrategy: "max" });
```

### Unshield Hooks (Combined)

These hooks orchestrate the full unshield flow in a single call: unwrap → wait for receipt → parse event → finalizeUnwrap. Use these for the simplest integration.

#### `useUnshield`

Unshield a specific amount. Handles the entire unwrap + finalize flow. Supports optional progress callbacks to track each step.

```ts
function useUnshield(
  config: UseZamaConfig,
  options?: UseMutationOptions<Address, Error, UnshieldParams>,
): UseMutationResult<Address, Error, UnshieldParams>;

interface UnshieldParams extends UnshieldCallbacks {
  amount: bigint;
  skipBalanceCheck?: boolean;
}
```

```tsx
const { mutateAsync: unshield, isPending } = useUnshield({
  tokenAddress: "0xTokenAddress",
});

const finalizeTxHash = await unshield({
  amount: 500n,
  onUnwrapSubmitted: (txHash) => console.log("Unwrap tx:", txHash),
  onFinalizing: () => console.log("Finalizing..."),
  onFinalizeSubmitted: (txHash) => console.log("Finalize tx:", txHash),
});
```

#### `useUnshieldAll`

Unshield the entire balance. Handles the entire unwrap + finalize flow. Supports optional progress callbacks.

```ts
function useUnshieldAll(
  config: UseZamaConfig,
  options?: UseMutationOptions<Address, Error, UnshieldAllParams | void>,
): UseMutationResult<Address, Error, UnshieldAllParams | void>;

interface UnshieldAllParams extends UnshieldCallbacks {}
```

```tsx
const { mutateAsync: unshieldAll } = useUnshieldAll({
  tokenAddress: "0xTokenAddress",
});

const finalizeTxHash = await unshieldAll();
```

#### `useResumeUnshield`

Resume an interrupted unshield from a saved unwrap tx hash. Useful when the user submitted the unwrap but the finalize step was interrupted (e.g. page reload, network error). Pair with the `savePendingUnshield`/`loadPendingUnshield`/`clearPendingUnshield` utilities for persistence.

```ts
function useResumeUnshield(
  config: UseZamaConfig,
  options?: UseMutationOptions<Address, Error, ResumeUnshieldParams>,
): UseMutationResult<Address, Error, ResumeUnshieldParams>;

interface ResumeUnshieldParams extends UnshieldCallbacks {
  unwrapTxHash: Hex;
}
```

```tsx
import { loadPendingUnshield, clearPendingUnshield } from "@zama-fhe/react-sdk";

const { mutateAsync: resumeUnshield } = useResumeUnshield({
  tokenAddress: "0xTokenAddress",
});

// On mount, check for interrupted unshields
const pending = await loadPendingUnshield(storage, wrapperAddress);
if (pending) {
  await resumeUnshield({ unwrapTxHash: pending });
  await clearPendingUnshield(storage, wrapperAddress);
}
```

#### Pending Unshield Persistence

Save the unwrap tx hash before finalization so interrupted unshields can be resumed after page reloads:

```ts
import {
  savePendingUnshield,
  loadPendingUnshield,
  clearPendingUnshield,
} from "@zama-fhe/react-sdk";

// Save before the finalize step
await savePendingUnshield(storage, wrapperAddress, unwrapTxHash);

// Load on next visit
const pending = await loadPendingUnshield(storage, wrapperAddress);

// Clear after successful finalization
await clearPendingUnshield(storage, wrapperAddress);
```

### Unwrap Hooks (Low-Level)

These hooks expose the individual unwrap steps. Use them when you need fine-grained control over the flow.

#### `useUnwrap`

Request unwrap for a specific amount (requires manual finalization via `useFinalizeUnwrap`).

```ts
function useUnwrap(
  config: UseZamaConfig,
  options?: UseMutationOptions<Address, Error, UnwrapParams>,
): UseMutationResult<Address, Error, UnwrapParams>;

interface UnwrapParams {
  amount: bigint;
}
```

#### `useUnwrapAll`

Request unwrap for the entire balance (requires manual finalization).

```ts
function useUnwrapAll(
  config: UseZamaConfig,
  options?: UseMutationOptions<Address, Error, void>,
): UseMutationResult<Address, Error, void>;
```

#### `useFinalizeUnwrap`

Complete an unwrap by providing the decryption proof.

```ts
function useFinalizeUnwrap(
  config: UseZamaConfig,
  options?: UseMutationOptions<Address, Error, FinalizeUnwrapParams>,
): UseMutationResult<Address, Error, FinalizeUnwrapParams>;

interface FinalizeUnwrapParams {
  burnAmountHandle: Address;
}
```

### Delegation Hooks

#### `useDelegateDecryption`

Grant decryption delegation to another address via the on-chain ACL. ACL address is resolved automatically from the relayer transport config.

```ts
function useDelegateDecryption(
  config: UseZamaConfig,
  options?: UseMutationOptions<TransactionResult, Error, DelegateDecryptionParams>,
): UseMutationResult<TransactionResult, Error, DelegateDecryptionParams>;

interface DelegateDecryptionParams {
  delegateAddress: Address;
  expirationDate?: Date;
}
```

```tsx
const { mutateAsync: delegate, isPending } = useDelegateDecryption({
  tokenAddress: "0xToken",
});

// Permanent delegation
await delegate({ delegateAddress: "0xDelegate" });

// With expiration
await delegate({
  delegateAddress: "0xDelegate",
  expirationDate: new Date("2025-12-31"),
});
```

#### `useDecryptBalanceAs`

Decrypt another user's balance as a delegate. Uses the delegated EIP-712 flow — the connected wallet signs as the delegate, and the relayer verifies the on-chain delegation.

```ts
function useDecryptBalanceAs(
  tokenAddress: Address,
  options?: UseMutationOptions<bigint, Error, DecryptBalanceAsParams>,
): UseMutationResult<bigint, Error, DecryptBalanceAsParams>;

interface DecryptBalanceAsParams {
  delegatorAddress: Address;
  owner?: Address;
}
```

```tsx
const { mutateAsync: decryptAs, data: balance } = useDecryptBalanceAs("0xToken");

// Decrypt the delegator's balance
const result = await decryptAs({ delegatorAddress: "0xDelegator" });
// result => bigint
```

### Approval Hooks

#### `useConfidentialApprove`

Set operator approval for the confidential token.

```ts
function useConfidentialApprove(
  config: UseZamaConfig,
  options?: UseMutationOptions<Address, Error, ConfidentialApproveParams>,
): UseMutationResult<Address, Error, ConfidentialApproveParams>;

interface ConfidentialApproveParams {
  spender: Address;
  until?: number; // Unix timestamp, defaults to now + 1 hour
}
```

#### `useConfidentialIsApproved`

Check if a spender is an approved operator. Enabled only when `spender` is defined.

```ts
function useConfidentialIsApproved(
  config: UseZamaConfig,
  spender: Address | undefined,
  options?: Omit<UseQueryOptions<boolean, Error>, "queryKey" | "queryFn">,
): UseQueryResult<boolean, Error>;
```

#### `useUnderlyingAllowance`

Read the underlying ERC-20 allowance granted to the wrapper.

```ts
function useUnderlyingAllowance(
  config: UseUnderlyingAllowanceConfig,
  options?: Omit<UseQueryOptions<bigint, Error>, "queryKey" | "queryFn">,
): UseQueryResult<bigint, Error>;

interface UseUnderlyingAllowanceConfig {
  tokenAddress: Address;
  wrapperAddress: Address;
}
```

### Discovery & Metadata

#### `useWrapperDiscovery`

Find the wrapper contract for a given token via the on-chain registry. Enabled only when `erc20Address` is defined. Results are cached indefinitely (`staleTime: Infinity`).

```ts
function useWrapperDiscovery(
  config: UseWrapperDiscoveryConfig,
  options?: Omit<UseQueryOptions<Address | null, Error>, "queryKey" | "queryFn">,
): UseQueryResult<Address | null, Error>;

interface UseWrapperDiscoveryConfig {
  tokenAddress: Address;
  erc20Address: Address | undefined;
}
```

#### `useTokenMetadata`

Fetch token name, symbol, and decimals in parallel. Cached indefinitely.

```ts
function useTokenMetadata(
  tokenAddress: Address,
  options?: Omit<UseQueryOptions<TokenMetadata, Error>, "queryKey" | "queryFn">,
): UseQueryResult<TokenMetadata, Error>;

interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
}
```

```tsx
const { data: meta } = useTokenMetadata("0xTokenAddress");
// meta?.name, meta?.symbol, meta?.decimals
```

### Low-Level FHE Hooks

These hooks are for **custom FHE contracts** (non-token contracts that use encrypted types directly). For confidential ERC-20 tokens, use the high-level token hooks above instead. For detailed usage examples, see the [Encrypt & Decrypt guide](../../docs/gitbook/src/guides/encrypt-decrypt.md).

#### Encryption

```tsx
const encrypt = useEncrypt();

const { handles, inputProof } = await encrypt.mutateAsync({
  values: [{ value: 1000n, type: "euint64" }],
  contractAddress: "0xYourContract",
  userAddress,
});

// Pass handles and inputProof to your contract call
```

#### Decryption (`useUserDecrypt`)

`useUserDecrypt` is a TanStack Query hook that manages the full decrypt orchestration — keypair generation, EIP-712, wallet signature — and reuses cached credentials when available, avoiding redundant wallet prompts. It is **disabled by default**; pass `enabled: true` to fire the query.

```tsx
const { data, isPending, isSuccess } = useUserDecrypt(
  {
    handles: [
      { handle: "0xabc...", contractAddress: "0xTokenA" },
      { handle: "0xdef...", contractAddress: "0xTokenB" },
    ],
  },
  { enabled: shouldDecrypt },
);
// data: { "0xabc...": 500n, "0xdef...": 1000n }
```

#### All Encryption & Decryption Hooks

| Hook                        | Input                        | Output                   | Description                                                                  |
| --------------------------- | ---------------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| `useEncrypt()`              | `EncryptParams`              | `EncryptResult`          | Encrypt values for smart contract calls.                                     |
| `useUserDecrypt()`          | `UserDecryptQueryConfig`     | `DecryptResult`          | User decryption query with TanStack Query semantics. Results cached.         |
| `usePublicDecrypt()`        | `string[]` (handles)         | `PublicDecryptResult`    | Public decryption (no authorization needed). Populates the decryption cache. |
| `useDelegatedUserDecrypt()` | `DelegatedUserDecryptParams` | `Record<string, bigint>` | Decrypt via delegation.                                                      |

#### Key Management

| Hook                                    | Input                                    | Output                              | Description                                          |
| --------------------------------------- | ---------------------------------------- | ----------------------------------- | ---------------------------------------------------- |
| `useGenerateKeypair()`                  | `void`                                   | `FHEKeypair`                        | Generate an FHE keypair.                             |
| `useCreateEIP712()`                     | `CreateEIP712Params`                     | `EIP712TypedData`                   | Create EIP-712 typed data for decrypt authorization. |
| `useCreateDelegatedUserDecryptEIP712()` | `CreateDelegatedUserDecryptEIP712Params` | `KmsDelegatedUserDecryptEIP712Type` | Create EIP-712 for delegated decryption.             |
| `useRequestZKProofVerification()`       | `ZKProofLike`                            | `InputProofBytesType`               | Submit a ZK proof for verification.                  |

#### Network

| Hook                | Input           | Output                                     | Description                           |
| ------------------- | --------------- | ------------------------------------------ | ------------------------------------- |
| `usePublicKey()`    | `void`          | `{ publicKeyId, publicKey } \| null`       | Get the TFHE compact public key.      |
| `usePublicParams()` | `number` (bits) | `{ publicParams, publicParamsId } \| null` | Get public parameters for encryption. |

## Query Keys

Use `zamaQueryKeys` for manual cache management (invalidation, prefetching, removal).

```ts
import { zamaQueryKeys, decryptionKeys } from "@zama-fhe/react-sdk";
```

| Factory                              | Keys                                                                        | Description                         |
| ------------------------------------ | --------------------------------------------------------------------------- | ----------------------------------- |
| `zamaQueryKeys.confidentialBalance`  | `.all`, `.token(address)`, `.owner(address, owner)`                         | Single-token decrypted balance.     |
| `zamaQueryKeys.confidentialBalances` | `.all`, `.tokens(addresses, owner)`                                         | Multi-token batch balances.         |
| `zamaQueryKeys.isAllowed`            | `.all`                                                                      | Session signature status.           |
| `zamaQueryKeys.underlyingAllowance`  | `.all`, `.token(address)`, `.scope(address, owner, wrapper)`                | Underlying ERC-20 allowance.        |
| `decryptionKeys`                     | `.value(handle)`                                                            | Individual decrypted handle values. |

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { zamaQueryKeys } from "@zama-fhe/react-sdk";

const queryClient = useQueryClient();

// Invalidate all balances
queryClient.invalidateQueries({ queryKey: zamaQueryKeys.confidentialBalance.all });

// Invalidate a specific token's balance
queryClient.invalidateQueries({
  queryKey: zamaQueryKeys.confidentialBalance.token("0xTokenAddress"),
});
```

## Wagmi Signer Adapter

```ts
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";

const signer = new WagmiSigner({ config: wagmiConfig });
```

## Signer Adapters

Signer adapters are provided by the core SDK package:

```ts
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { EthersSigner } from "@zama-fhe/sdk/ethers";
```

## Wallet Integration Guide

### SSR / Next.js

All components using SDK hooks must be client components. Add `"use client"` at the top of files that import from `@zama-fhe/react-sdk`. FHE operations (encryption, decryption) run in a Web Worker and require browser APIs — they cannot execute on the server.

```tsx
"use client";

import { useConfidentialBalance } from "@zama-fhe/react-sdk";
```

Place `ZamaProvider` inside your client-only layout. Do **not** create the relayer or signer at the module level in a server component — wrap them in a client component or use lazy initialization.

### FHE Credentials Lifecycle

FHE decrypt credentials are generated once per wallet + contract set and cached in the storage backend you provide (e.g. `IndexedDBStorage`). The wallet signature is kept **in memory only** — never persisted to disk. The lifecycle:

1. **First decrypt** — SDK generates an FHE keypair, creates EIP-712 typed data, and prompts the wallet to sign. The encrypted credential is stored; the signature is cached in memory.
2. **Same session** — Cached credentials and session signature are reused silently (no wallet prompt).
3. **Page reload** — Encrypted credentials are loaded from storage; the wallet is prompted once to re-sign for the session.
4. **Expiry** — Credentials expire based on `keypairTTL` (default: 2592000s = 30 days). After expiry, the next decrypt regenerates and re-prompts.
5. **Pre-authorization** — Call `useAllow(contractAddresses)` early to batch-authorize all contracts in one wallet prompt, avoiding repeated popups.
6. **Check status** — Use `useIsAllowed({ contractAddresses })` to conditionally enable UI elements (e.g. disable "Reveal" until allowed).
7. **Disconnect** — Call `useRevoke(contractAddresses)` or `await credentials.revoke()` to clear the session signature from memory.

### Web Extension Support

By default, wallet signatures are stored in memory and lost on page reload (or service worker restart). For MV3 web extensions, use the built-in `chromeSessionStorage` singleton so signatures survive service worker restarts and are shared across popup, background, and content script contexts:

```tsx
import { chromeSessionStorage } from "@zama-fhe/react-sdk";

<ZamaProvider
  relayer={relayer}
  signer={signer}
  storage={indexedDBStorage}
  sessionStorage={chromeSessionStorage}
>
  <App />
</ZamaProvider>;
```

This keeps the encrypted credentials in IndexedDB (persistent) while the unlock signature lives in `chrome.storage.session` (ephemeral, cleared when the browser closes).

### Error-to-User-Message Mapping

Map SDK errors to user-friendly messages in your UI:

```tsx
import {
  SigningRejectedError,
  EncryptionFailedError,
  DecryptionFailedError,
  TransactionRevertedError,
  ApprovalFailedError,
} from "@zama-fhe/react-sdk";

function getUserMessage(error: Error): string {
  if (error instanceof SigningRejectedError)
    return "Transaction cancelled — please approve in your wallet.";
  if (error instanceof EncryptionFailedError) return "Encryption failed — please try again.";
  if (error instanceof DecryptionFailedError) return "Decryption failed — please try again.";
  if (error instanceof ApprovalFailedError) return "Token approval failed — please try again.";
  if (error instanceof TransactionRevertedError)
    return "Transaction failed on-chain — check your balance.";
  return "An unexpected error occurred.";
}
```

Or use `matchZamaError` for a more concise pattern:

```tsx
import { matchZamaError } from "@zama-fhe/react-sdk";

const message = matchZamaError(error, {
  SIGNING_REJECTED: () => "Transaction cancelled — please approve in your wallet.",
  ENCRYPTION_FAILED: () => "Encryption failed — please try again.",
  DECRYPTION_FAILED: () => "Decryption failed — please try again.",
  APPROVAL_FAILED: () => "Token approval failed — please try again.",
  TRANSACTION_REVERTED: () => "Transaction failed on-chain — check your balance.",
  _: () => "An unexpected error occurred.",
});
```

### Balance Caching and Refresh

Balance queries call `token.balanceOf(owner)`, which reads the encrypted handle on-chain and decrypts via `sdk.userDecrypt`. The SDK's `DecryptCache` returns previously decrypted values instantly when the handle hasn't changed — the expensive relayer round-trip only runs when the balance actually changes. Pass `refetchInterval` to poll for on-chain updates.

Mutation hooks (`useConfidentialTransfer`, `useShield`, `useUnshield`, etc.) automatically invalidate the relevant caches on success, so the UI updates immediately after user actions.

To force a refresh:

```tsx
const queryClient = useQueryClient();
queryClient.invalidateQueries({ queryKey: zamaQueryKeys.confidentialBalance.all });
```

## Re-exports from Core SDK

All public exports from `@zama-fhe/sdk` are re-exported from the main entry point. You never need to import from the core package directly.

**Classes:** `RelayerWeb`, `ZamaSDK`, `Token`, `ReadonlyToken`, `MemoryStorage`, `memoryStorage`, `IndexedDBStorage`, `indexedDBStorage`, `CredentialsManager`.

**Network configs:** `SepoliaConfig`, `MainnetConfig`, `HardhatConfig`.

**Pending unshield:** `savePendingUnshield`, `loadPendingUnshield`, `clearPendingUnshield`.

**Types:** `Address`, `ZamaSDKConfig`, `ReadonlyTokenConfig`, `NetworkType`, `RelayerSDK`, `RelayerSDKStatus`, `EncryptResult`, `EncryptParams`, `UserDecryptParams`, `PublicDecryptResult`, `KeypairType`, `EIP712TypedData`, `DelegatedUserDecryptParams`, `KmsDelegatedUserDecryptEIP712Type`, `ZKProofLike`, `InputProofBytesType`, `StoredCredentials`, `GenericSigner`, `GenericStorage`, `TransactionReceipt`, `TransactionResult`, `UnshieldCallbacks`.

**Errors:** `ZamaError`, `ZamaErrorCode`, `SigningRejectedError`, `SigningFailedError`, `EncryptionFailedError`, `DecryptionFailedError`, `ApprovalFailedError`, `TransactionRevertedError`, `InvalidKeypairError`, `NoCiphertextError`, `RelayerRequestFailedError`, `matchZamaError`.

**Constants:** `ZERO_HANDLE`, `ERC7984_INTERFACE_ID`, `ERC7984_WRAPPER_INTERFACE_ID`.

**ABIs:** `ERC20_ABI`, `ERC20_METADATA_ABI`, `DEPLOYMENT_COORDINATOR_ABI`, `ERC165_ABI`, `ENCRYPTION_ABI`, `TRANSFER_BATCHER_ABI`, `WRAPPER_ABI`, `BATCH_SWAP_ABI`.

**Events:** `RawLog`, `ConfidentialTransferEvent`, `WrappedEvent`, `UnwrapRequestedEvent`, `UnwrappedFinalizedEvent`, `UnwrappedStartedEvent`, `OnChainEvent`, `Topics`, `TOKEN_TOPICS`.

**Event decoders:** `decodeConfidentialTransfer`, `decodeWrapped`, `decodeUnwrapRequested`, `decodeUnwrappedFinalized`, `decodeUnwrappedStarted`, `decodeOnChainEvent`, `decodeOnChainEvents`, `findUnwrapRequested`, `findWrapped`.

**Contract call builders:** `confidentialBalanceOfContract`, `confidentialTransferContract`, `confidentialTransferFromContract`, `isOperatorContract`, `unwrapContract`, `unwrapFromBalanceContract`, `finalizeUnwrapContract`, `setOperatorContract`, `underlyingContract`, `inferredTotalSupplyContract`, `wrapContract`, `supportsInterfaceContract`, `isConfidentialTokenContract`, `isConfidentialWrapperContract`, `nameContract`, `symbolContract`, `decimalsContract`, `allowanceContract`, `approveContract`, `confidentialTotalSupplyContract`, `totalSupplyContract`, `rateContract`.
