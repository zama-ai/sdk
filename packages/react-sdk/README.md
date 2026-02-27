# @zama-fhe/react-sdk

React hooks for confidential token operations, built on [React Query](https://tanstack.com/query). Provides declarative, cache-aware hooks for balances, confidential transfers, shielding, unshielding, and decryption — so you never deal with raw FHE operations in your components.

## Installation

```bash
pnpm add @zama-fhe/react-sdk @tanstack/react-query
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
  storage={storage} // GenericStringStorage
  sessionStorage={sessionStorage} // Optional. Session storage for wallet signatures. Default: in-memory (lost on reload).
  credentialDurationDays={1} // Optional. Days FHE credentials remain valid. Default: 1. Set 0 for sign-every-time.
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

Single-token balance with automatic decryption. Uses two-phase polling: polls the encrypted handle at a configurable interval, and only triggers the expensive decryption when the handle changes.

```ts
function useConfidentialBalance(
  config: UseConfidentialBalanceConfig,
  options?: UseConfidentialBalanceOptions,
): UseQueryResult<bigint, Error>;

interface UseConfidentialBalanceConfig {
  tokenAddress: Address;
  handleRefetchInterval?: number; // default: 10000ms
}
```

Options extend `UseQueryOptions`.

```tsx
const {
  data: balance,
  isLoading,
  error,
} = useConfidentialBalance({
  tokenAddress: "0xTokenAddress",
  handleRefetchInterval: 5_000,
});
```

#### `useConfidentialBalances`

Multi-token batch balance. Same two-phase polling pattern.

```ts
function useConfidentialBalances(
  config: UseConfidentialBalancesConfig,
  options?: UseConfidentialBalancesOptions,
): UseQueryResult<Map<Address, bigint>, Error>;

interface UseConfidentialBalancesConfig {
  tokenAddresses: Address[];
  handleRefetchInterval?: number;
  maxConcurrency?: number;
}
```

```tsx
const { data: balances } = useConfidentialBalances({
  tokenAddresses: ["0xTokenA", "0xTokenB", "0xTokenC"],
});

// balances is a Map<Address, bigint>
const tokenABalance = balances?.get("0xTokenA");
```

### Authorization

#### `useTokenAllow`

Pre-authorize FHE decrypt credentials for a list of token addresses with a single wallet signature. Call this early (e.g. after loading the token list) so that subsequent individual decrypt operations reuse cached credentials without prompting the wallet again.

```ts
function useTokenAllow(): UseMutationResult<void, Error, Address[]>;
```

```tsx
const { mutateAsync: tokenAllow, isPending } = useTokenAllow();

// Pre-authorize all known tokens up front
await tokenAllow(allTokenAddresses);

// Individual balance decrypts now reuse cached credentials
const { data: balance } = useConfidentialBalance("0xTokenA");
```

#### `useIsTokenAllowed`

Check whether a session signature is cached for a given token. Returns `true` if decrypt operations can proceed without a wallet prompt. Use this to conditionally enable UI elements (e.g. a "Reveal Balances" button).

```ts
function useIsTokenAllowed(tokenAddress: Address): UseQueryResult<boolean, Error>;
```

```tsx
const { data: allowed } = useIsTokenAllowed("0xTokenAddress");

<button disabled={!allowed}>Reveal Balance</button>;
```

Automatically invalidated when `useTokenAllow` or `useTokenRevoke` succeed.

#### `useTokenRevoke`

Revoke the session signature for the connected wallet. Stored credentials remain intact, but the next decrypt operation will require a fresh wallet signature.

```ts
function useTokenRevoke(): UseMutationResult<void, Error, Address[]>;
```

```tsx
const { mutate: tokenRevoke } = useTokenRevoke();

// Revoke session for specific tokens
tokenRevoke(["0xTokenA", "0xTokenB"]);
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

#### `useShieldETH`

Shield native ETH into confidential tokens. Use when the underlying token is the zero address (native ETH).

```ts
function useShieldETH(
  config: UseZamaConfig,
  options?: UseMutationOptions<Address, Error, ShieldETHParams>,
): UseMutationResult<Address, Error, ShieldETHParams>;

interface ShieldETHParams {
  amount: bigint;
  value?: bigint; // defaults to amount
}
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

interface UnshieldParams {
  amount: bigint;
  callbacks?: UnshieldCallbacks;
}
```

```tsx
const { mutateAsync: unshield, isPending } = useUnshield({
  tokenAddress: "0xTokenAddress",
});

const finalizeTxHash = await unshield({
  amount: 500n,
  callbacks: {
    onUnwrapSubmitted: (txHash) => console.log("Unwrap tx:", txHash),
    onFinalizing: () => console.log("Finalizing..."),
    onFinalizeSubmitted: (txHash) => console.log("Finalize tx:", txHash),
  },
});
```

#### `useUnshieldAll`

Unshield the entire balance. Handles the entire unwrap + finalize flow. Supports optional progress callbacks.

```ts
function useUnshieldAll(
  config: UseZamaConfig,
  options?: UseMutationOptions<Address, Error, UnshieldAllParams | void>,
): UseMutationResult<Address, Error, UnshieldAllParams | void>;

interface UnshieldAllParams {
  callbacks?: UnshieldCallbacks;
}
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

interface ResumeUnshieldParams {
  unwrapTxHash: Hex;
  callbacks?: UnshieldCallbacks;
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

Read the ERC-20 allowance of the underlying token for the wrapper.

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

Find the wrapper contract for a given token via the deployment coordinator. Enabled only when `coordinatorAddress` is defined. Results are cached indefinitely (`staleTime: Infinity`).

```ts
function useWrapperDiscovery(
  config: UseWrapperDiscoveryConfig,
  options?: Omit<UseQueryOptions<Address | null, Error>, "queryKey" | "queryFn">,
): UseQueryResult<Address | null, Error>;

interface UseWrapperDiscoveryConfig {
  tokenAddress: Address;
  coordinatorAddress: Address | undefined;
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

### Activity Feed

#### `useActivityFeed`

Parse raw event logs into a classified, optionally decrypted activity feed.

```ts
function useActivityFeed(config: UseActivityFeedConfig): UseQueryResult<ActivityItem[], Error>;

interface UseActivityFeedConfig {
  tokenAddress: Address;
  userAddress: Address | undefined;
  logs: readonly (RawLog & Partial<ActivityLogMetadata>)[] | undefined;
  decrypt?: boolean; // default: true — batch-decrypt encrypted amounts
}
```

Enabled when both `logs` and `userAddress` are defined. When `decrypt` is `true` (default), encrypted transfer amounts are automatically decrypted via the relayer.

```tsx
const { data: feed } = useActivityFeed({
  tokenAddress: "0xTokenAddress",
  logs, // from getLogs or a similar source
  userAddress,
  decrypt: true,
});

feed?.forEach((item) => {
  console.log(item.type, item.direction, item.amount);
});
```

### Fee Hooks

#### `useShieldFee`

Read the shield (wrap) fee for a given amount and address pair.

```ts
function useShieldFee(
  config: UseFeeConfig,
  options?: Omit<UseQueryOptions<bigint, Error>, "queryKey" | "queryFn">,
): UseQueryResult<bigint, Error>;

interface UseFeeConfig {
  feeManagerAddress: Address;
  amount: bigint;
  from: Address;
  to: Address;
}
```

```tsx
const { data: fee } = useShieldFee({
  feeManagerAddress: "0xFeeManager",
  amount: 1000n,
  from: "0xSender",
  to: "0xReceiver",
});
```

#### `useUnshieldFee`

Read the unshield (unwrap) fee for a given amount and address pair. Same signature as `useShieldFee`.

#### `useBatchTransferFee`

Read the batch transfer fee from the fee manager.

```ts
function useBatchTransferFee(
  feeManagerAddress: Address,
  options?: Omit<UseQueryOptions<bigint, Error>, "queryKey" | "queryFn">,
): UseQueryResult<bigint, Error>;
```

#### `useFeeRecipient`

Read the fee recipient address from the fee manager.

```ts
function useFeeRecipient(
  feeManagerAddress: Address,
  options?: Omit<UseQueryOptions<Address, Error>, "queryKey" | "queryFn">,
): UseQueryResult<Address, Error>;
```

### Low-Level FHE Hooks

These hooks expose the raw `RelayerSDK` operations as React Query mutations.

#### Encryption & Decryption

| Hook                        | Input                        | Output                   | Description                                                          |
| --------------------------- | ---------------------------- | ------------------------ | -------------------------------------------------------------------- |
| `useEncrypt()`              | `EncryptParams`              | `EncryptResult`          | Encrypt values for smart contract calls.                             |
| `useUserDecrypt()`          | `UserDecryptParams`          | `Record<string, bigint>` | Decrypt with user's FHE private key. Populates the decryption cache. |
| `usePublicDecrypt()`        | `string[]` (handles)         | `PublicDecryptResult`    | Public decryption. Populates the decryption cache.                   |
| `useDelegatedUserDecrypt()` | `DelegatedUserDecryptParams` | `Record<string, bigint>` | Decrypt via delegation.                                              |

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

### Decryption Cache Hooks

`useUserDecrypt` and `usePublicDecrypt` populate a shared React Query cache. These hooks read from that cache without triggering new decryption requests.

```ts
// Single handle
function useUserDecryptedValue(handle: string | undefined): UseQueryResult<bigint>;

// Multiple handles
function useUserDecryptedValues(handles: string[]): {
  data: Record<string, bigint | undefined>;
  results: UseQueryResult<bigint>[];
};
```

```tsx
// First, trigger decryption
const { mutateAsync: decrypt } = useUserDecrypt();
await decrypt(decryptParams);

// Then read cached results anywhere in the tree
const { data: value } = useUserDecryptedValue("0xHandleHash");
```

## Query Keys

Exported query key factories for manual cache management (invalidation, prefetching, removal).

```ts
import {
  confidentialBalanceQueryKeys,
  confidentialBalancesQueryKeys,
  confidentialHandleQueryKeys,
  confidentialHandlesQueryKeys,
  isAllowedQueryKeys,
  underlyingAllowanceQueryKeys,
  activityFeedQueryKeys,
  feeQueryKeys,
  decryptionKeys,
} from "@zama-fhe/react-sdk";
```

| Factory                         | Keys                                                                                     | Description                         |
| ------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------- |
| `confidentialBalanceQueryKeys`  | `.all`, `.token(address)`, `.owner(address, owner)`                                      | Single-token decrypted balance.     |
| `confidentialBalancesQueryKeys` | `.all`, `.tokens(addresses, owner)`                                                      | Multi-token batch balances.         |
| `confidentialHandleQueryKeys`   | `.all`, `.token(address)`, `.owner(address, owner)`                                      | Single-token encrypted handle.      |
| `confidentialHandlesQueryKeys`  | `.all`, `.tokens(addresses, owner)`                                                      | Multi-token batch handles.          |
| `isAllowedQueryKeys`            | `.all`, `.token(address)`                                                                | Session signature status.           |
| `underlyingAllowanceQueryKeys`  | `.all`, `.token(address, wrapper)`                                                       | Underlying ERC-20 allowance.        |
| `activityFeedQueryKeys`         | `.all`, `.token(address)`                                                                | Activity feed items.                |
| `feeQueryKeys`                  | `.shieldFee(...)`, `.unshieldFee(...)`, `.batchTransferFee(addr)`, `.feeRecipient(addr)` | Fee manager queries.                |
| `decryptionKeys`                | `.value(handle)`                                                                         | Individual decrypted handle values. |

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { confidentialBalanceQueryKeys } from "@zama-fhe/react-sdk";

const queryClient = useQueryClient();

// Invalidate all balances
queryClient.invalidateQueries({ queryKey: confidentialBalanceQueryKeys.all });

// Invalidate a specific token's balance
queryClient.invalidateQueries({
  queryKey: confidentialBalanceQueryKeys.token("0xTokenAddress"),
});
```

## Wagmi Adapter Hooks

`@zama-fhe/react-sdk/wagmi` exports low-level hooks that wrap wagmi's `useReadContract` and `useWriteContract` directly. These do **not** use the SDK provider for their contract calls — they operate through wagmi's `Config`. Use them for advanced scenarios where you need fine-grained control.

### Read Hooks

| Hook                                         | Parameters                      | Description                                                |
| -------------------------------------------- | ------------------------------- | ---------------------------------------------------------- |
| `useBalanceOf(token, user?)`                 | Token and optional user address | ERC-20 balance with symbol, decimals, and formatted value. |
| `useConfidentialBalanceOf(token?, user?)`    | Token and user addresses        | Read encrypted balance handle.                             |
| `useWrapperForToken(coordinator?, token?)`   | Coordinator and token addresses | Look up wrapper for token.                                 |
| `useUnderlyingToken(wrapper?)`               | Wrapper address                 | Read underlying ERC-20 address.                            |
| `useWrapperExists(coordinator?, token?)`     | Coordinator and token addresses | Check if wrapper exists.                                   |
| `useSupportsInterface(token?, interfaceId?)` | Token address and interface ID  | ERC-165 support check.                                     |

All read hooks are enabled only when their required parameters are defined. All read hooks have `*Suspense` variants for use with React Suspense boundaries.

### Write Hooks

All write hooks return `{ mutate, mutateAsync, ...mutation }` from wagmi's `useWriteContract`.

| Hook                             | Mutation Parameters                              | Description                   |
| -------------------------------- | ------------------------------------------------ | ----------------------------- |
| `useConfidentialTransfer()`      | `(token, to, handle, inputProof)`                | Encrypted transfer.           |
| `useConfidentialBatchTransfer()` | `(batcher, token, from, transfers, fees)`        | Batch encrypted transfer.     |
| `useUnwrap()`                    | `(token, from, to, encryptedAmount, inputProof)` | Request unwrap.               |
| `useUnwrapFromBalance()`         | `(token, from, to, encryptedBalance)`            | Unwrap using on-chain handle. |
| `useFinalizeUnwrap()`            | `(wrapper, burntAmount, cleartext, proof)`       | Finalize unwrap.              |
| `useSetOperator()`               | `(token, spender, timestamp?)`                   | Set operator approval.        |
| `useShield()`                    | `(wrapper, to, amount)`                          | Shield ERC-20 tokens.         |
| `useShieldETH()`                 | `(wrapper, to, amount, value)`                   | Shield native ETH.            |

### Wagmi Signer Adapter

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

FHE decrypt credentials are generated once per wallet + token set and cached in the storage backend you provide (e.g. `IndexedDBStorage`). The wallet signature is kept **in memory only** — never persisted to disk. The lifecycle:

1. **First decrypt** — SDK generates an FHE keypair, creates EIP-712 typed data, and prompts the wallet to sign. The encrypted credential is stored; the signature is cached in memory.
2. **Same session** — Cached credentials and session signature are reused silently (no wallet prompt).
3. **Page reload** — Encrypted credentials are loaded from storage; the wallet is prompted once to re-sign for the session.
4. **Expiry** — Credentials expire based on `credentialDurationDays`. After expiry, the next decrypt regenerates and re-prompts.
5. **Pre-authorization** — Call `useTokenAllow(tokenAddresses)` early to batch-authorize all tokens in one wallet prompt, avoiding repeated popups.
6. **Check status** — Use `useIsTokenAllowed(tokenAddress)` to conditionally enable UI elements (e.g. disable "Reveal" until allowed).
7. **Disconnect** — Call `useTokenRevoke(tokenAddresses)` or `await credentials.revoke()` to clear the session signature from memory.

### Web Extension Support

By default, wallet signatures are stored in memory and lost on page reload (or service worker restart). For MV3 web extensions, pass a `sessionStorage` backed by `chrome.storage.session` so signatures survive service worker restarts and are shared across popup, background, and content script contexts:

```ts
import type { GenericStringStorage } from "@zama-fhe/react-sdk";

const chromeSessionStorage: GenericStringStorage = {
  async getItem(key) {
    const result = await chrome.storage.session.get(key);
    return result[key] ?? null;
  },
  async setItem(key, value) {
    await chrome.storage.session.set({ [key]: value });
  },
  async removeItem(key) {
    await chrome.storage.session.remove(key);
  },
};
```

Then pass it to the provider:

```tsx
<ZamaProvider
  relayer={relayer}
  signer={signer}
  storage={indexedDBStorage}
  sessionStorage={chromeSessionStorage}
>
  <App />
</ZamaProvider>
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

Balance queries use two-phase polling:

1. **Phase 1 (cheap)** — Polls the encrypted balance handle via a read-only RPC call at `handleRefetchInterval` (default: 10s).
2. **Phase 2 (expensive)** — Only when the handle changes (i.e. balance updated on-chain), triggers an FHE decryption via the relayer.

This means balances update within `handleRefetchInterval` ms of any on-chain change, without wasting decryption resources. Mutation hooks (`useConfidentialTransfer`, `useShield`, `useUnshield`, etc.) automatically invalidate the relevant caches on success, so the UI updates immediately after user actions.

To force a refresh:

```tsx
const queryClient = useQueryClient();
queryClient.invalidateQueries({ queryKey: confidentialBalanceQueryKeys.all });
```

## Re-exports from Core SDK

All public exports from `@zama-fhe/sdk` are re-exported from the main entry point. You never need to import from the core package directly.

**Classes:** `RelayerWeb`, `ZamaSDK`, `Token`, `ReadonlyToken`, `MemoryStorage`, `memoryStorage`, `IndexedDBStorage`, `indexedDBStorage`, `CredentialsManager`.

**Network configs:** `SepoliaConfig`, `MainnetConfig`, `HardhatConfig`.

**Pending unshield:** `savePendingUnshield`, `loadPendingUnshield`, `clearPendingUnshield`.

**Types:** `Address`, `ZamaSDKConfig`, `ZamaConfig`, `ReadonlyTokenConfig`, `NetworkType`, `RelayerSDK`, `RelayerSDKStatus`, `EncryptResult`, `EncryptParams`, `UserDecryptParams`, `PublicDecryptResult`, `FHEKeypair`, `EIP712TypedData`, `DelegatedUserDecryptParams`, `KmsDelegatedUserDecryptEIP712Type`, `ZKProofLike`, `InputProofBytesType`, `BatchTransferData`, `StoredCredentials`, `GenericSigner`, `GenericStringStorage`, `ContractCallConfig`, `TransactionReceipt`, `TransactionResult`, `UnshieldCallbacks`.

**Errors:** `ZamaError`, `ZamaErrorCode`, `SigningRejectedError`, `SigningFailedError`, `EncryptionFailedError`, `DecryptionFailedError`, `ApprovalFailedError`, `TransactionRevertedError`, `InvalidCredentialsError`, `NoCiphertextError`, `RelayerRequestFailedError`, `matchZamaError`.

**Constants:** `ZERO_HANDLE`, `ERC7984_INTERFACE_ID`, `ERC7984_WRAPPER_INTERFACE_ID`.

**ABIs:** `ERC20_ABI`, `ERC20_METADATA_ABI`, `DEPLOYMENT_COORDINATOR_ABI`, `ERC165_ABI`, `ENCRYPTION_ABI`, `FEE_MANAGER_ABI`, `TRANSFER_BATCHER_ABI`, `WRAPPER_ABI`, `BATCH_SWAP_ABI`.

**Events:** `RawLog`, `ConfidentialTransferEvent`, `WrappedEvent`, `UnwrapRequestedEvent`, `UnwrappedFinalizedEvent`, `UnwrappedStartedEvent`, `OnChainEvent`, `Topics`, `TOKEN_TOPICS`.

**Event decoders:** `decodeConfidentialTransfer`, `decodeWrapped`, `decodeUnwrapRequested`, `decodeUnwrappedFinalized`, `decodeUnwrappedStarted`, `decodeOnChainEvent`, `decodeOnChainEvents`, `findUnwrapRequested`, `findWrapped`.

**Activity feed:** `ActivityDirection`, `ActivityType`, `ActivityAmount`, `ActivityLogMetadata`, `ActivityItem`, `parseActivityFeed`, `extractEncryptedHandles`, `applyDecryptedValues`, `sortByBlockNumber`.

**Contract call builders:** All 31 builders — `confidentialBalanceOfContract`, `confidentialTransferContract`, `confidentialTransferFromContract`, `isOperatorContract`, `confidentialBatchTransferContract`, `unwrapContract`, `unwrapFromBalanceContract`, `finalizeUnwrapContract`, `setOperatorContract`, `getWrapperContract`, `wrapperExistsContract`, `underlyingContract`, `wrapContract`, `wrapETHContract`, `supportsInterfaceContract`, `nameContract`, `symbolContract`, `decimalsContract`, `allowanceContract`, `approveContract`, `confidentialTotalSupplyContract`, `totalSupplyContract`, `rateContract`, `deploymentCoordinatorContract`, `isFinalizeUnwrapOperatorContract`, `setFinalizeUnwrapOperatorContract`, `getWrapFeeContract`, `getUnwrapFeeContract`, `getBatchTransferFeeContract`, `getFeeRecipientContract`.
