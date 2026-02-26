# Choosing the Right Hook

The React SDK has two sets of hooks with some overlapping names. Here's how to pick.

## The short version

**Building a normal dApp?** Use the main import. Done.

```tsx
import { useShield, useConfidentialTransfer } from "@zama-fhe/react-sdk";
```

**Building custom transaction pipelines or composing with wagmi's raw contract hooks?** Use the library sub-path.

```tsx
import { useShield } from "@zama-fhe/react-sdk/wagmi";
```

## What's different

**Main hooks** (`@zama-fhe/react-sdk`) require `ZamaProvider` and handle everything for you — FHE encryption, ERC-20 approvals, cache invalidation, error wrapping.

**Library-adapter hooks** (`/viem`, `/ethers`, `/wagmi`) are thin wrappers around contract calls. No provider needed, but you handle encryption and caching yourself.

|                      | Main hooks         | Library-adapter hooks                    |
| -------------------- | ------------------ | ---------------------------------------- |
| Needs `ZamaProvider` | Yes                | No                                       |
| Encrypts amounts     | Automatically      | You pre-encrypt                          |
| ERC-20 approval      | Automatic (shield) | None                                     |
| Cache invalidation   | Automatic          | None                                     |
| Use case             | 95% of dApps       | Custom pipelines, advanced composability |

## Hooks that share names

Five hooks exist in both layers. They have the same name but different signatures:

| Hook                      | Main import                      | Library sub-path                                                   |
| ------------------------- | -------------------------------- | ------------------------------------------------------------------ |
| `useConfidentialTransfer` | `transfer({ to, amount })`       | `transfer({ client, token, to, handle, inputProof })`              |
| `useShield`               | `shield({ amount })`             | `shield({ client, wrapper, to, amount })`                          |
| `useShieldETH`            | `shieldETH({ amount })`          | `shieldETH({ client, wrapper, to, amount, value })`                |
| `useUnwrap`               | `unwrap({ amount })`             | `unwrap({ client, token, from, to, encryptedAmount, inputProof })` |
| `useFinalizeUnwrap`       | `finalize({ burnAmountHandle })` | `finalize({ client, wrapper, burntAmount, cleartext, proof })`     |

Since they come from different import paths, there's no conflict — just make sure you import from the right one.
