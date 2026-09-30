---
description: Encrypt a first confidential contract input from Rust with the Zama SDK daemon.
---

# Rust quick start

{% hint style="warning" %}
The daemon and its Go and Rust clients are experimental. The wire protocol can change between minor versions, so upgrade the daemon image and the clients together.
{% endhint %}

We'll encrypt `1000` as an `euint64` for a confidential contract on Sepolia and print the encrypted value and the size of its input proof. You don't sign or broadcast anything.

The Rust client talks to a local SDK daemon over a private Unix socket. The daemon runs the Zama SDK, so your application stays in Rust.

You need Rust 1.94.1 or later, a Linux host with Docker, a Sepolia RPC URL, the address of your confidential contract, and the address of the user who will submit the input. On Docker Desktop, run your application in a container that shares a socket volume with the daemon; see [Deploy in production](../operations/run-in-production.md).

## Authentication

The Sepolia testnet relayer needs no API key, so this quick start leaves authentication unset. The Zama-hosted mainnet relayer requires a key. When you move to mainnet, set it on the chain configuration:

```rust
let chain = ChainConfig::new(1, rpc_url).with_auth(RelayerAuth::api_key(env::var("RELAYER_API_KEY")?));
let config = SdkConfig::from_chains(1, vec![chain]);
```

See [Authentication](../../guides/authentication.md) and [Relayer API keys](../../guides/relayer-api-keys.md) to get a key and keep it out of your logs.

## Install

Create a binary project and add the client with the runtime this example uses:

```sh
cargo new encrypt-input
cd encrypt-input
cargo add zama_sdk
cargo add anyhow
cargo add tokio --features macros,rt
```

The client runs on Tokio. You can use your application's existing runtime and error type instead of `#[tokio::main]` and `anyhow`.

The client and the daemon image must run the same version; see [Client and daemon compatibility](../reference/client-and-daemon-compatibility.md).

## Set up the SDK

Start the daemon as your own UID, with a private socket directory that your application can reach:

```sh
export ZAMA_DAEMON_SOCKET_DIR="${PWD}/zama-daemon-socket"
mkdir -p "$ZAMA_DAEMON_SOCKET_DIR"
chmod 700 "$ZAMA_DAEMON_SOCKET_DIR"
docker run -d --name zama-daemon \
  --user "$(id -u):$(id -g)" \
  --env ZAMA_SDK_DAEMON_SOCKET_PATH=/run/zama/sdk.sock \
  --mount "type=bind,src=$ZAMA_DAEMON_SOCKET_DIR,dst=/run/zama" \
  zamafhe/sdk-daemon
export DAEMON_SOCKET="$ZAMA_DAEMON_SOCKET_DIR/sdk.sock"
docker logs zama-daemon
```

Continue once the log shows `Daemon ready.`. The daemon needs outbound access to your RPC endpoint and to the Sepolia relayer.

Your application connects with `Client::connect` and builds an `Sdk` from a chain configuration. The SDK context lives in the daemon until you close it.

## Your first encrypted input

Replace `src/main.rs` with:

```rust
use anyhow::Result;
use std::{env, time::Duration};
use zama_sdk::{Address, Client, EncryptInput, EncryptOptions, EncryptParams, SdkConfig};

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<()> {
    let socket = env::var("DAEMON_SOCKET")?;
    let rpc_url = env::var("SEPOLIA_RPC_URL")?;
    let contract_address: Address = env::var("CONTRACT_ADDRESS")?.parse()?;
    let user_address: Address = env::var("USER_ADDRESS")?.parse()?;

    let client = Client::connect(socket)
        .await?
        .with_timeout(Duration::from_secs(120));
    let sdk = client.sdk(SdkConfig::new(11155111, rpc_url)).build().await?;

    let inputs = [EncryptInput::Uint64(1000.into())];
    let result = sdk
        .encrypt(
            EncryptParams {
                values: &inputs,
                contract_address,
                user_address,
            },
            EncryptOptions::default(),
        )
        .await;
    let closed = sdk.close().await;
    let encrypted = result?;
    closed?;

    println!("Encrypted value: {}", encrypted.encrypted_values[0]);
    println!("Input proof: {} bytes", encrypted.input_proof.len());
    Ok(())
}
```

Set your values and run it from the same shell, so `DAEMON_SOCKET` is still set:

```sh
export SEPOLIA_RPC_URL=https://your-sepolia-rpc.example
export CONTRACT_ADDRESS=0xYourConfidentialContract
export USER_ADDRESS=0xYourUserAddress
cargo run
```

The program prints one encrypted value and a nonzero proof size. Pass both to your confidential contract call. They change on every run.

When you're done, stop the daemon and remove the socket directory:

```sh
docker stop zama-daemon
docker rm zama-daemon
rmdir "$ZAMA_DAEMON_SOCKET_DIR"
```

## Next steps

- [Configuration](../../guides/configuration.md) -- chains, relayers, provider options, storage, and the daemon connection
- [Encrypt & decrypt](../../guides/encrypt-decrypt.md) -- submit encrypted inputs and decrypt contract results
- [Attach a wallet](../guides/attach-wallet.md) -- signatures for private decryption and transaction writes
- [Rust client API](../reference/rust-client.md) -- generated crate reference
- [Deploy in production](../operations/run-in-production.md) -- run the daemon on your infrastructure
