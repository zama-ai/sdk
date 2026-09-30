---
description: Connect signing and transaction callbacks from Go and Rust to the daemon.
---

# Attach a wallet

Attach a wallet when your SDK context needs private decryption, permits, or [on-chain delegation](../../guides/delegated-decryption.md). Your application keeps the signing key; the daemon asks your wallet to sign typed data or submit a transaction.

## Connect a native wallet

The built-in adapters sign typed data and broadcast contract writes. Load the private key through your application's secret provisioning.

{% tabs %}
{% tab title="Go" %}

```go
provider, err := ethclient.DialContext(ctx, rpcURL)
if err != nil {
	return err
}
defer provider.Close() // keep the provider open until the SDK context closes

signer, err := zama.NewEthereumSigner(privateKey, 11155111, provider)
if err != nil {
	return err
}
sdk, err := client.CreateContext(ctx, config, signer)
if err != nil {
	return err
}
```

Use `NewPrivateKeySigner` for typed-data signing only. For an external wallet, set `SignerConfig.Account`, `SignTypedData`, and `WriteContract` yourself.

{% endtab %}
{% tab title="Rust" %}

Enable the `alloy` feature and add the Alloy crates your application imports. Use the same Alloy major version as `zama_sdk` (2.x), or the provider types do not match.

```sh
cargo add zama_sdk --features alloy
cargo add alloy-provider@2 --no-default-features --features reqwest,reqwest-rustls-tls
cargo add alloy-signer-local@2 --no-default-features --features zeroize
```

```rust
let signer: PrivateKeySigner = private_key.parse()?;
let account = WalletAccount {
    address: signer.address(),
    chain_id: 11_155_111,
};
let provider = ProviderBuilder::new()
    .disable_recommended_fillers()
    .with_gas_estimation()
    .with_blob_gas_estimation()
    .with_simple_nonce_management()
    .fetch_chain_id()
    .wallet(signer.clone())
    .connect_http(rpc_url.parse()?);
let wallet = AlloySigner::new(signer).with_transactions(provider);
let sdk = client
    .sdk(config)
    .signer(Some(account), wallet)
    .build()
    .await?;
```

Use `AlloySigner::new(signer)` without `with_transactions` for typed-data signing only. For an external wallet, implement `Signer` with its typed-data and contract-write methods.

{% endtab %}
{% endtabs %}

The wallet account and the provider's chain must match the configured SDK chain; the adapters check both before a write. When your wallet switches accounts, update the SDK context's account.

## Submit SDK transactions

Call the SDK operation, such as `DelegateDecryption` in Go or `sdk.delegations().delegate_decryption` in Rust. The daemon sends the encoded contract call to your wallet, the wallet signs and broadcasts it, and the SDK waits for the receipt. The operation returns the transaction hash and receipt logs. Nothing resubmits the transaction if the receipt lookup fails.

For a custom wallet:

- Check the requested account and chain.
- Broadcast the call data unchanged, with the requested destination, value, and gas limit. Omitted gas means estimate it.
- Use the ABI, method, and arguments only for wallet display. Integer arguments arrive as decimal strings.
- Supply fees and nonces from your wallet.
- Return the broadcast hash once. Never replay a wallet action or resubmit a write automatically.

Wallet callbacks can run concurrently. The built-in adapters do not coordinate nonces across concurrent writes, so serialize submissions per account in your application.

Report a rejection or failure as an SDK error. Report a revert detected before broadcast with Go `ExecutionRevertError` or Rust `SdkError::execution_reverted`; the operation then fails with `TRANSACTION_REVERTED`.

If a write ends without a clear result, follow [Resolve uncertain transaction outcomes](uncertain-transaction-outcomes.md).
