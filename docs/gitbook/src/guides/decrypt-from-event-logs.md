---
title: Decrypt values from event logs
description: Decrypt an FHE encrypted value pulled straight off an event log — the common server-side pattern for indexers, wallet history, and bridges.
---

# Decrypt values from event logs

Most decryption examples start from a balance: you call `confidentialBalanceOf`, get back an encrypted value, and decrypt it. But a balance is not the only source of an encrypted value. **Any `bytes32` encrypted value emitted in an event log is a valid decryption input** — and decrypting from logs is a common backend pattern: indexers, wallet transaction history, accounting pipelines, and bridges all read confidential amounts straight off `ConfidentialTransfer`, `Wrap`, and `UnwrapFinalized` events.

The SDK treats both sources identically. A decryption input is just `{ encryptedValue, contractAddress }`, and an event-log encrypted value drops straight in:

```ts
const cleartext = await sdk.decryption.decryptValues([
  { encryptedValue: transfer.encryptedAmount, contractAddress: tokenAddress },
]);
```

This guide shows the full loop — fetch logs, decode them, decrypt the amounts — and explains the one real-world constraint that catches indexers: **who is allowed to decrypt a given encrypted value.**

Before starting, set up a Node.js backend following the [Node.js backend](./node-js-backend.md) guide. This guide reuses that `sdk` and `publicClient`. For Go or Rust, set up the SDK following [Configuration](./configuration.md) and [attach a wallet](../native/guides/attach-wallet.md); log queries use your go-ethereum or Alloy provider.

## Example

A minimal indexer: fetch every confidential transfer for a token, decode each log, and decrypt the amounts in one batch.

{% tabs %}
{% tab title="Core SDK" %}

{% code title="indexer.ts" %}

```ts
import { decodeConfidentialTransfer, TOKEN_TOPICS } from "@zama-fhe/sdk";
import type { Address } from "viem";
// `sdk` and `publicClient` come from your Node.js backend setup (createConfig +
// node() relayer). `./client` stands in for wherever you export them — the
// Node.js backend guide builds them as inline consts, so extract them there.
import { sdk, publicClient } from "./client";

const tokenAddress = "0xYourConfidentialToken" as Address;
// The token's deployment block. Providers cap getLogs block ranges, so large
// backfills page forward from here instead of fetching everything in one call.
const startBlock = 0n;

// 1. Fetch raw logs for the confidential token events.
const logs = await publicClient.getLogs({
  address: tokenAddress,
  topics: [TOKEN_TOPICS],
  fromBlock: startBlock,
  toBlock: "latest",
});

// 2. Decode the ConfidentialTransfer logs. Each carries an `encryptedAmount` —
//    the same kind of encrypted value you get from a balance. The decoder
//    returns null for non-matching logs, so `flatMap(... ?? [])` drops them.
const transfers = logs.flatMap((log) => decodeConfidentialTransfer(log) ?? []);

// 3. Decrypt every amount in a single call. `decryptValues` groups inputs by
//    contract and returns a record keyed by the encrypted value.
const cleartext = await sdk.decryption.decryptValues(
  transfers.map((t) => ({ encryptedValue: t.encryptedAmount, contractAddress: tokenAddress })),
);

for (const transfer of transfers) {
  console.log(`${transfer.from} → ${transfer.to}: ${cleartext[transfer.encryptedAmount]}`);
}
```

{% endcode %}

{% endtab %}
{% tab title="Go" %}

Decode the logs with go-ethereum. The three `ConfidentialTransfer` fields are indexed topics.

```go
import (
	"context"
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
	zama "github.com/zama-ai/sdk/clients/go/v3"
)

var confidentialTransfer = crypto.Keccak256Hash([]byte("ConfidentialTransfer(address,address,bytes32)"))

func indexTransfers(ctx context.Context, sdk *zama.SDKContext, eth *ethclient.Client) error {
	tokenAddress := common.HexToAddress("0xYourConfidentialToken")
	// The token's deployment block. Providers cap getLogs block ranges, so large
	// backfills page forward from here instead of fetching everything in one call.
	startBlock := big.NewInt(0)

	// 1. Fetch the ConfidentialTransfer logs. `from`, `to`, and the encrypted
	//    amount are all indexed, so each log carries them as topics 1 to 3.
	logs, err := eth.FilterLogs(ctx, ethereum.FilterQuery{
		Addresses: []common.Address{tokenAddress},
		Topics:    [][]common.Hash{{confidentialTransfer}},
		FromBlock: startBlock,
	})
	if err != nil {
		return err
	}

	// 2. Pair each encrypted amount with the contract that emitted it.
	inputs := make([]zama.EncryptedInput, 0, len(logs))
	for _, log := range logs {
		inputs = append(inputs, zama.EncryptedInput{EncryptedValue: log.Topics[3], ContractAddress: tokenAddress})
	}

	// 3. Decrypt every amount in a single call. The result is keyed by the
	//    encrypted value.
	cleartext, err := sdk.DecryptValues(ctx, inputs, zama.DecryptOptions{})
	if err != nil {
		return err
	}

	for _, log := range logs {
		from := common.BytesToAddress(log.Topics[1].Bytes())
		to := common.BytesToAddress(log.Topics[2].Bytes())
		fmt.Printf("%s → %s: %s\n", from, to, cleartext[log.Topics[3]].Integer)
	}
	return nil
}
```

{% endtab %}
{% tab title="Rust" %}

Add `alloy-rpc-types-eth` and `alloy-sol-types` alongside `alloy-provider`, using the same Alloy major as `zama_sdk`.

```rust
use alloy_provider::Provider;
use alloy_rpc_types_eth::Filter;
use alloy_sol_types::{SolEvent, sol};
use zama_sdk::{Address, ClearValue, EncryptedInput, Sdk};

sol! {
    event ConfidentialTransfer(address indexed from, address indexed to, bytes32 indexed amount);
}

pub async fn index_transfers(sdk: &Sdk, provider: &impl Provider) -> anyhow::Result<()> {
    let token_address: Address = "0xYourConfidentialToken".parse()?;
    // The token's deployment block. Providers cap getLogs block ranges, so large
    // backfills page forward from here instead of fetching everything in one call.
    let start_block = 0;

    // 1. Fetch and decode the ConfidentialTransfer logs. Each carries the
    //    encrypted amount as `amount`.
    let filter = Filter::new()
        .address(token_address)
        .event_signature(ConfidentialTransfer::SIGNATURE_HASH)
        .from_block(start_block);
    let transfers = provider
        .get_logs(&filter)
        .await?
        .iter()
        .map(|log| ConfidentialTransfer::decode_log(&log.inner).map(|event| event.data))
        .collect::<Result<Vec<_>, _>>()?;

    // 2. Pair each encrypted amount with the contract that emitted it.
    let inputs: Vec<_> = transfers
        .iter()
        .map(|transfer| EncryptedInput {
            encrypted_value: transfer.amount,
            contract_address: token_address,
        })
        .collect();

    // 3. Decrypt every amount in a single call. The result is keyed by the
    //    encrypted value.
    let cleartext = sdk.decryption().decrypt_values(&inputs, None).await?;

    for transfer in &transfers {
        if let Some(ClearValue::BigInt(amount)) = cleartext.get(&transfer.amount) {
            println!("{} → {}: {amount}", transfer.from, transfer.to);
        }
    }
    Ok(())
}
```

{% endtab %}
{% endtabs %}

That is the entire pattern. The rest of this guide breaks it into steps and covers the access-control caveat.

## Steps

### 1. Fetch and decode the logs

{% tabs %}
{% tab title="Core SDK" %}

Use the [event decoders](../reference/sdk/event-decoders.md) to turn raw `eth_getLogs` entries into typed events. `TOKEN_TOPICS` fetches every supported token event in one RPC call; `decodeOnChainEvents` decodes them and skips anything unrecognized.

```ts
import { decodeOnChainEvents, TOKEN_TOPICS } from "@zama-fhe/sdk";

const logs = await publicClient.getLogs({
  address: tokenAddress,
  topics: [TOKEN_TOPICS],
  fromBlock: startBlock,
  toBlock: "latest",
});

const events = decodeOnChainEvents(logs);
```

Each decoded event exposes its encrypted value under a typed field:

| Event                  | Encrypted value field    | Meaning                       |
| ---------------------- | ------------------------ | ----------------------------- |
| `ConfidentialTransfer` | `encryptedAmount`        | Amount transferred            |
| `Wrap`                 | `encryptedWrappedAmount` | Amount shielded (minted)      |
| `UnwrapRequested`      | `encryptedAmount`        | Amount requested for unshield |
| `UnwrapFinalized`      | `encryptedAmount`        | Amount unshielded             |

To decode a single log instead of a batch, use the individual decoders (`decodeConfidentialTransfer(log)`, `decodeWrap(log)`, …), each of which returns `null` for a non-matching log. See the [event decoders reference](../reference/sdk/event-decoders.md) for the full list and field types.

{% endtab %}
{% tab title="Go" %}

Fetch the `ConfidentialTransfer` logs with go-ethereum. The event fields are all indexed, so no ABI decoding is needed.

```go
confidentialTransfer := crypto.Keccak256Hash([]byte("ConfidentialTransfer(address,address,bytes32)"))

logs, err := eth.FilterLogs(ctx, ethereum.FilterQuery{
	Addresses: []common.Address{tokenAddress},
	Topics:    [][]common.Hash{{confidentialTransfer}},
	FromBlock: startBlock,
})
if err != nil {
	return err
}
// Topics 1 to 3 hold `from`, `to`, and the encrypted amount.
```

{% endtab %}
{% tab title="Rust" %}

Fetch and decode the `ConfidentialTransfer` logs with Alloy.

```rust
sol! {
    event ConfidentialTransfer(address indexed from, address indexed to, bytes32 indexed amount);
}

let filter = Filter::new()
    .address(token_address)
    .event_signature(ConfidentialTransfer::SIGNATURE_HASH)
    .from_block(start_block);
let transfers = provider
    .get_logs(&filter)
    .await?
    .iter()
    .map(|log| ConfidentialTransfer::decode_log(&log.inner).map(|event| event.data))
    .collect::<Result<Vec<_>, _>>()?;
```

{% endtab %}
{% endtabs %}

### 2. Decrypt the encrypted values

Pass the decoded encrypted values to `sdk.decryption.decryptValues`. Each input pairs the encrypted value with the contract that emitted it. The result is a record mapping each encrypted value back to its clear-text value.

{% tabs %}
{% tab title="Core SDK" %}

```ts
// Narrow the decoded `events` to the type you want. Each event exposes its
// encrypted value under a different field (see the table above), so narrow on
// `eventName` first — `encryptedAmount` is only valid after filtering to
// `ConfidentialTransfer`.
const transfers = events.filter((e) => e.eventName === "ConfidentialTransfer");

const cleartext = await sdk.decryption.decryptValues(
  transfers.map((transfer) => ({
    encryptedValue: transfer.encryptedAmount,
    contractAddress: tokenAddress,
  })),
);

// cleartext maps each encrypted value back to its clear-text amount:
// { "0xencryptedValue…": 500n }
const amount = cleartext[transfers[0].encryptedAmount]; // 500n
```

{% endtab %}
{% tab title="Go" %}

```go
inputs := make([]zama.EncryptedInput, 0, len(logs))
for _, log := range logs {
	inputs = append(inputs, zama.EncryptedInput{EncryptedValue: log.Topics[3], ContractAddress: tokenAddress})
}

cleartext, err := sdk.DecryptValues(ctx, inputs, zama.DecryptOptions{})
if err != nil {
	return err
}

// cleartext maps each encrypted value back to its clear-text amount.
amount := cleartext[logs[0].Topics[3]].Integer // 500
```

{% endtab %}
{% tab title="Rust" %}

```rust
let inputs: Vec<_> = transfers
    .iter()
    .map(|transfer| EncryptedInput {
        encrypted_value: transfer.amount,
        contract_address: token_address,
    })
    .collect();

let cleartext = sdk.decryption().decrypt_values(&inputs, None).await?;

// cleartext maps each encrypted value back to its clear-text amount.
let amount = cleartext.get(&transfers[0].amount); // Some(ClearValue::BigInt(500))
```

{% endtab %}
{% endtabs %}

`decryptValues` accepts many inputs at once and groups them by contract address — so decrypting a page of transfers costs one round-trip per token, not one per transfer. A group only splits into more than one relayer request if its values would otherwise exceed the relayer's per-request size budget (see [Automatic chunking for large decrypt batches](../changelog/v3-4.md#automatic-chunking-for-large-decrypt-batches)). Results are cached per signer and contract, so re-decrypting an encrypted value you have already seen returns instantly without hitting the relayer.

{% hint style="info" %}
**No explicit permit call needed.** `decryptValues` signs and caches the required EIP-712 permit on demand the first time it runs for a contract. In a backend you can call `sdk.permits.grantPermit([tokenAddress])` up front if you prefer to do the signing during startup rather than on the first decrypt — but it is not required.
{% endhint %}

### 3. Make sure your signer is allowed to decrypt

This is the constraint that trips up indexers. Decryption is **access-controlled on-chain**: the relayer only returns a clear-text value if the configured signer's address has on-chain decryption rights for that specific encrypted value. The encrypted value being readable in a public log does **not** mean anyone can decrypt it.

For a `ConfidentialTransfer`, the protocol grants decryption rights to the parties to the transfer. So the two cases are:

- **Your backend is a party to the transfers** (e.g. a custodial wallet or exchange decrypting deposits and withdrawals for accounts it controls). The configured signer already has rights, and `decryptValues` works directly as shown above.
- **Your backend is a neutral indexer** decrypting amounts that belong to other users (a block explorer, a shared analytics service). Your signer has no rights to those encrypted values, and `decryptValues` will fail. The user must first **delegate decryption rights** to your backend's address; you then decrypt with `sdk.decryption.delegatedDecryptValues(inputs, delegatorAddress)`.

If you only ever index your own accounts' activity, you can stop here. If you need to decrypt on behalf of other users, follow the [Delegated decryption](./delegated-decryption.md) guide — the only change to the loop above is swapping `decryptValues` for `delegatedDecryptValues` and passing the delegator's address.

## In the browser (React)

The same pattern works in a dApp showing a user's confidential transaction history. Fetch and decode the logs the same way, then feed the encrypted values to `useDecryptValues` instead of calling the SDK directly:

```tsx
import { useDecryptValues } from "@zama-fhe/react-sdk";

// `transfers` decoded from logs as above
const inputs = transfers.map((t) => ({
  encryptedValue: t.encryptedAmount,
  contractAddress: tokenAddress,
}));

const { data: cleartext } = useDecryptValues(inputs);
// cleartext?.[transfers[0].encryptedAmount] → 500n
```

Gate the decrypt behind a permit check so the wallet signature prompt only appears on user action — see [Encrypt & decrypt](./encrypt-decrypt.md#3-decryption-of-the-encrypted-data) for the `DecryptGate` pattern.

## Next steps

- [Event decoders](../reference/sdk/event-decoders.md) — every decoder, finder, and event field type
- [Node.js backend](./node-js-backend.md) — backend setup, storage isolation, and direct API key auth
- [Delegated decryption](./delegated-decryption.md) — decrypt on behalf of other users
- [Encrypt & decrypt](./encrypt-decrypt.md) — the full decryption UX in the browser
