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

| Hook                        | What it does                                                              |
| --------------------------- | ------------------------------------------------------------------------- |
| `useEncrypt()`              | Encrypt values for smart contract calls                                   |
| `useUserDecrypt()`          | Orchestrated decrypt — manages credentials automatically, populates cache |
| `useUserDecryptRaw()`       | Thin wrapper — pass all credential params yourself                        |
| `usePublicDecrypt()`        | Public decryption                                                         |
| `useDelegatedUserDecrypt()` | Decrypt via delegation                                                    |

#### `useUserDecrypt` vs `useUserDecryptRaw`

**`useUserDecrypt`** (recommended) handles the full credential lifecycle — it generates a keypair, creates an EIP-712 authorization, prompts the wallet, and caches credentials. You just pass handles:

```tsx
const decrypt = useUserDecrypt();

decrypt.mutate({
  handles: [
    { handle: "0xHandle1", contractAddress: "0xToken" },
    { handle: "0xHandle2", contractAddress: "0xToken" },
  ],
});
```

**`useUserDecryptRaw`** is the thin wrapper for when you manage credentials yourself (e.g. you've already called `useGenerateKeypair` and `useCreateEIP712` manually):

```tsx
const decryptRaw = useUserDecryptRaw();

decryptRaw.mutate({
  handles: ["0xHandle1", "0xHandle2"],
  contractAddress: "0xToken",
  signedContractAddresses: ["0xToken"],
  privateKey: "0xPriv",
  publicKey: "0xPub",
  signature: "0xSig",
  signerAddress: "0xUser",
  startTimestamp: 1000,
  durationDays: 1,
});
```

Both populate the same decryption cache.

### Key management

| Hook                                    | What it does                                        |
| --------------------------------------- | --------------------------------------------------- |
| `useGenerateKeypair()`                  | Generate an FHE keypair                             |
| `useCreateEIP712()`                     | Create EIP-712 typed data for decrypt authorization |
| `useCreateDelegatedUserDecryptEIP712()` | Create EIP-712 for delegated decryption             |
| `useRequestZKProofVerification()`       | Submit a ZK proof for verification                  |

### Reading from the decryption cache

`useUserDecrypt`, `useUserDecryptRaw`, and `usePublicDecrypt` populate a shared cache. Read from it without triggering new decryptions:

```tsx
// Single handle
const { data: value } = useUserDecryptedValue("0xHandleHash");

// Multiple handles
const { data } = useUserDecryptedValues(["0xHandle1", "0xHandle2"]);
// data["0xHandle1"] → bigint | undefined
```
