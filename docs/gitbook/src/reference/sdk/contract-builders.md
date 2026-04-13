---
title: Contract call builders
description: Low-level builders that return raw contract call configs for viem, ethers, or custom execution layers.
---

# Contract call builders

Every builder returns a `ReadContractConfig` or `WriteContractConfig` — a plain object with the contract address, ABI fragment, function name, and encoded args:

```ts
type ReadContractConfig = {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
};

type WriteContractConfig = ReadContractConfig & {
  value?: bigint;
  gas?: bigint;
};
```

{% hint style="warning" %}
The [Token API](/reference/sdk/Token) (`shield`, `unshield`, `confidentialTransfer`, etc.) handles contract calls, encryption, and multi-step flows for you. Use builders only when you need raw contract-level control — custom transaction pipelines, batching, or integrating with systems that expect ABI-encoded call data.
{% endhint %}

## Import

```ts
import {
  nameContract,
  symbolContract,
  decimalsContract,
  balanceOfContract,
  allowanceContract,
  approveContract,
  confidentialBalanceOfContract,
  confidentialTransferContract,
  confidentialTransferFromContract,
  isOperatorContract,
  setOperatorContract,
  confidentialTotalSupplyContract,
  totalSupplyContract,
  rateContract,
  wrapContract,
  unwrapContract,
  unwrapFromBalanceContract,
  finalizeUnwrapContract,
  underlyingContract,
  supportsInterfaceContract,
  isConfidentialTokenContract,
  isConfidentialWrapperContract,
  delegateForUserDecryptionContract,
  revokeDelegationContract,
  getDelegationExpiryContract,
  isHandleDelegatedContract,
  getTokenPairsContract,
  getTokenPairsLengthContract,
  getTokenPairsSliceContract,
  getTokenPairContract,
  getConfidentialTokenAddressContract,
  getTokenAddressContract,
  isConfidentialTokenValidContract,
} from "@zama-fhe/sdk";
```

## ERC-20 basics

| Builder                                    | What it does               |
| ------------------------------------------ | -------------------------- |
| `nameContract(token)`                      | Read token name            |
| `symbolContract(token)`                    | Read token symbol          |
| `decimalsContract(token)`                  | Read token decimals        |
| `balanceOfContract(token, owner)`          | Read public ERC-20 balance |
| `allowanceContract(token, owner, spender)` | Read ERC-20 allowance      |
| `approveContract(token, spender, value)`   | Approve ERC-20 spending    |

## Confidential operations

| Builder                                                                 | What it does                       |
| ----------------------------------------------------------------------- | ---------------------------------- |
| `confidentialBalanceOfContract(token, user)`                            | Read encrypted balance handle      |
| `confidentialTransferContract(token, to, handle, inputProof)`           | Encrypted transfer                 |
| `confidentialTransferFromContract(token, from, to, handle, inputProof)` | Operator encrypted transfer        |
| `isOperatorContract(token, holder, spender)`                            | Check operator approval            |
| `setOperatorContract(token, spender, timestamp?)`                       | Set operator approval              |
| `confidentialTotalSupplyContract(token)`                                | Read encrypted total supply handle |
| `totalSupplyContract(token)`                                            | Read plaintext total supply        |
| `rateContract(token)`                                                   | Read conversion rate               |

## Wrapping and unwrapping

| Builder                                                          | What it does                   |
| ---------------------------------------------------------------- | ------------------------------ |
| `wrapContract(wrapper, to, amount)`                              | Wrap ERC-20 tokens             |
| `unwrapContract(token, from, to, encryptedAmount, inputProof)`   | Request unwrap                 |
| `unwrapFromBalanceContract(token, from, to, encryptedBalance)`   | Unwrap using on-chain handle   |
| `finalizeUnwrapContract(wrapper, burntAmount, cleartext, proof)` | Finalize unwrap                |
| `underlyingContract(wrapper)`                                    | Read underlying ERC-20 address |

## Discovery and detection

| Builder                                         | What it does                          |
| ----------------------------------------------- | ------------------------------------- |
| `supportsInterfaceContract(token, interfaceId)` | ERC-165 interface check               |
| `isConfidentialTokenContract(token)`            | Check if token is ERC-7984 compliant  |
| `isConfidentialWrapperContract(token)`          | Check if token is an ERC-7984 wrapper |

## Registry

| Builder                                                         | What it does                                           |
| --------------------------------------------------------------- | ------------------------------------------------------ |
| `getTokenPairsContract(registry)`                               | Fetch all token wrapper pairs                          |
| `getTokenPairsLengthContract(registry)`                         | Get the number of pairs                                |
| `getTokenPairsSliceContract(registry, fromIndex, toIndex)`      | Fetch a range of pairs (pagination)                    |
| `getTokenPairContract(registry, index)`                         | Fetch a single pair by index                           |
| `getConfidentialTokenAddressContract(registry, tokenAddress)`   | Look up confidential token for a plain ERC-20          |
| `getTokenAddressContract(registry, confidentialTokenAddress)`   | Look up plain ERC-20 for a confidential token          |
| `isConfidentialTokenValidContract(registry, confidentialToken)` | Check if a confidential token is valid in the registry |

{% hint style="info" %}
The [WrappersRegistry class](/reference/sdk/WrappersRegistry) wraps these builders with automatic address resolution. Use builders only when you need raw contract-level control.
{% endhint %}

## Delegation

| Builder                                                                 | What it does                               |
| ----------------------------------------------------------------------- | ------------------------------------------ |
| `delegateForUserDecryptionContract(acl, delegate, contract, expiry)`    | Grant decryption delegation                |
| `revokeDelegationContract(acl, delegate, contract)`                     | Revoke decryption delegation               |
| `getDelegationExpiryContract(acl, delegator, delegate, contract)`       | Read delegation expiry date                |
| `isHandleDelegatedContract(acl, delegator, delegate, contract, handle)` | Check if a handle is covered by delegation |

## Executing calls

### With viem

Typed read/write helpers are available from the `/viem` subpath:

```ts
import { readConfidentialBalanceOfContract, writeWrapContract } from "@zama-fhe/sdk/viem";

// Read — pass a PublicClient
const handle = await readConfidentialBalanceOfContract(publicClient, tokenAddress, userAddress);

// Write — pass a WalletClient
const txHash = await writeWrapContract(walletClient, wrapperAddress, recipient, amount);
```

### With ethers

Equivalent helpers are available from the `/ethers` subpath:

```ts
import { readConfidentialBalanceOfContract, writeWrapContract } from "@zama-fhe/sdk/ethers";

// Read — pass a Provider
const handle = await readConfidentialBalanceOfContract(provider, tokenAddress, userAddress);

// Write — pass a Signer
const txHash = await writeWrapContract(signer, wrapperAddress, recipient, amount);
```

### With raw config objects

If you use neither viem nor ethers, destructure the config and pass it to your execution layer:

```ts
import { wrapContract } from "@zama-fhe/sdk";

const { address, abi, functionName, args } = wrapContract(wrapperAddress, recipient, amount);

// Use with any contract interaction library
```

{% hint style="info" %}
All builders validate addresses at call time. A malformed address throws immediately instead of producing a confusing on-chain revert.
{% endhint %}

## Related

- [Token](/reference/sdk/Token) — high-level API that wraps these builders
- [Event Decoders](/reference/sdk/event-decoders) — decode on-chain logs into typed events
