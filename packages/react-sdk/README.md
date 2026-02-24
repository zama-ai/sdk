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
import { TokenSDKProvider, RelayerWeb, indexedDBStorage } from "@zama-fhe/react-sdk";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";

const queryClient = new QueryClient();

const wagmiConfig = createConfig({
  chains: [mainnet, sepolia],
  transports: {
    [mainnet.id]: http("https://mainnet.infura.io/v3/YOUR_KEY"),
    [sepolia.id]: http("https://sepolia.infura.io/v3/YOUR_KEY"),
  },
});

const signer = new WagmiSigner(wagmiConfig);

const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [mainnet.id]: {
      relayerUrl: "https://relayer.zama.ai",
      network: "https://mainnet.infura.io/v3/YOUR_KEY",
    },
    [sepolia.id]: {
      relayerUrl: "https://relayer.zama.ai",
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
  },
});

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <TokenSDKProvider relayer={relayer} signer={signer} storage={indexedDBStorage}>
          <TokenBalance />
        </TokenSDKProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

function TokenBalance() {
  const { data: balance, isLoading } = useConfidentialBalance("0xTokenAddress");

  if (isLoading) return <p>Decrypting balance...</p>;
  return <p>Balance: {balance?.toString()}</p>;
}
```

### With a custom signer

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mainnet, sepolia } from "wagmi/chains"; // or define your own chain IDs
import {
  TokenSDKProvider,
  RelayerWeb,
  useConfidentialBalance,
  useConfidentialTransfer,
  MemoryStorage,
} from "@zama-fhe/react-sdk";

const queryClient = new QueryClient();

const relayer = new RelayerWeb({
  getChainId: () => yourCustomSigner.getChainId(),
  transports: {
    [mainnet.id]: {
      relayerUrl: "https://relayer.zama.ai",
      network: "https://mainnet.infura.io/v3/YOUR_KEY",
    },
    [sepolia.id]: {
      relayerUrl: "https://relayer.zama.ai",
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TokenSDKProvider relayer={relayer} signer={yourCustomSigner} storage={new MemoryStorage()}>
        <TransferForm />
      </TokenSDKProvider>
    </QueryClientProvider>
  );
}

function TransferForm() {
  const { data: balance } = useConfidentialBalance("0xTokenAddress");
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

All setups use `TokenSDKProvider`. Create a signer with the adapter for your library, then pass it directly.

```tsx
import { TokenSDKProvider } from "@zama-fhe/react-sdk";

<TokenSDKProvider
  relayer={relayer} // RelayerSDK (RelayerWeb or RelayerNode instance)
  signer={signer} // GenericSigner (WagmiSigner, ViemSigner, EthersSigner, or custom)
  storage={storage} // GenericStringStorage
>
  {children}
</TokenSDKProvider>;
```

## Hooks Reference

All hooks require a `TokenSDKProvider` (or one of its variants) in the component tree.

### SDK Access

#### `useTokenSDK`

Returns the `TokenSDK` instance from context. Use this when you need direct access to the SDK (e.g. for low-level relayer operations).

```ts
function useTokenSDK(): TokenSDK;
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
  tokenAddress: Address,
  owner?: Address, // defaults to connected wallet
  options?: UseConfidentialBalanceOptions,
): UseQueryResult<bigint, Error>;
```

Options extend `UseQueryOptions` and add:

| Option                  | Type     | Default | Description                                     |
| ----------------------- | -------- | ------- | ----------------------------------------------- |
| `handleRefetchInterval` | `number` | `10000` | Polling interval (ms) for the encrypted handle. |

```tsx
const {
  data: balance,
  isLoading,
  error,
} = useConfidentialBalance(
  "0xTokenAddress",
  undefined, // use connected wallet
  { handleRefetchInterval: 5_000 },
);
```

#### `useConfidentialBalances`

Multi-token batch balance. Same two-phase polling pattern.

```ts
function useConfidentialBalances(
  tokenAddresses: Address[],
  owner?: Address,
  options?: UseConfidentialBalancesOptions,
): UseQueryResult<Map<Address, bigint>, Error>;
```

```tsx
const { data: balances } = useConfidentialBalances(["0xTokenA", "0xTokenB", "0xTokenC"]);

// balances is a Map<Address, bigint>
const tokenABalance = balances?.get("0xTokenA");
```

### Authorization

#### `useAuthorizeAll`

Pre-authorize FHE decrypt credentials for a list of token addresses with a single wallet signature. Call this early (e.g. after loading the token list) so that subsequent individual decrypt operations reuse cached credentials without prompting the wallet again.

```ts
function useAuthorizeAll(): UseMutationResult<void, Error, Address[]>;
```

```tsx
const { mutateAsync: authorizeAll, isPending } = useAuthorizeAll();

// Pre-authorize all known tokens up front
await authorizeAll(allTokenAddresses);

// Individual balance decrypts now reuse cached credentials
const { data: balance } = useConfidentialBalance("0xTokenA");
```

### Transfer Hooks

#### `useConfidentialTransfer`

Encrypted transfer. Encrypts the amount and calls the contract. Automatically invalidates balance caches on success.

```ts
function useConfidentialTransfer(
  config: UseTokenConfig,
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
  config: UseTokenConfig,
  options?: UseMutationOptions<Address, Error, ConfidentialTransferFromParams>,
): UseMutationResult<Address, Error, ConfidentialTransferFromParams>;

interface ConfidentialTransferFromParams {
  from: Address;
  to: Address;
  amount: bigint;
}
```

### Shield Hooks

#### `useShield` (alias: `useWrap`)

Shield public ERC-20 tokens into confidential tokens. Handles ERC-20 approval automatically.

```ts
function useShield(
  config: UseTokenConfig,
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

#### `useShieldETH` (alias: `useWrapETH`)

Shield native ETH into confidential tokens. Use when the underlying token is the zero address (native ETH).

```ts
function useShieldETH(
  config: UseTokenConfig,
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

Unshield a specific amount. Handles the entire unwrap + finalize flow.

```ts
function useUnshield(
  config: UseTokenConfig,
  options?: UseMutationOptions<Address, Error, UnshieldParams>,
): UseMutationResult<Address, Error, UnshieldParams>;

interface UnshieldParams {
  amount: bigint;
}
```

```tsx
const { mutateAsync: unshield, isPending } = useUnshield({
  tokenAddress: "0xTokenAddress",
});

const finalizeTxHash = await unshield({ amount: 500n });
```

#### `useUnshieldAll`

Unshield the entire balance. Handles the entire unwrap + finalize flow.

```ts
function useUnshieldAll(
  config: UseTokenConfig,
  options?: UseMutationOptions<Address, Error, void>,
): UseMutationResult<Address, Error, void>;
```

```tsx
const { mutateAsync: unshieldAll } = useUnshieldAll({
  tokenAddress: "0xTokenAddress",
});

const finalizeTxHash = await unshieldAll();
```

### Unwrap Hooks (Low-Level)

These hooks expose the individual unwrap steps. Use them when you need fine-grained control over the flow.

#### `useUnwrap`

Request unwrap for a specific amount (requires manual finalization via `useFinalizeUnwrap`).

```ts
function useUnwrap(
  config: UseTokenConfig,
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
  config: UseTokenConfig,
  options?: UseMutationOptions<Address, Error, void>,
): UseMutationResult<Address, Error, void>;
```

#### `useFinalizeUnwrap`

Complete an unwrap by providing the decryption proof.

```ts
function useFinalizeUnwrap(
  config: UseTokenConfig,
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
  config: UseTokenConfig,
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
  config: UseTokenConfig,
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
  underlyingAllowanceQueryKeys,
  activityFeedQueryKeys,
  decryptionKeys,
} from "@zama-fhe/react-sdk";
```

| Factory                         | Keys                                                | Description                         |
| ------------------------------- | --------------------------------------------------- | ----------------------------------- |
| `confidentialBalanceQueryKeys`  | `.all`, `.token(address)`, `.owner(address, owner)` | Single-token decrypted balance.     |
| `confidentialBalancesQueryKeys` | `.all`, `.tokens(addresses, owner)`                 | Multi-token batch balances.         |
| `confidentialHandleQueryKeys`   | `.all`, `.token(address)`, `.owner(address, owner)` | Single-token encrypted handle.      |
| `confidentialHandlesQueryKeys`  | `.all`, `.tokens(addresses, owner)`                 | Multi-token batch handles.          |
| `underlyingAllowanceQueryKeys`  | `.all`, `.token(address, wrapper)`                  | Underlying ERC-20 allowance.        |
| `activityFeedQueryKeys`         | `.all`, `.token(address)`                           | Activity feed items.                |
| `decryptionKeys`                | `.value(handle)`                                    | Individual decrypted handle values. |

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
| `useWrap()`                      | `(wrapper, to, amount)`                          | Wrap ERC-20 tokens.           |
| `useWrapETH()`                   | `(wrapper, to, amount, value)`                   | Wrap native ETH.              |

### Wagmi Signer Adapter

```ts
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";

const signer = new WagmiSigner(wagmiConfig);
```

## Viem & Ethers Adapter Hooks

Both `@zama-fhe/react-sdk/viem` and `@zama-fhe/react-sdk/ethers` export the same set of read/write hooks, but typed for their respective libraries. They also include `Suspense` variants of all read hooks.

### Read hooks

`useConfidentialBalanceOf`, `useWrapperForToken`, `useUnderlyingToken`, `useWrapperExists`, `useSupportsInterface` — plus `*Suspense` variants.

- **viem:** First parameter is `PublicClient`.
- **ethers:** First parameter is `Provider | Signer`.

### Write hooks

`useConfidentialTransfer`, `useConfidentialBatchTransfer`, `useUnwrap`, `useUnwrapFromBalance`, `useFinalizeUnwrap`, `useSetOperator`, `useShield`, `useShieldETH`.

- **viem:** Mutation params include `client: WalletClient`.
- **ethers:** Mutation params include `signer: Signer`.

### Signer adapters

```ts
// Re-exported for convenience
import { ViemSigner } from "@zama-fhe/react-sdk/viem";
import { EthersSigner } from "@zama-fhe/react-sdk/ethers";
```

## Re-exports from Core SDK

All public exports from `@zama-fhe/sdk` are re-exported from the main entry point. You never need to import from the core package directly.

**Classes:** `RelayerWeb`, `TokenSDK`, `Token`, `ReadonlyToken`, `MemoryStorage`, `IndexedDBStorage`, `indexedDBStorage`, `CredentialsManager`.

**Network configs:** `SepoliaConfig`, `MainnetConfig`, `HardhatConfig`.

**Types:** `Address`, `TokenSDKConfig`, `TokenConfig`, `ReadonlyTokenConfig`, `NetworkType`, `RelayerSDK`, `RelayerSDKStatus`, `EncryptResult`, `EncryptParams`, `UserDecryptParams`, `PublicDecryptResult`, `FHEKeypair`, `EIP712TypedData`, `DelegatedUserDecryptParams`, `KmsDelegatedUserDecryptEIP712Type`, `ZKProofLike`, `InputProofBytesType`, `BatchTransferData`, `StoredCredentials`, `GenericSigner`, `GenericStringStorage`, `ContractCallConfig`, `TransactionReceipt`, `UnshieldCallbacks`.

**Errors:** `TokenError`, `TokenErrorCode`, `SigningRejectedError`, `SigningFailedError`, `EncryptionFailedError`, `DecryptionFailedError`, `ApprovalFailedError`, `TransactionRevertedError`, `InvalidCredentialsError`, `NoCiphertextError`, `RelayerRequestFailedError`.

**Constants:** `ZERO_HANDLE`, `ERC7984_INTERFACE_ID`, `ERC7984_WRAPPER_INTERFACE_ID`.

**ABIs:** `ERC20_ABI`, `ERC20_METADATA_ABI`, `DEPLOYMENT_COORDINATOR_ABI`, `ERC165_ABI`, `ENCRYPTION_ABI`, `FEE_MANAGER_ABI`, `TRANSFER_BATCHER_ABI`, `WRAPPER_ABI`, `BATCH_SWAP_ABI`.

**Events:** `RawLog`, `ConfidentialTransferEvent`, `WrappedEvent`, `UnwrapRequestedEvent`, `UnwrappedFinalizedEvent`, `UnwrappedStartedEvent`, `TokenEvent`, `Topics`, `TOKEN_TOPICS`.

**Event decoders:** `decodeConfidentialTransfer`, `decodeWrapped`, `decodeUnwrapRequested`, `decodeUnwrappedFinalized`, `decodeUnwrappedStarted`, `decodeTokenEvent`, `decodeTokenEvents`, `findUnwrapRequested`, `findWrapped`.

**Activity feed:** `ActivityDirection`, `ActivityType`, `ActivityAmount`, `ActivityLogMetadata`, `ActivityItem`, `parseActivityFeed`, `extractEncryptedHandles`, `applyDecryptedValues`, `sortByBlockNumber`.

**Contract call builders:** All 31 builders — `confidentialBalanceOfContract`, `confidentialTransferContract`, `confidentialTransferFromContract`, `isOperatorContract`, `confidentialBatchTransferContract`, `unwrapContract`, `unwrapFromBalanceContract`, `finalizeUnwrapContract`, `setOperatorContract`, `getWrapperContract`, `wrapperExistsContract`, `underlyingContract`, `wrapContract`, `wrapETHContract`, `supportsInterfaceContract`, `nameContract`, `symbolContract`, `decimalsContract`, `allowanceContract`, `approveContract`, `confidentialTotalSupplyContract`, `totalSupplyContract`, `rateContract`, `deploymentCoordinatorContract`, `isFinalizeUnwrapOperatorContract`, `setFinalizeUnwrapOperatorContract`, `getWrapFeeContract`, `getUnwrapFeeContract`, `getBatchTransferFeeContract`, `getFeeRecipientContract`.
