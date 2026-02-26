# Library Adapters (Advanced)

> **Most apps don't need this.** If you're using `ZamaProvider`, the [main hooks](hooks.md) handle encryption, approvals, and caching automatically. This page is for when you need direct contract-level control — custom transaction pipelines, composing with other contract hooks, or building without a provider.

The React SDK provides library-specific sub-paths that give you thin hooks over raw contract calls.

## Signer adapters

Each sub-path re-exports its signer adapter:

```ts
import { ViemSigner } from "@zama-fhe/react-sdk/viem";
import { EthersSigner } from "@zama-fhe/react-sdk/ethers";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";
```

## viem hooks

### Read hooks

Pass a `PublicClient`. All read hooks have `*Suspense` variants for React Suspense.

```tsx
import { useConfidentialBalanceOf } from "@zama-fhe/react-sdk/viem";

const { data: handle } = useConfidentialBalanceOf(publicClient, tokenAddress, userAddress);
```

Available: `useConfidentialBalanceOf`, `useWrapperForToken`, `useUnderlyingToken`, `useWrapperExists`, `useSupportsInterface`.

### Write hooks

Mutation params include `client: WalletClient`.

```tsx
import { useConfidentialTransfer } from "@zama-fhe/react-sdk/viem";

const { mutateAsync: transfer } = useConfidentialTransfer();

await transfer({
  client: walletClient,
  token: tokenAddress,
  to: recipient,
  handle: encryptedHandle,
  inputProof: proof,
});
```

Available: `useConfidentialTransfer`, `useConfidentialBatchTransfer`, `useUnwrap`, `useUnwrapFromBalance`, `useFinalizeUnwrap`, `useSetOperator`, `useShield`, `useShieldETH`.

## ethers hooks

Same set as viem. Read hooks take `Provider | Signer`, write hooks take `Signer`.

```tsx
import { useConfidentialBalanceOf, useConfidentialTransfer } from "@zama-fhe/react-sdk/ethers";

const { data: handle } = useConfidentialBalanceOf(provider, tokenAddress, userAddress);

const { mutateAsync: transfer } = useConfidentialTransfer();
await transfer({ signer, token: tokenAddress, to: recipient, handle, inputProof: proof });
```

## wagmi hooks

Wrap wagmi's `useReadContract` and `useWriteContract` directly. No client/signer parameters needed — wagmi's `Config` handles that.

### Read hooks

Enabled only when required parameters are defined. All have `*Suspense` variants.

| Hook                                         | What it reads                                         |
| -------------------------------------------- | ----------------------------------------------------- |
| `useBalanceOf(token, user?)`                 | ERC-20 balance with symbol, decimals, formatted value |
| `useConfidentialBalanceOf(token?, user?)`    | Encrypted balance handle                              |
| `useWrapperForToken(coordinator?, token?)`   | Wrapper address for a token                           |
| `useUnderlyingToken(wrapper?)`               | Underlying ERC-20 address                             |
| `useWrapperExists(coordinator?, token?)`     | Whether a wrapper exists                              |
| `useSupportsInterface(token?, interfaceId?)` | ERC-165 support                                       |

### Write hooks

Return wagmi's `useWriteContract` mutation shape.

| Hook                             | Mutation parameters                              |
| -------------------------------- | ------------------------------------------------ |
| `useConfidentialTransfer()`      | `(token, to, handle, inputProof)`                |
| `useConfidentialBatchTransfer()` | `(batcher, token, from, transfers, fees)`        |
| `useUnwrap()`                    | `(token, from, to, encryptedAmount, inputProof)` |
| `useUnwrapFromBalance()`         | `(token, from, to, encryptedBalance)`            |
| `useFinalizeUnwrap()`            | `(wrapper, burntAmount, cleartext, proof)`       |
| `useSetOperator()`               | `(token, spender, timestamp?)`                   |
| `useShield()`                    | `(wrapper, to, amount)`                          |
| `useShieldETH()`                 | `(wrapper, to, amount, value)`                   |

## Low-level FHE hooks

These require `ZamaProvider` and expose raw relayer operations as React Query mutations. Use them when building custom flows that need fine-grained FHE control.

### Encryption and decryption

| Hook                        | What it does                            |
| --------------------------- | --------------------------------------- |
| `useEncrypt()`              | Encrypt values for smart contract calls |
| `useUserDecrypt()`          | Decrypt with user's FHE private key     |
| `usePublicDecrypt()`        | Public decryption                       |
| `useDelegatedUserDecrypt()` | Decrypt via delegation                  |

### Key management

| Hook                                    | What it does                                        |
| --------------------------------------- | --------------------------------------------------- |
| `useGenerateKeypair()`                  | Generate an FHE keypair                             |
| `useCreateEIP712()`                     | Create EIP-712 typed data for decrypt authorization |
| `useCreateDelegatedUserDecryptEIP712()` | Create EIP-712 for delegated decryption             |
| `useRequestZKProofVerification()`       | Submit a ZK proof for verification                  |

### Reading from the decryption cache

`useUserDecrypt` and `usePublicDecrypt` populate a shared cache. Read from it without triggering new decryptions:

```tsx
// Single handle
const { data: value } = useUserDecryptedValue("0xHandleHash");

// Multiple handles
const { data } = useUserDecryptedValues(["0xHandle1", "0xHandle2"]);
// data["0xHandle1"] → bigint | undefined
```
