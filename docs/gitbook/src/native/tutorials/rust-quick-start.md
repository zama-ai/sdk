---
description: Encrypt a first confidential contract input from Rust with the Zama SDK daemon.
---

# Rust quick start

{% hint style="warning" %}
The daemon and its Go and Rust clients are experimental. The wire protocol can change between minor versions, so upgrade the daemon image and the clients together.
{% endhint %}

We'll encrypt `1000` as an `euint64` for a confidential contract on Sepolia and print the encrypted value and the size of its input proof. You don't sign or broadcast anything.

The Rust client talks to a local SDK daemon over a private Unix socket. The daemon runs the Zama SDK, so your application stays in Rust.

You need Rust 1.94.1 or later, Docker Compose on Linux or Docker Desktop, a Sepolia RPC URL, the address of your confidential contract, and the address of the user who will submit the input.

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
export ZAMA_SDK_VERSION=3.7.0-beta.7
cargo new encrypt-input
cd encrypt-input
cargo add zama_sdk@=$ZAMA_SDK_VERSION
cargo add anyhow
cargo add tokio --features macros,rt
```

The client runs on Tokio. You can use your application's existing runtime and error type instead of `#[tokio::main]` and `anyhow`.

`ZAMA_SDK_VERSION` pins the client here and the daemon image that Compose starts later: both must run the same version. See [Client and daemon compatibility](../reference/client-and-daemon-compatibility.md).

## Set up the SDK

Download the daemon's [Compose file](../operations/run-in-production.md#run-with-docker-compose):

```sh
curl -fsSL -o zama-sdk-daemon.yaml "https://raw.githubusercontent.com/zama-ai/sdk/v${ZAMA_SDK_VERSION}/packages/sdk-daemon/deploy/compose.yaml"
```

Save this as `compose.yaml`. It runs your program in a Rust container next to the daemon. Both run as UID 10000 and GID 10001, the daemon image's user, and share the daemon's socket volume:

```yaml
include:
  - zama-sdk-daemon.yaml

services:
  app:
    image: rust:1.94.1
    user: "10000:10001"
    working_dir: /src
    environment:
      - DAEMON_SOCKET=/run/zama/sdk.sock
      - CARGO_HOME=/tmp/cargo
      - CARGO_TARGET_DIR=/tmp/target
      - SEPOLIA_RPC_URL
      - CONTRACT_ADDRESS
      - USER_ADDRESS
    volumes:
      - .:/src:ro
      - socket:/run/zama:ro
    depends_on:
      daemon:
        condition: service_healthy
    command: ["cargo", "run", "--locked"]
```

The daemon needs outbound access to your RPC endpoint and to the Sepolia relayer. Your application connects with `Client::connect` and builds an `Sdk` from a chain configuration. The SDK context lives in the daemon until you close it.

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

Set your values and run it:

```sh
export SEPOLIA_RPC_URL=https://your-sepolia-rpc.example
export CONTRACT_ADDRESS=0xYourConfidentialContract
export USER_ADDRESS=0xYourUserAddress
cargo generate-lockfile
docker compose run --rm app
```

`docker compose run` starts the daemon, waits for its healthcheck, then runs the program. Each run builds the program in a fresh container, so it takes a few minutes. It prints one encrypted value and a nonzero proof size. Pass both to your confidential contract call. They change on every run.

When you're done, stop the daemon. Add `-v` to also delete its volumes, including stored credentials:

```sh
docker compose down
```

## Next steps

- [Configuration](../../guides/configuration.md) -- chains, relayers, provider options, storage, and the daemon connection
- [Encrypt & decrypt](../../guides/encrypt-decrypt.md) -- submit encrypted inputs and decrypt contract results
- [Attach a wallet](../guides/attach-wallet.md) -- signatures for private decryption and transaction writes
- [Rust client API](../reference/rust-client.md) -- generated crate reference
- [Deploy in production](../operations/run-in-production.md) -- run the daemon on your infrastructure
