# Contract Call Builders

> **You probably don't need this page.** The `Token` API (`shield`, `unshield`, `confidentialTransfer`, etc.) handles everything for most use cases. Contract call builders are for when you need raw contract-level control — custom transaction pipelines, batching, or integrating with systems that expect ABI-encoded call data.

## How they work

Every builder returns a `ContractCallConfig` — a plain object with the contract address, ABI, function name, and args. You pass it to whatever execution layer you're using (viem, ethers, or the SDK's `GenericSigner`).

```ts
import { wrapContract, confidentialTransferContract } from "@zama-fhe/sdk";

const callConfig = wrapContract("0xWrapper", "0xRecipient", 1000n);
// { address, abi, functionName, args }
```

All builders validate addresses at runtime — pass a bad address and you'll get an immediate error, not a confusing revert.

## Executing calls

### With viem

```ts
import { readConfidentialBalanceOfContract, writeWrapContract } from "@zama-fhe/sdk/viem";

// Read
const handle = await readConfidentialBalanceOfContract(publicClient, tokenAddress, userAddress);

// Write
const txHash = await writeWrapContract(walletClient, wrapperAddress, recipient, amount);
```

### With ethers

```ts
import { readConfidentialBalanceOfContract, writeWrapContract } from "@zama-fhe/sdk/ethers";

const handle = await readConfidentialBalanceOfContract(provider, tokenAddress, userAddress);
const txHash = await writeWrapContract(signer, wrapperAddress, recipient, amount);
```

## Available builders

### ERC-20 basics

| Builder                                    | What it does               |
| ------------------------------------------ | -------------------------- |
| `nameContract(token)`                      | Read token name            |
| `symbolContract(token)`                    | Read token symbol          |
| `decimalsContract(token)`                  | Read token decimals        |
| `balanceOfContract(token, owner)`          | Read public ERC-20 balance |
| `allowanceContract(token, owner, spender)` | Read ERC-20 allowance      |
| `approveContract(token, spender, value)`   | Approve ERC-20 spending    |

### Confidential operations

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

### Wrapping and unwrapping

| Builder                                                          | What it does                   |
| ---------------------------------------------------------------- | ------------------------------ |
| `wrapContract(wrapper, to, amount)`                              | Wrap ERC-20 tokens             |
| `wrapETHContract(wrapper, to, amount, value)`                    | Wrap native ETH                |
| `unwrapContract(token, from, to, encryptedAmount, inputProof)`   | Request unwrap                 |
| `unwrapFromBalanceContract(token, from, to, encryptedBalance)`   | Unwrap using on-chain handle   |
| `finalizeUnwrapContract(wrapper, burntAmount, cleartext, proof)` | Finalize unwrap                |
| `underlyingContract(wrapper)`                                    | Read underlying ERC-20 address |

### Discovery and fees

| Builder                                                                    | What it does                |
| -------------------------------------------------------------------------- | --------------------------- |
| `getWrapperContract(coordinator, token)`                                   | Look up wrapper for a token |
| `wrapperExistsContract(coordinator, token)`                                | Check if wrapper exists     |
| `supportsInterfaceContract(token, interfaceId)`                            | ERC-165 interface check     |
| `getWrapFeeContract(feeManager, amount, from, to)`                         | Calculate wrap fee          |
| `getUnwrapFeeContract(feeManager, amount, from, to)`                       | Calculate unwrap fee        |
| `getBatchTransferFeeContract(feeManager)`                                  | Get batch transfer fee      |
| `getFeeRecipientContract(feeManager)`                                      | Get fee recipient address   |
| `confidentialBatchTransferContract(batcher, token, from, transfers, fees)` | Batch encrypted transfers   |
