# Contract Call Builders

Every builder function returns a `ContractCallConfig` object (address, ABI, function name, args) that can be used with any Web3 library. These are the low-level building blocks — they map 1:1 to on-chain contract calls without any orchestration. Use them when the high-level `Token` API doesn't cover your use case.

> **High-level vs low-level:** `token.shield()` / `token.unshield()` handle the full flow (approval, encryption, receipt waiting, finalization). The contract call builders (`wrapContract()`, `unwrapContract()`, etc.) produce raw call configs for a single contract interaction.

```ts
interface ContractCallConfig {
  readonly address: Address;
  readonly abi: readonly unknown[];
  readonly functionName: string;
  readonly args: readonly unknown[];
  readonly value?: bigint;
  readonly gas?: bigint;
}
```

## Usage

```ts
import {
  wrapContract,
  confidentialTransferContract,
  confidentialBalanceOfContract,
} from "@zama-fhe/sdk";

// Returns { address, abi, functionName, args, value? }
const callConfig = wrapContract("0xWrapper", "0xRecipient", 1000n);
```

## Builder Reference

### ERC-20

| Function                                   | Description              |
| ------------------------------------------ | ------------------------ |
| `nameContract(token)`                      | Read token name.         |
| `symbolContract(token)`                    | Read token symbol.       |
| `decimalsContract(token)`                  | Read token decimals.     |
| `balanceOfContract(token, owner)`          | Read ERC-20 balance.     |
| `allowanceContract(token, owner, spender)` | Read ERC-20 allowance.   |
| `approveContract(token, spender, value)`   | Approve ERC-20 spending. |

### Encryption (Confidential ERC-20)

| Function                                                                | Description                               |
| ----------------------------------------------------------------------- | ----------------------------------------- |
| `confidentialBalanceOfContract(token, user)`                            | Read encrypted balance handle.            |
| `confidentialTransferContract(token, to, handle, inputProof)`           | Encrypted transfer.                       |
| `confidentialTransferFromContract(token, from, to, handle, inputProof)` | Operator encrypted transfer.              |
| `isOperatorContract(token, holder, spender)`                            | Check operator approval.                  |
| `setOperatorContract(token, spender, timestamp?)`                       | Set operator approval (default: +1 hour). |
| `confidentialTotalSupplyContract(token)`                                | Read encrypted total supply handle.       |
| `totalSupplyContract(token)`                                            | Read plaintext total supply.              |
| `rateContract(token)`                                                   | Read conversion rate.                     |
| `deploymentCoordinatorContract(token)`                                  | Read deployment coordinator address.      |
| `isFinalizeUnwrapOperatorContract(token, holder, operator)`             | Check finalize-unwrap operator status.    |
| `setFinalizeUnwrapOperatorContract(token, operator, timestamp?)`        | Set finalize-unwrap operator.             |

### Wrapper

| Function                                                         | Description                                   |
| ---------------------------------------------------------------- | --------------------------------------------- |
| `wrapContract(wrapper, to, amount)`                              | Wrap ERC-20 tokens.                           |
| `wrapETHContract(wrapper, to, amount, value)`                    | Wrap native ETH.                              |
| `unwrapContract(token, from, to, encryptedAmount, inputProof)`   | Request unwrap with encrypted amount.         |
| `unwrapFromBalanceContract(token, from, to, encryptedBalance)`   | Request unwrap using on-chain balance handle. |
| `finalizeUnwrapContract(wrapper, burntAmount, cleartext, proof)` | Finalize unwrap with decryption proof.        |
| `underlyingContract(wrapper)`                                    | Read underlying ERC-20 address.               |

### Deployment Coordinator

| Function                                    | Description                  |
| ------------------------------------------- | ---------------------------- |
| `getWrapperContract(coordinator, token)`    | Look up wrapper for a token. |
| `wrapperExistsContract(coordinator, token)` | Check if wrapper exists.     |

### ERC-165

| Function                                        | Description              |
| ----------------------------------------------- | ------------------------ |
| `supportsInterfaceContract(token, interfaceId)` | ERC-165 interface check. |

### Fee Manager

| Function                                             | Description                |
| ---------------------------------------------------- | -------------------------- |
| `getWrapFeeContract(feeManager, amount, from, to)`   | Calculate wrap fee.        |
| `getUnwrapFeeContract(feeManager, amount, from, to)` | Calculate unwrap fee.      |
| `getBatchTransferFeeContract(feeManager)`            | Get batch transfer fee.    |
| `getFeeRecipientContract(feeManager)`                | Get fee recipient address. |

### Transfer Batcher

| Function                                                                   | Description                         |
| -------------------------------------------------------------------------- | ----------------------------------- |
| `confidentialBatchTransferContract(batcher, token, from, transfers, fees)` | Batch multiple encrypted transfers. |

## Library-Specific Helpers

Both the `/viem` and `/ethers` sub-paths export convenience wrappers that execute contract calls directly with library-native clients.

### viem (`@zama-fhe/sdk/viem`)

```ts
import {
  readConfidentialBalanceOfContract,
  writeConfidentialTransferContract,
  writeWrapContract,
} from "@zama-fhe/sdk/viem";

// Read: pass a PublicClient
const handle = await readConfidentialBalanceOfContract(publicClient, tokenAddress, userAddress);

// Write: pass a WalletClient
const txHash = await writeConfidentialTransferContract(
  walletClient,
  tokenAddress,
  to,
  handle,
  inputProof,
);
```

**Read helpers:** `readConfidentialBalanceOfContract`, `readWrapperForTokenContract`, `readUnderlyingTokenContract`, `readWrapperExistsContract`, `readSupportsInterfaceContract`.

**Write helpers:** `writeConfidentialTransferContract`, `writeConfidentialBatchTransferContract`, `writeUnwrapContract`, `writeUnwrapFromBalanceContract`, `writeFinalizeUnwrapContract`, `writeSetOperatorContract`, `writeWrapContract`, `writeWrapETHContract`.

### ethers (`@zama-fhe/sdk/ethers`)

Same set of functions, but read helpers take `Provider | Signer` and write helpers take `Signer`.

```ts
import {
  readConfidentialBalanceOfContract,
  writeConfidentialTransferContract,
} from "@zama-fhe/sdk/ethers";

const handle = await readConfidentialBalanceOfContract(provider, tokenAddress, userAddress);
const txHash = await writeConfidentialTransferContract(
  signer,
  tokenAddress,
  to,
  handle,
  inputProof,
);
```

For full API details, see the [SDK API Reference](../../api/sdk/src/README.md), [SDK viem API](../../api/sdk/src/viem/README.md), and [SDK ethers API](../../api/sdk/src/ethers/README.md).
