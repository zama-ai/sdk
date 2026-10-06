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

## Validate signing requests

{% hint style="danger" %}
**Validate every request before your wallet signs it.** The daemon decides what to ask for. If it is compromised, this check is what stops it from obtaining a signature or a transaction your application did not approve. The built-in adapters check only the requested account and chain: they do not inspect the typed data or the contract call.
{% endhint %}

The SDK asks your wallet to sign only decryption permits. Compare each field with values from your own configuration, never with values taken from the request:

| Field                      | Expected value                                                                                                                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain.name`              | `Decryption`                                                                                                                                                                                                                                                                |
| `domain.version`           | `1`                                                                                                                                                                                                                                                                         |
| `domain.chainId`           | The chain your SDK context uses, for example `11155111` on Sepolia                                                                                                                                                                                                          |
| `domain.verifyingContract` | The chain's decryption verifying contract, `verifyingContractAddressDecryption` in the [network presets](../../reference/sdk/network-presets.md): `0x5D8BD78e2ea6bbE41f26dFe9fdaEAa349e077478` on Sepolia, `0x0f6024a97684f7d90ddb0fAAD79cB15F2C888D24` on Ethereum mainnet |
| `primaryType`              | `UserDecryptRequestVerification`, or `DelegatedUserDecryptRequestVerification` when you decrypt on behalf of a delegator                                                                                                                                                    |
| `message.userAddress`      | Your wallet address, when the field is present                                                                                                                                                                                                                              |

To limit which contracts a permit covers, also check `message.contractAddresses` or `message.allowedContracts` against the contracts your application decrypts. An empty `allowedContracts` list authorizes every contract.

The only contract writes the clients request are on-chain delegation changes: `delegateForUserDecryption` and `revokeDelegationForUserDecryption` on the chain's ACL contract (`aclContractAddress` in the network presets), with no value.

This wrapper rejects anything else before passing the request to your signer. The values shown are for Sepolia.

{% tabs %}
{% tab title="Go" %}

```go
import (
	"context"
	"errors"
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/signer/core/apitypes"
	zama "github.com/zama-ai/sdk/clients/go/v3"
)

// Values from your own configuration for Sepolia, never from the request.
var (
	chainID    = big.NewInt(11155111)
	decryption = common.HexToAddress("0x5D8BD78e2ea6bbE41f26dFe9fdaEAa349e077478")
	acl        = common.HexToAddress("0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D")
	selectors  = map[[4]byte]bool{
		{0x04, 0xf6, 0x1a, 0x95}: true, // delegateForUserDecryption(address,address,uint64)
		{0x66, 0x9e, 0x63, 0x16}: true, // revokeDelegationForUserDecryption(address,address)
	}
)

// Validate rejects any request the SDK would not make before the wallet signs it.
func Validate(inner zama.SignerConfig, wallet common.Address) zama.SignerConfig {
	sign, write := inner.SignTypedData, inner.WriteContract
	inner.SignTypedData = func(ctx context.Context, account zama.WalletAccount, typed apitypes.TypedData) ([]byte, error) {
		if err := checkTypedData(typed, wallet); err != nil {
			return nil, fmt.Errorf("%w: %v", zama.ErrSigningRejected, err)
		}
		return sign(ctx, account, typed)
	}
	if write != nil {
		inner.WriteContract = func(ctx context.Context, request zama.ContractWriteRequest) (common.Hash, error) {
			if err := checkWrite(request); err != nil {
				return common.Hash{}, fmt.Errorf("%w: %v", zama.ErrSigningRejected, err)
			}
			return write(ctx, request)
		}
	}
	return inner
}

func checkTypedData(typed apitypes.TypedData, wallet common.Address) error {
	domain := typed.Domain
	if domain.Name != "Decryption" || domain.Version != "1" {
		return errors.New("unexpected EIP-712 domain")
	}
	if domain.ChainId == nil || (*big.Int)(domain.ChainId).Cmp(chainID) != 0 {
		return errors.New("unexpected chain ID")
	}
	if !common.IsHexAddress(domain.VerifyingContract) || common.HexToAddress(domain.VerifyingContract) != decryption {
		return errors.New("unexpected verifying contract")
	}
	switch typed.PrimaryType {
	case "UserDecryptRequestVerification", "DelegatedUserDecryptRequestVerification":
	default:
		return fmt.Errorf("unexpected request type %q", typed.PrimaryType)
	}
	if user, ok := typed.Message["userAddress"].(string); ok && common.HexToAddress(user) != wallet {
		return errors.New("permit names another user")
	}
	return nil
}

func checkWrite(request zama.ContractWriteRequest) error {
	if request.Address != acl || len(request.Data) < 4 || !selectors[[4]byte(request.Data[:4])] {
		return errors.New("unexpected contract call")
	}
	if request.Value != nil && request.Value.Sign() != 0 {
		return errors.New("unexpected value transfer")
	}
	return nil
}
```

Wrap the signer before creating the SDK context: `signer = Validate(signer, walletAddress)`.

{% endtab %}
{% tab title="Rust" %}

```rust
use serde_json::Value;
use zama_sdk::{
    Address, B256, CancellationToken, ContractWriteRequest, SdkError, Signer, SigningRequest, U256,
    async_trait,
};

/// Wraps a signer and rejects any request the SDK would not make.
pub struct Validating<S> {
    pub inner: S,
    pub wallet: Address,
    // Values from your own configuration, never from the request.
    pub chain_id: u64,
    pub decryption: Address,
    pub acl: Address,
}

const SELECTORS: [[u8; 4]; 2] = [
    [0x04, 0xf6, 0x1a, 0x95], // delegateForUserDecryption(address,address,uint64)
    [0x66, 0x9e, 0x63, 0x16], // revokeDelegationForUserDecryption(address,address)
];

impl<S> Validating<S> {
    fn check_typed_data(&self, typed: &Value) -> Result<(), &'static str> {
        let domain = &typed["domain"];
        if domain["name"] != "Decryption" || domain["version"] != "1" {
            return Err("unexpected EIP-712 domain");
        }
        let chain_id = match &domain["chainId"] {
            Value::String(text) => text.parse().ok(),
            number => number.as_u64(),
        };
        if chain_id != Some(self.chain_id) {
            return Err("unexpected chain ID");
        }
        let verifying = domain["verifyingContract"]
            .as_str()
            .map(str::parse::<Address>);
        if !matches!(verifying, Some(Ok(address)) if address == self.decryption) {
            return Err("unexpected verifying contract");
        }
        let request_type = typed["primaryType"].as_str();
        if !matches!(
            request_type,
            Some("UserDecryptRequestVerification" | "DelegatedUserDecryptRequestVerification")
        ) {
            return Err("unexpected request type");
        }
        if let Some(user) = typed["message"]["userAddress"].as_str()
            && user.parse::<Address>().ok() != Some(self.wallet)
        {
            return Err("permit names another user");
        }
        Ok(())
    }

    fn check_write(&self, request: &ContractWriteRequest) -> Result<(), &'static str> {
        let selector = request.data.get(..4);
        if request.address != self.acl || !SELECTORS.iter().any(|known| selector == Some(known)) {
            return Err("unexpected contract call");
        }
        if request.value.is_some_and(|value| value != U256::ZERO) {
            return Err("unexpected value transfer");
        }
        Ok(())
    }
}

#[async_trait]
impl<S: Signer> Signer for Validating<S> {
    async fn sign_typed_data(&self, request: SigningRequest) -> Result<Vec<u8>, SdkError> {
        self.check_typed_data(&request.typed_data)
            .map_err(SdkError::signing_rejected)?;
        self.inner.sign_typed_data(request).await
    }

    async fn write_contract(
        &self,
        request: ContractWriteRequest,
        cancel: CancellationToken,
    ) -> Result<B256, SdkError> {
        self.check_write(&request)
            .map_err(SdkError::signing_rejected)?;
        self.inner.write_contract(request, cancel).await
    }
}
```

Add `serde_json` to your dependencies, then pass `Validating { inner: wallet, .. }` to `.signer(...)` instead of `wallet`.

{% endtab %}
{% endtabs %}

## Submit SDK transactions

Call the SDK operation, such as `DelegateDecryption` in Go or `sdk.delegations().delegate_decryption` in Rust. The daemon sends the encoded contract call to your wallet, the wallet signs and broadcasts it, and the SDK waits for the receipt. The operation returns the transaction hash and receipt logs. Nothing resubmits the transaction if the receipt lookup fails.

For a custom wallet:

- Check the requested account and chain.
- Check typed data against the [expected values](#validate-signing-requests) before signing it.
- Allow only known destinations and function selectors, and reject any other contract call. Today that is the ACL contract's delegation functions.
- Broadcast the call data unchanged, with the requested destination, value, and gas limit. Omitted gas means estimate it.
- Use the ABI, method, and arguments for wallet display. Integer arguments arrive as decimal strings.
- Supply fees and nonces from your wallet.
- Return the broadcast hash once. Never replay a wallet action or resubmit a write automatically.

Wallet callbacks can run concurrently. Each built-in adapter instance sends one write at a time, so its concurrent writes do not reuse a nonce, and a stalled broadcast delays the next write by up to the broadcast timeout. A custom wallet must coordinate nonces across concurrent writes itself.

Report a rejection or failure as an SDK error. Report a revert detected before broadcast with Go `ExecutionRevertError` or Rust `SdkError::execution_reverted`; the operation then fails with `TRANSACTION_REVERTED`.

If a write ends without a clear result, follow [Resolve uncertain transaction outcomes](uncertain-transaction-outcomes.md).
