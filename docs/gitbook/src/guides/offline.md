---
title: Offline signing
description: How to build unsigned transactions that are signed and broadcast out-of-process by a custody platform, HSM, or policy engine, from TypeScript, Go, or Rust.
---

# Offline signing

`sdk.offline.prepare` builds a fully populated unsigned transaction and hands it to you. Signing and broadcasting happen out-of-process: an institutional custody platform, an HSM ceremony, a policy engine with human approval. The preparing process never holds the wallet private key.

{% hint style="info" %}
**Prefer the atomic API when you can.** If your signer can complete a signature inside one `Promise` (even a slow one that polls a custody API), implement a custom [`BaseSigner`](../reference/sdk/GenericSigner.md#implementing-a-custom-signer) and keep the one-call `Token` methods. Reach for `prepare` only when signing genuinely leaves the process.
{% endhint %}

## Steps

### 1. Configure the SDK without a signer

The signer is optional. A provider is all `prepare` needs:

{% tabs %}
{% tab title="Core SDK" %}

```ts
import { createConfig, MemoryStorage, ZamaSDK } from "@zama-fhe/sdk";
import { sepolia } from "@zama-fhe/sdk/chains";
import { node } from "@zama-fhe/sdk/node";
import { ViemProvider } from "@zama-fhe/sdk/viem";

const sdk = new ZamaSDK(
  createConfig({
    chains: [sepolia],
    relayers: { [sepolia.id]: node() },
    provider: new ViemProvider({ publicClient }), // reads only
    storage: new MemoryStorage(),
  }),
);
```

{% endtab %}
{% tab title="Go" %}

```go
import zama "github.com/zama-ai/sdk/clients/go/v3"

client, err := zama.Dial(socketPath)
if err != nil {
	return err
}
defer client.Close()

// An empty SignerConfig attaches no signer: the daemon only reads through rpcURL.
sdk, err := client.CreateContext(ctx, zama.NewSDKConfig(11155111, rpcURL), zama.SignerConfig{})
if err != nil {
	return err
}
defer sdk.Close(ctx)
```

{% endtab %}
{% tab title="Rust" %}

```rust
use zama_sdk::{Client, SdkConfig};

let client = Client::connect(socket_path).await?;
// No .signer(...) on the builder: the daemon only reads through rpc_url.
let sdk = client
    .sdk(SdkConfig::new(11155111, rpc_url))
    .build()
    .await?;
```

{% endtab %}
{% endtabs %}

### 2. Prepare an unsigned transaction

{% tabs %}
{% tab title="Core SDK" %}

```ts
const prepared = await sdk.offline.prepare({
  kind: "ConfidentialTransfer",
  from: "0xCustodyWallet",
  token: "0xConfidentialToken",
  to: "0xRecipient",
  amount: 1000n,
});
// { kind: "ConfidentialTransfer", from: "0xCustodyWallet", unsignedTx: "0x02..." }
```

{% endtab %}
{% tab title="Go" %}

```go
prepared, err := sdk.PrepareTransaction(ctx, zama.ConfidentialTransferRequest{
	From:   custodyWallet,
	Token:  confidentialToken,
	To:     recipient,
	Amount: big.NewInt(1000),
}, nil)
if err != nil {
	return err
}
// {Kind: TransactionConfidentialTransfer, From: custodyWallet, UnsignedTx: 0x02...}
```

`UnsignedTx` holds raw bytes; encode it, for example as hex, before it crosses a process boundary.

{% endtab %}
{% tab title="Rust" %}

```rust
use zama_sdk::{PrepareTransaction, Transaction, U256};

let prepared = sdk
    .offline()
    .prepare(
        PrepareTransaction {
            from: custody_wallet,
            transaction: Transaction::ConfidentialTransfer {
                token: confidential_token,
                to: recipient,
                amount: U256::from(1000),
            },
        },
        None,
    )
    .await?;
// PreparedTransaction { kind: ConfidentialTransfer, from: custody_wallet, unsigned_tx: 0x02... }
```

`unsigned_tx` holds raw bytes; encode it, for example as hex, before it crosses a process boundary.

{% endtab %}
{% endtabs %}

For a transfer, the amount is encrypted during `prepare`, including the required relayer interactions, and the calldata is ready to sign. `from` must match the address of the key that eventually signs: encrypted inputs are bound to that sender, so a mismatch reverts on-chain. The result is JSON-safe and crosses a process boundary as-is. `unsignedTx` carries the whole EIP-1559 transaction (chain id, nonce, calldata, gas and fee caps); `from` travels alongside because an unsigned transaction has no sender field and the custodian needs it to pick the signing key.

Nonce, gas, and fees are read from chain state; override them per call when you need control:

{% tabs %}
{% tab title="Core SDK" %}

```ts
await sdk.offline.prepare(request, {
  nonce: 12,
  gasLimit: 1_000_000n,
  fees: { maxFeePerGas: 60_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n },
});
```

{% endtab %}
{% tab title="Go" %}

```go
nonce := uint64(12)
gasLimit := uint64(1_000_000)
prepared, err := sdk.PrepareTransaction(ctx, request, &zama.PrepareOptions{
	Nonce:    &nonce,
	GasLimit: &gasLimit,
	Fees: &zama.PrepareFees{
		MaxFeePerGas:         big.NewInt(60_000_000_000),
		MaxPriorityFeePerGas: big.NewInt(1_000_000_000),
	},
})
```

{% endtab %}
{% tab title="Rust" %}

```rust
use zama_sdk::{PrepareFees, PrepareOptions, U256};

let prepared = sdk
    .offline()
    .prepare(
        request,
        Some(PrepareOptions {
            nonce: Some(12),
            gas_limit: Some(1_000_000),
            fees: Some(PrepareFees {
                max_fee_per_gas: U256::from(60_000_000_000u64),
                max_priority_fee_per_gas: U256::from(1_000_000_000u64),
            }),
        }),
    )
    .await?;
```

{% endtab %}
{% endtabs %}

### 3. Sign and broadcast out-of-process

The custody platform signs the prepared transaction after policy approval, preserving its nonce, gas limit, fees, and calldata. Custody platforms typically accept the unsigned payload directly and broadcast in the same call:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const txHash = await custody.signAndBroadcast(prepared.unsignedTx);
```

{% endtab %}
{% tab title="Go" %}

```go
txHash, err := custody.SignAndBroadcast(ctx, prepared.UnsignedTx)
```

{% endtab %}
{% tab title="Rust" %}

```rust
let tx_hash = custody.sign_and_broadcast(&prepared.unsigned_tx).await?;
```

{% endtab %}
{% endtabs %}

Some platforms also support signing without broadcasting. When that API accepts serialized transactions, it returns the serialized signed transaction for you to broadcast:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const signedTx = await custody.sign(prepared.unsignedTx);
const txHash = await publicClient.sendRawTransaction({ serializedTransaction: signedTx });
```

{% endtab %}
{% tab title="Go" %}

```go
import "github.com/ethereum/go-ethereum/core/types"

signedTx, err := custody.Sign(ctx, prepared.UnsignedTx)
if err != nil {
	return err
}
var tx types.Transaction
if err := tx.UnmarshalBinary(signedTx); err != nil {
	return err
}
if err := ethClient.SendTransaction(ctx, &tx); err != nil {
	return err
}
txHash := tx.Hash()
```

{% endtab %}
{% tab title="Rust" %}

```rust
use alloy_provider::Provider;

let signed_tx = custody.sign(&prepared.unsigned_tx).await?;
let pending = provider.send_raw_transaction(&signed_tx).await?;
let tx_hash = *pending.tx_hash();
```

{% endtab %}
{% endtabs %}

{% hint style="warning" %}
**Raw-signature APIs need an extra assembly step.** A raw HSM typically signs the EIP-1559 transaction digest and returns signature components, not a serialized transaction. Use your Ethereum library to compute the signing digest and insert the signature into the transaction envelope before broadcasting; do not treat the raw signature as signed transaction bytes.
{% endhint %}

Either way, watch the chain yourself: fetch the receipt for the transaction hash through your own provider, and wait for enough confirmations for your risk policy before acting on it. A receipt returned at first inclusion can still be invalidated by a reorganization, for example after you use it to prepare `FinalizeUnwrap`.

## Request kinds

Each `prepare` call produces one transaction. The `kind` selects what it builds:

| Kind                                                | Transaction               | Notes                                                                |
| --------------------------------------------------- | ------------------------- | -------------------------------------------------------------------- |
| `ConfidentialTransfer` / `ConfidentialTransferFrom` | ERC-7984 transfer         | amount encrypted during `prepare`                                    |
| `SetOperator`                                       | operator approval         | explicit `until` timestamp required                                  |
| `TransferAndCall`                                   | single-transaction shield | ERC-1363 underlyings only                                            |
| `ApproveUnderlying` + `Wrap`                        | two-transaction shield    | see the batch warning below                                          |
| `Unwrap` / `UnwrapAll`                              | unshield phase 1          | `Unwrap` encrypts the amount; `UnwrapAll` reads the on-chain balance |
| `FinalizeUnwrap`                                    | unshield phase 2          | public decryption happens during `prepare`                           |
| `DelegateDecryption` / `RevokeDelegation`           | ACL delegation            | explicit expiry, or omit for permanent                               |

## Multi-transaction flows

`WrappedToken.shield()` and `WrappedToken.unshield()` need a live signer, so offline workflows compose their underlying steps with `prepare`: `TransferAndCall` or `ApproveUnderlying` then `Wrap` for shielding, and `Unwrap` then `FinalizeUnwrap` for unshielding. Offline workflows are one of the few places where composing below the `Token` API is correct.

**Shield** mirrors the [shielding paths](./shield-tokens.md#shielding-paths): one `TransferAndCall` for ERC-1363 underlyings, otherwise `ApproveUnderlying` then `Wrap`. Check which path applies with `await wrappedToken.isPayable()`; this provider-only read does not require a signer. Go and Rust don't expose `isPayable`: use `ApproveUnderlying` then `Wrap`, which works for every underlying.

{% hint style="warning" %}
**Dependent transactions must pin `nonce` and `gasLimit`.** Prepared before the first transaction mines, the second one hits two defaults that break: gas estimation reverts (the allowance does not exist yet) and the nonce read returns the same value twice. Pin both, or confirm each transaction before preparing the next. On the two-transaction path, some underlyings such as USDT require resetting a non-zero allowance first with an `ApproveUnderlying` of `0n` (a third pinned-nonce transaction).
{% endhint %}

{% tabs %}
{% tab title="Core SDK" %}

```ts
const nonce = await publicClient.getTransactionCount({ address: from, blockTag: "pending" });

const approve = await sdk.offline.prepare(
  { kind: "ApproveUnderlying", from, underlying, spender: wrapper, amount },
  { nonce },
);
const wrap = await sdk.offline.prepare(
  { kind: "Wrap", from, wrapper, to: from, amount },
  { nonce: nonce + 1, gasLimit: 1_000_000n },
);
```

{% endtab %}
{% tab title="Go" %}

```go
nonce, err := eth.PendingNonceAt(ctx, from)
if err != nil {
	return err
}

approve, err := sdk.PrepareTransaction(ctx, zama.ApproveUnderlyingRequest{
	From: from, Underlying: underlying, Spender: wrapper, Amount: amount,
}, &zama.PrepareOptions{Nonce: &nonce})
if err != nil {
	return err
}
wrapNonce, gasLimit := nonce+1, uint64(1_000_000)
wrap, err := sdk.PrepareTransaction(ctx, zama.WrapRequest{
	From: from, Wrapper: wrapper, To: from, Amount: amount,
}, &zama.PrepareOptions{Nonce: &wrapNonce, GasLimit: &gasLimit})
if err != nil {
	return err
}
```

{% endtab %}
{% tab title="Rust" %}

```rust
use zama_sdk::{PrepareOptions, PrepareTransaction, Transaction};

let nonce = provider.get_transaction_count(from).pending().await?;

let approve = sdk
    .offline()
    .prepare(
        PrepareTransaction {
            from,
            transaction: Transaction::ApproveUnderlying { underlying, spender: wrapper, amount },
        },
        Some(PrepareOptions { nonce: Some(nonce), ..Default::default() }),
    )
    .await?;
let wrap = sdk
    .offline()
    .prepare(
        PrepareTransaction {
            from,
            transaction: Transaction::Wrap { wrapper, to: from, amount },
        },
        Some(PrepareOptions {
            nonce: Some(nonce + 1),
            gas_limit: Some(1_000_000),
            ..Default::default()
        }),
    )
    .await?;
```

{% endtab %}
{% endtabs %}

**Unshield** is the request-then-finalize round-trip. The finalize input comes from the phase-1 receipt:

{% tabs %}
{% tab title="Core SDK" %}

```ts
import { findUnwrapRequested } from "@zama-fhe/sdk";

const unwrap = await sdk.offline.prepare({
  kind: "Unwrap",
  from,
  token: wrapper,
  to: from,
  amount,
});
// sign, broadcast, fetch the receipt, then:
const event = findUnwrapRequested(receipt.logs);
if (!event) throw new Error("No UnwrapRequested event in receipt");
// Persist event.unwrapRequestId now; offline unshield state is not tracked for you.

const finalize = await sdk.offline.prepare({
  kind: "FinalizeUnwrap",
  from,
  wrapper,
  unwrapRequestIdOrAmount: event.unwrapRequestId,
});
```

{% endtab %}
{% tab title="Go" %}

```go
unwrap, err := sdk.PrepareTransaction(ctx, zama.UnwrapRequest{
	From: from, Token: wrapper, To: from, Amount: amount,
}, nil)
if err != nil {
	return err
}
// sign, broadcast, fetch the receipt, then:
unwrapRequested := crypto.Keccak256Hash([]byte("UnwrapRequested(address,bytes32,bytes32)"))
var requestID common.Hash
for _, log := range receipt.Logs {
	if log.Address == wrapper && len(log.Topics) == 3 && log.Topics[0] == unwrapRequested {
		requestID = log.Topics[2]
	}
}
if requestID == (common.Hash{}) {
	return errors.New("no UnwrapRequested event in receipt")
}
// Persist requestID now; offline unshield state is not tracked for you.

finalize, err := sdk.PrepareTransaction(ctx, zama.FinalizeUnwrapRequest{
	From: from, Wrapper: wrapper, UnwrapRequestIDOrAmount: requestID.Bytes(),
}, nil)
if err != nil {
	return err
}
```

{% endtab %}
{% tab title="Rust" %}

Add `alloy-sol-types` to decode the event, on the same Alloy major as `zama_sdk`.

```rust
use alloy_sol_types::{SolEvent, sol};
use zama_sdk::{PrepareTransaction, Transaction};

sol! {
    event UnwrapRequested(address indexed receiver, bytes32 indexed unwrapRequestId, bytes32 amount);
}

let unwrap = sdk
    .offline()
    .prepare(
        PrepareTransaction { from, transaction: Transaction::Unwrap { token: wrapper, to: from, amount } },
        None,
    )
    .await?;
// sign, broadcast, fetch the receipt, then:
let request_id = receipt
    .inner
    .logs()
    .iter()
    .filter(|log| log.address() == wrapper)
    .find_map(|log| UnwrapRequested::decode_log(&log.inner).ok())
    .map(|event| event.data.unwrapRequestId)
    .ok_or_else(|| anyhow::anyhow!("no UnwrapRequested event in receipt"))?;
// Persist request_id now; offline unshield state is not tracked for you.

let finalize = sdk
    .offline()
    .prepare(
        PrepareTransaction {
            from,
            transaction: Transaction::FinalizeUnwrap {
                wrapper,
                unwrap_request_id_or_amount: request_id.to_vec(),
            },
        },
        None,
    )
    .await?;
```

{% endtab %}
{% endtabs %}

Neither phase requires a separate wallet signature: both perform the required relayer interactions during `prepare`.

## Approval delays

Policy approval can take hours or days. The cryptographic proofs tolerate that, but the transaction still depends on chain state:

- The input proof (`Unwrap`) and the public decryption proof (`FinalizeUnwrap`) embedded in the calldata have no on-chain expiry. Only rebroadcasting the same signed bytes is safe without further checks. A duplicate `FinalizeUnwrap` reverts instead of paying twice, but re-preparing any other kind (including `Unwrap`) with a fresh nonce creates a new transaction; confirm the original never landed first.
- The nonce can become stale if another transaction from the same wallet is mined first. Reserve or otherwise coordinate nonces across concurrent workflows, and re-prepare if the nonce is consumed.
- Contract state can change while approval is pending, and explicit timestamps such as `SetOperator.until` or a delegation expiry keep advancing. Re-prepare when the transaction's assumptions no longer hold.
- The fee cap can fall below the base fee. Add suitable headroom to `maxFeePerGas`; only the base fee plus priority tip is charged, so unused cap headroom costs nothing. Keep `maxPriorityFeePerGas` at an appropriate tip because raising it can increase the amount paid.

## Offline permits

A decryption [permit](../concepts/permit-model.md) is not a transaction — nothing is broadcast, and registering the signature is a local operation — so it gets its own two-step flow instead of a `prepare` kind: `sdk.offline.preparePermit` builds the unsigned EIP-712 typed data, and `sdk.permits.registerPermit` verifies and persists the signature the custodian returns.

{% tabs %}
{% tab title="Core SDK" %}

```ts
const prepared = await sdk.offline.preparePermit({
  signer: "0xCustodyWallet",
  contracts: ["0xConfidentialToken"],
  // delegator: "0xOwner",      // omit for a self permit
  // durationDays: 30,          // defaults to the SDK's configured permitTTL
});
```

{% endtab %}
{% tab title="Go" %}

```go
prepared, err := sdk.PreparePermit(ctx, custodyWallet, []common.Address{confidentialToken}, zama.PreparePermitOptions{
	// Delegator: &owner,       // omit for a self permit
	// DurationDays: &days,     // defaults to the SDK's configured permit TTL
})
if err != nil {
	return err
}
```

{% endtab %}
{% tab title="Rust" %}

```rust
use zama_sdk::PreparePermit;

let prepared = sdk
    .offline()
    .prepare_permit(PreparePermit {
        signer: custody_wallet,
        contracts: &[confidential_token],
        delegator: None,     // Some(owner) for a delegated permit
        duration_days: None, // defaults to the SDK's configured permit TTL
    })
    .await?;
```

{% endtab %}
{% endtabs %}

`preparePermit` is signer-offline, not network-offline: resolving the transport key pair and building the typed data still reads the chain's KMS signers context on-chain, so the provider must be reachable. It never touches a configured signer or connected wallet — `request.signer` is an explicit address, matching the offline `prepare` contract above.

Hand the prepared EIP-712 typed data to the custodian for `eth_signTypedData_v4`, exactly as you would for the atomic `grantPermit` path. Nothing about the payload changes for the offline flow:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const signature = await custody.signTypedData(prepared.eip712);
```

{% endtab %}
{% tab title="Go" %}

```go
signature, err := custody.SignTypedData(ctx, prepared.TypedDataJSON)
if err != nil {
	return err
}
```

{% endtab %}
{% tab title="Rust" %}

```rust
let signature = custody.sign_typed_data(&prepared.typed_data).await?;
```

{% endtab %}
{% endtabs %}

Then register the signature. This verifies it against the prepared typed data and persists the permit, with no further wallet interaction:

{% tabs %}
{% tab title="Core SDK" %}

```ts
await sdk.permits.registerPermit(prepared, signature);
```

{% endtab %}
{% tab title="Go" %}

```go
if err := sdk.RegisterPermit(ctx, prepared.Envelope, signature); err != nil {
	return err
}
```

Pass `Envelope` unchanged; it carries the prepared permit that the signature is checked against.

{% endtab %}
{% tab title="Rust" %}

```rust
sdk.permits()
    .register_permit(&prepared.envelope, &signature)
    .await?;
```

Pass `envelope` unchanged; it carries the prepared permit that the signature is checked against.

{% endtab %}
{% endtabs %}

The recovery byte may be either `0`/`1` or `27`/`28`: the SDK normalizes it before the permit is verified.

One permit per call: unlike `grantPermit`, `preparePermit` never widens an existing permit or chunks a request over 10 contracts — `contracts` maps to exactly one signature.

{% hint style="info" %}
Available in the Core SDK and React SDK.
{% endhint %}

For more than 10 contracts, `batchPreparePermits` splits the request into one permit per 10 and `batchRegisterPermits` registers the signed pairs in order:

```ts
const prepared = await sdk.offline.batchPreparePermits({
  signer: "0xCustodyWallet",
  contracts: tokenAddresses, // any length; same fields as preparePermit otherwise
});
const signed = await Promise.all(
  prepared.map(async (p) => ({ prepared: p, signature: await custody.signTypedData(p.eip712) })),
);
await sdk.permits.batchRegisterPermits(signed);
```

Every permit is verified before any is stored, so a permit that fails verification leaves the store untouched; the error message is prefixed with that permit's position (`permits[i]: …`). Storing stays best-effort, like `registerPermit`: a failed store write is logged, not thrown.

{% hint style="warning" %}
**Register promptly.** `prepared.eip712.message` carries the permit's validity window (`startTimestamp` + `durationDays`); if approval takes long enough that the window elapses before you call `registerPermit`, it throws `PreparedPermitExpiredError` (`PREPARED_PERMIT_EXPIRED`) — call `preparePermit` again for a fresh window. The same applies to `batchRegisterPermits`: all chunks share one validity window, and one expired permit fails the whole batch. Registering also checks that the chain embedded in `prepared.eip712.domain` matches the SDK's active chain (`PreparedPermitChainMismatchError`, `PREPARED_PERMIT_CHAIN_MISMATCH`) and that the transport key pair hasn't changed since prepare (`TransportKeyPairChangedError`, `TRANSPORT_KEY_PAIR_CHANGED`, e.g. after a TTL expiry) — see the [Offline reference](../reference/sdk/Offline.md#preparepermit) for details.
{% endhint %}

{% hint style="info" %}
**KMS context rotation.** A registered permit is bound to the chain's KMS context. If that context is revoked on-chain, decrypts throw `RevokedKmsContextError` (`REVOKED_KMS_CONTEXT`) with a `SigningFailedError` (`SIGNING_FAILED`) as `cause`: the SDK's automatic re-grant cannot sign in a signerless session, so it keeps the scope's other permits and surfaces the error instead. Run `preparePermit` and `registerPermit` again for the affected contracts. See the [error reference](../reference/sdk/errors.md#revokedkmscontexterror) for how to tell this case apart from the retryable one.
{% endhint %}

## Next steps

- [Offline reference](../reference/sdk/Offline.md) -- full `prepare`/`preparePermit` signatures, request kinds, and options
- [Shield tokens](./shield-tokens.md) -- the atomic shield flow and routing table
- [Unshield tokens](./unshield-tokens.md) -- the atomic two-phase unshield
- [Node.js backend](./node-js-backend.md) -- server-side setup and custom signers
