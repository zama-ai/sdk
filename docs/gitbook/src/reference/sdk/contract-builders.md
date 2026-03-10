---
title: Contract Call Builders
description: Low-level builders that return raw contract call configs for viem, ethers, or custom execution layers.
---

# Contract Call Builders

Every builder returns a `ContractCallConfig` — a plain object with the contract address, ABI fragment, function name, and encoded args:

```ts
type ContractCallConfig = {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
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
  wrapETHContract,
  unwrapContract,
  unwrapFromBalanceContract,
  finalizeUnwrapContract,
  underlyingContract,
  getWrapperContract,
  wrapperExistsContract,
  deploymentCoordinatorContract,
  supportsInterfaceContract,
  isConfidentialTokenContract,
  isConfidentialWrapperContract,
  isFinalizeUnwrapOperatorContract,
  setFinalizeUnwrapOperatorContract,
  getWrapFeeContract,
  getUnwrapFeeContract,
  getBatchTransferFeeContract,
  getFeeRecipientContract,
  confidentialBatchTransferContract,
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
| `wrapETHContract(wrapper, to, amount, value)`                    | Wrap native ETH                |
| `unwrapContract(token, from, to, encryptedAmount, inputProof)`   | Request unwrap                 |
| `unwrapFromBalanceContract(token, from, to, encryptedBalance)`   | Unwrap using on-chain handle   |
| `finalizeUnwrapContract(wrapper, burntAmount, cleartext, proof)` | Finalize unwrap                |
| `underlyingContract(wrapper)`                                    | Read underlying ERC-20 address |

## Discovery, detection, and fees

| Builder                                                                    | What it does                          |
| -------------------------------------------------------------------------- | ------------------------------------- |
| `getWrapperContract(coordinator, token)`                                   | Look up wrapper for a token           |
| `wrapperExistsContract(coordinator, token)`                                | Check if wrapper exists               |
| `deploymentCoordinatorContract(token)`                                     | Read the deployment coordinator       |
| `supportsInterfaceContract(token, interfaceId)`                            | ERC-165 interface check               |
| `isConfidentialTokenContract(token)`                                       | Check if token is ERC-7984 compliant  |
| `isConfidentialWrapperContract(token)`                                     | Check if token is an ERC-7984 wrapper |
| `isFinalizeUnwrapOperatorContract(token, holder, operator)`                | Check finalize-unwrap operator status |
| `setFinalizeUnwrapOperatorContract(token, operator, timestamp?)`           | Set finalize-unwrap operator approval |
| `getWrapFeeContract(feeManager, amount, from, to)`                         | Calculate wrap fee                    |
| `getUnwrapFeeContract(feeManager, amount, from, to)`                       | Calculate unwrap fee                  |
| `getBatchTransferFeeContract(feeManager)`                                  | Get batch transfer fee                |
| `getFeeRecipientContract(feeManager)`                                      | Get fee recipient address             |
| `confidentialBatchTransferContract(batcher, token, from, transfers, fees)` | Batch encrypted transfers             |

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

### With raw ContractCallConfig

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

- [Token operations guide](/reference/sdk/Token) — high-level API that wraps these builders
- [Contract call builders guide](/reference/sdk/contract-builders) — when and why to use builders
