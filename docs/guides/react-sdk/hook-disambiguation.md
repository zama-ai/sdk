# Hook Disambiguation

The React SDK exports hooks from two layers. **Pick one layer per operation -- never mix them.**

## Main Import vs Sub-Path Import

**Use the main import** (`@zama-fhe/react-sdk`) when you have a `ZamaProvider` in your component tree. These hooks handle FHE encryption, cache invalidation, and error wrapping automatically:

```tsx
import { useShield, useConfidentialTransfer } from "@zama-fhe/react-sdk";

const { mutateAsync: shield } = useShield({ tokenAddress });
await shield({ amount: 1000n }); // encryption + approval handled for you
```

**Use the library sub-path** (`/viem`, `/ethers`, `/wagmi`) when you need direct contract-level control without a provider. You handle encryption and cache management yourself:

```tsx
import { useShield } from "@zama-fhe/react-sdk/viem";

const { mutateAsync: shield } = useShield();
await shield({ client: walletClient, wrapperAddress, to, amount }); // raw contract call
```

## Comparison of Colliding Hook Names

Five hooks share names across both layers. Here is how they differ:

| Hook                      | Main (`@zama-fhe/react-sdk`)                                 | Sub-path (`/viem`, `/ethers`, `/wagmi`)                                               |
| ------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `useConfidentialTransfer` | `mutate({ to, amount })` -- auto-encrypts                    | `mutate({ client, token, to, handle, inputProof })` -- pre-encrypted                  |
| `useShield`               | `mutate({ amount, approvalStrategy? })` -- auto-approves     | `mutate({ client, wrapper, to, amount })` -- raw wrap call                            |
| `useShieldETH`            | `mutate({ amount, value? })` -- `value` defaults to `amount` | `mutate({ client, wrapper, to, amount, value })` -- all fields required               |
| `useUnwrap`               | `mutate({ amount })` -- auto-encrypts                        | `mutate({ client, token, from, to, encryptedAmount, inputProof })` -- pre-encrypted   |
| `useFinalizeUnwrap`       | `mutate({ burnAmountHandle })` -- fetches proof from relayer | `mutate({ client, wrapper, burntAmount, cleartext, proof })` -- caller provides proof |

## Feature Comparison

| Feature                 | Main                    | Sub-path                      |
| ----------------------- | ----------------------- | ----------------------------- |
| Requires `ZamaProvider` | Yes                     | No                            |
| FHE encryption          | Automatic               | Manual (caller pre-encrypts)  |
| ERC-20 approval         | Automatic (`useShield`) | None                          |
| Cache invalidation      | Automatic               | None                          |
| Return type             | `TransactionResult`     | Raw tx hash or wagmi mutation |

> **Rule of thumb:** If you are building a standard dApp UI, use the main import. If you are building custom transaction pipelines or need to compose with other wagmi hooks at the contract level, use the sub-path.
