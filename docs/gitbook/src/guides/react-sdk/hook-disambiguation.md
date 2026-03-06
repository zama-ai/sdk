# Choosing the Right Hook

The React SDK has two levels of hooks. Here's how to pick.

## The short version

**Building a normal dApp?** Use the high-level token hooks. Done.

```tsx
import { useShield, useConfidentialTransfer, useConfidentialBalance } from "@zama-fhe/react-sdk";
```

**Need fine-grained FHE control?** Use the low-level relayer hooks to encrypt/decrypt manually.

```tsx
import { useEncrypt, useUserDecrypt, useGenerateKeypair } from "@zama-fhe/react-sdk";
```

## What's different

**High-level hooks** (`useShield`, `useConfidentialTransfer`, `useConfidentialBalance`, etc.) handle everything — FHE encryption, ERC-20 approvals, cache invalidation, error wrapping. They require `ZamaProvider` and a `tokenAddress`.

**Low-level hooks** (`useEncrypt`, `useUserDecrypt`, `useGenerateKeypair`, etc.) expose raw relayer operations as React Query mutations. Use them when building custom flows that need direct FHE control. They also require `ZamaProvider`.

|                      | High-level hooks   | Low-level hooks                          |
| -------------------- | ------------------ | ---------------------------------------- |
| Needs `ZamaProvider` | Yes                | Yes                                      |
| Encrypts amounts     | Automatically      | You call `useEncrypt`                    |
| ERC-20 approval      | Automatic (shield) | You handle it                            |
| Cache invalidation   | Automatic          | You handle it                            |
| Use case             | 95% of dApps       | Custom pipelines, advanced composability |

## Contract call builders

For even lower-level control (outside React or without `ZamaProvider`), use the contract call builders from the core SDK with your signer directly:

```ts
import { wrapContract, confidentialTransferContract } from "@zama-fhe/sdk";

// These return { address, abi, functionName, args } objects
// Pass them to your signer's writeContract method
```

See [Contract Call Builders](../sdk/contract-builders.md) for the full list.
