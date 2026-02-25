# Library Adapters

The React SDK provides library-specific sub-paths for viem, ethers, and wagmi. These hooks call contracts directly through their respective libraries and do **not** require a `ZamaProvider`. Use them for advanced scenarios where you need fine-grained control over contract interactions.

## Signer Adapters

Each sub-path re-exports its signer adapter for convenience:

```ts
import { ViemSigner } from "@zama-fhe/react-sdk/viem";
import { EthersSigner } from "@zama-fhe/react-sdk/ethers";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";
```

## Viem and Ethers Hooks

Both `@zama-fhe/react-sdk/viem` and `@zama-fhe/react-sdk/ethers` export the same set of read/write hooks, typed for their respective libraries. They also include `Suspense` variants of all read hooks.

### Read Hooks

`useConfidentialBalanceOf`, `useWrapperForToken`, `useUnderlyingToken`, `useWrapperExists`, `useSupportsInterface` -- plus `*Suspense` variants.

- **viem:** First parameter is `PublicClient`.
- **ethers:** First parameter is `Provider | Signer`.

### Write Hooks

`useConfidentialTransfer`, `useConfidentialBatchTransfer`, `useUnwrap`, `useUnwrapFromBalance`, `useFinalizeUnwrap`, `useSetOperator`, `useShield`, `useShieldETH`.

- **viem:** Mutation params include `client: WalletClient`.
- **ethers:** Mutation params include `signer: Signer`.

## Wagmi Hooks

`@zama-fhe/react-sdk/wagmi` exports low-level hooks that wrap wagmi's `useReadContract` and `useWriteContract` directly. These operate through wagmi's `Config`.

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

## Low-Level FHE Hooks

These hooks expose the raw `RelayerSDK` operations as React Query mutations. They require `ZamaProvider`.

### Encryption and Decryption

| Hook                        | Input                        | Output                   | Description                                                          |
| --------------------------- | ---------------------------- | ------------------------ | -------------------------------------------------------------------- |
| `useEncrypt()`              | `EncryptParams`              | `EncryptResult`          | Encrypt values for smart contract calls.                             |
| `useUserDecrypt()`          | `UserDecryptParams`          | `Record<string, bigint>` | Decrypt with user's FHE private key. Populates the decryption cache. |
| `usePublicDecrypt()`        | `string[]` (handles)         | `PublicDecryptResult`    | Public decryption. Populates the decryption cache.                   |
| `useDelegatedUserDecrypt()` | `DelegatedUserDecryptParams` | `Record<string, bigint>` | Decrypt via delegation.                                              |

### Key Management

| Hook                                    | Input                                    | Output                              | Description                                          |
| --------------------------------------- | ---------------------------------------- | ----------------------------------- | ---------------------------------------------------- |
| `useGenerateKeypair()`                  | `void`                                   | `FHEKeypair`                        | Generate an FHE keypair.                             |
| `useCreateEIP712()`                     | `CreateEIP712Params`                     | `EIP712TypedData`                   | Create EIP-712 typed data for decrypt authorization. |
| `useCreateDelegatedUserDecryptEIP712()` | `CreateDelegatedUserDecryptEIP712Params` | `KmsDelegatedUserDecryptEIP712Type` | Create EIP-712 for delegated decryption.             |
| `useRequestZKProofVerification()`       | `ZKProofLike`                            | `InputProofBytesType`               | Submit a ZK proof for verification.                  |

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

## Error-to-User-Message Mapping

Map SDK errors to user-friendly messages in your UI:

```tsx
import { matchZamaError } from "@zama-fhe/react-sdk";

const message = matchZamaError(error, {
  SIGNING_REJECTED: () => "Transaction cancelled -- please approve in your wallet.",
  ENCRYPTION_FAILED: () => "Encryption failed -- please try again.",
  DECRYPTION_FAILED: () => "Decryption failed -- please try again.",
  APPROVAL_FAILED: () => "Token approval failed -- please try again.",
  TRANSACTION_REVERTED: () => "Transaction failed on-chain -- check your balance.",
  _: () => "An unexpected error occurred.",
});
```

For full API details, see the [React SDK API Reference](../../api/react-sdk/src/README.md), [viem API](../../api/react-sdk/src/viem/README.md), [ethers API](../../api/react-sdk/src/ethers/README.md), and [wagmi API](../../api/react-sdk/src/wagmi/README.md).
