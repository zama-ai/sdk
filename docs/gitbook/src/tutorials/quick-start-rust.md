---
title: Quick start (Rust)
description: Decrypt a confidential value from a native Rust application, through the SDK sidecar.
---

# Quick start (Rust)

{% hint style="warning" %}
**Prototype status.** The Rust client and the sidecar it talks to are an early prototype, not a released product. There is no published crate on crates.io and no published Docker image yet — you build both from a checkout of the [`zama-ai/sdk`](https://github.com/zama-ai/sdk) repository. The API described here can change. See the [sidecar trust boundary](../../../../packages/sdk-sidecar/SECURITY.md) before using it with anything beyond a test wallet.
{% endhint %}

Rust doesn't run the SDK directly. Instead, a small server called the **sidecar** runs `@zama-fhe/sdk` inside a Node.js process, and your Rust application talks to it over a private local socket. Your wallet's private key stays in your Rust application; encrypted values and decryption happen inside the sidecar. This guide gets you from a running sidecar to a decrypted confidential balance.

## Prerequisites

- Docker and Docker Compose
- Rust 1.98+ and Cargo
- A Linux host, or Docker Desktop for local development only — Docker Desktop on macOS cannot share a Unix socket between a container and a native host process, so on macOS the Rust side also needs to run in a container
- A Sepolia RPC URL and a **test wallet** with a small amount of Sepolia ETH (never use a wallet holding real funds)

## 1. Start the sidecar

Clone the repository and start the sidecar with Docker Compose. This is the only way to run it today — there's no standalone image to pull yet.

```sh
git clone https://github.com/zama-ai/sdk.git
cd sdk
pnpm install
cp -n .env.sidecar.example .env.sidecar.local
chmod 600 .env.sidecar.local
```

Fill in `.env.sidecar.local` with your Sepolia RPC URL, wallet address and test wallet private key. Leave `RELAYER_API_KEY` empty to use the public Sepolia relayer.

```sh
export SIDECAR_UID="$(id -u)"
export SIDECAR_GID="$(id -g)"

docker compose --env-file .env.sidecar.local \
  -f packages/sdk-sidecar/compose.yaml up --wait sidecar
```

Check that it started:

```sh
docker compose -f packages/sdk-sidecar/compose.yaml ps
```

{% hint style="info" %}
The sidecar has no process-wide chain or wallet. Every Rust `Client` you connect creates its own SDK context with its own chain configuration and signer, so one running sidecar can serve multiple applications.
{% endhint %}

## 2. Add the client to your project

The Rust client isn't published, so pull it in as a Git dependency and pin it to match the versions the sidecar was generated against:

```toml
[dependencies]
zama-sdk-sidecar = { git = "https://github.com/zama-ai/sdk.git", features = ["alloy"] }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
alloy-signer-local = { version = "=1.8.3", default-features = false, features = ["zeroize"] }
```

The `alloy` feature pulls in an [Alloy](https://alloy.rs/) signer adapter, which handles the EIP-712 signing the SDK needs for private decryption. You can implement the `Signer` trait yourself instead if your application already has its own wallet integration.

## 3. Connect and decrypt a value

```rust
use alloy_signer_local::PrivateKeySigner;
use anyhow::Result;
use std::str::FromStr;
use zama_sdk_sidecar::{
    Address, ApplicationStorage, B256, ChainConfig, ClearValue, Client, EncryptedInput,
    MemoryStorage, SdkConfig, WalletAccount, alloy::AlloySigner,
};

#[tokio::main]
async fn main() -> Result<()> {
    // A test wallet — never a wallet holding real funds.
    let signer: PrivateKeySigner = "0xYOUR_TEST_WALLET_PRIVATE_KEY".parse()?;
    let account = WalletAccount {
        address: signer.address(),
        chain_id: 11_155_111, // Sepolia
    };

    let config = SdkConfig::from_chains(
        account.chain_id,
        vec![ChainConfig::new(account.chain_id, "https://your-sepolia-rpc.example")],
    );

    let sdk = Client::connect("/tmp/zama-sdk-sidecar.sock")
        .await?
        .sdk(config)
        .signer(Some(account), AlloySigner::new(signer))
        .storage(ApplicationStorage::new(MemoryStorage::default()))
        .build()
        .await?;

    // The ciphertext handle for the value you want to decrypt, read from your
    // contract however you already read on-chain data (Alloy, ethers-rs, ...).
    let encrypted: B256 = B256::from_str("0xYOUR_ENCRYPTED_HANDLE")?;
    let token: Address = "0xYourConfidentialToken".parse()?;

    let result = sdk
        .decryption()
        .decrypt_values(
            &[EncryptedInput {
                encrypted_value: encrypted,
                contract_address: token,
            }],
            None,
        )
        .await;

    let closed = sdk.close().await;
    let values = result?;
    closed?;

    match values.get(&encrypted) {
        Some(ClearValue::BigInt(balance)) => println!("Decrypted balance: {balance}"),
        _ => anyhow::bail!("unexpected decrypted value type"),
    }
    Ok(())
}
```

The first call to `decrypt_values` for a given account prompts an EIP-712 wallet signature over the sidecar's signer channel — the SDK caches the resulting permit in whichever storage backend you configured, so later calls don't re-prompt.

{% hint style="info" %}
**Storage.** The example above uses in-memory storage, which is lost when your process exits. To keep credentials across restarts, either point the sidecar at its own SQLite volume (`PersistentStorage("your-app")`) or supply your own backend by implementing `NativeStorage` — for example, to store the opaque credential bytes in your own database. See [Choose credential storage](https://github.com/zama-ai/sdk/blob/main/packages/sdk-sidecar/README.md#choose-credential-storage) for the options.
{% endhint %}

## Next steps

- [Full sidecar README](https://github.com/zama-ai/sdk/blob/main/packages/sdk-sidecar/README.md) — storage choices, transport limits, reconnection, and the development/test workflow
- [Sidecar trust boundary](https://github.com/zama-ai/sdk/blob/main/packages/sdk-sidecar/SECURITY.md) — what the sidecar can see, and what it can't
- [Wire contract](https://github.com/zama-ai/sdk/blob/main/proto/README.md) — every supported RPC and the SDK method it maps to
- [Rust balance example](https://github.com/zama-ai/sdk/blob/main/clients/rust/examples/balance/main.rs) — a complete, runnable version of this guide that reads a real ERC-7984 confidential balance
- [Security model](../concepts/security-model.md) — the cryptography and trust assumptions behind decryption in the TypeScript SDK that the sidecar wraps
