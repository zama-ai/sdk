---
description: Encrypt a first confidential contract input from Go with the Zama SDK daemon.
---

# Go quick start

{% hint style="warning" %}
The daemon and its Go and Rust clients are experimental. The wire protocol can change between minor versions, so upgrade the daemon image and the clients together.
{% endhint %}

We'll encrypt `1000` as an `euint64` for a confidential contract on Sepolia and print the encrypted value and the size of its input proof. You don't sign or broadcast anything.

The Go client talks to a local SDK daemon over a private Unix socket. The daemon runs the Zama SDK, so your application stays in Go.

You need Go 1.25 or later, Docker Compose on Linux or Docker Desktop, a Sepolia RPC URL, the address of your confidential contract, and the address of the user who will submit the input.

## Authentication

The Sepolia testnet relayer needs no API key, so this quick start leaves authentication unset. The Zama-hosted mainnet relayer requires a key. When you move to mainnet, set it on the SDK configuration:

```go
config := zama.NewSDKConfig(1, rpcURL)
config.Auth = zama.APIKeyHeader{Value: os.Getenv("RELAYER_API_KEY")}
```

See [Authentication](../../guides/authentication.md) and [Relayer API keys](../../guides/relayer-api-keys.md) to get a key and keep it out of your logs.

## Install

Create a module and add the client:

```sh
export ZAMA_SDK_VERSION=3.7.0-beta.7
mkdir encrypt-input
cd encrypt-input
go mod init example.com/encrypt-input
go get github.com/zama-ai/sdk/clients/go/v3@v$ZAMA_SDK_VERSION
```

`ZAMA_SDK_VERSION` pins the client here and the daemon image that Compose starts later: both must run the same version. See [Client and daemon compatibility](../reference/client-and-daemon-compatibility.md).

## Set up the SDK

Download the daemon's [Compose file](../operations/run-in-production.md#run-with-docker-compose):

```sh
curl -fsSL -o zama-sdk-daemon.yaml "https://raw.githubusercontent.com/zama-ai/sdk/v${ZAMA_SDK_VERSION}/packages/sdk-daemon/deploy/compose.yaml"
```

Save this as `compose.yaml`. It runs your program in a Go container next to the daemon. Both run as UID 10000 and GID 10001, the daemon image's user, and share the daemon's socket volume:

```yaml
include:
  - zama-sdk-daemon.yaml

services:
  app:
    image: golang:1.25
    user: "10000:10001"
    working_dir: /src
    environment:
      - DAEMON_SOCKET=/run/zama/sdk.sock
      - GOCACHE=/tmp/go-cache
      - GOMODCACHE=/tmp/go-mod
      - SEPOLIA_RPC_URL
      - CONTRACT_ADDRESS
      - USER_ADDRESS
    volumes:
      - .:/src:ro
      - socket:/run/zama:ro
    depends_on:
      daemon:
        condition: service_healthy
    command: ["go", "run", "."]
```

The daemon needs outbound access to your RPC endpoint and to the Sepolia relayer. Your application connects with `zama.Dial` and creates an SDK context from a chain configuration. The SDK context lives in the daemon until you close it.

## Your first encrypted input

Save this file as `main.go`:

```go
package main

import (
	"context"
	"fmt"
	"math/big"
	"os"
	"time"

	"github.com/ethereum/go-ethereum/common"
	zama "github.com/zama-ai/sdk/clients/go/v3"
)

func run() error {
	socket := os.Getenv("DAEMON_SOCKET")
	rpcURL := os.Getenv("SEPOLIA_RPC_URL")
	contract := os.Getenv("CONTRACT_ADDRESS")
	user := os.Getenv("USER_ADDRESS")
	if socket == "" || rpcURL == "" || !common.IsHexAddress(contract) || !common.IsHexAddress(user) {
		return fmt.Errorf("set DAEMON_SOCKET, SEPOLIA_RPC_URL, CONTRACT_ADDRESS and USER_ADDRESS")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	client, err := zama.Dial(socket)
	if err != nil {
		return err
	}
	defer client.Close()

	sdk, err := client.CreateContext(ctx, zama.NewSDKConfig(11155111, rpcURL), zama.SignerConfig{})
	if err != nil {
		return err
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := sdk.Close(cleanup); err != nil {
			fmt.Fprintln(os.Stderr, "close SDK context:", err)
		}
	}()

	result, err := sdk.Encrypt(ctx, zama.EncryptParams{
		Values:          []zama.EncryptInput{zama.Euint64(big.NewInt(1000))},
		ContractAddress: common.HexToAddress(contract),
		UserAddress:     common.HexToAddress(user),
	}, zama.EncryptOptions{})
	if err != nil {
		return err
	}

	fmt.Println("Encrypted value:", result.EncryptedValues[0].Hex())
	fmt.Printf("Input proof: %d bytes\n", len(result.InputProof))
	return nil
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
```

Set your values and run it:

```sh
export SEPOLIA_RPC_URL=https://your-sepolia-rpc.example
export CONTRACT_ADDRESS=0xYourConfidentialContract
export USER_ADDRESS=0xYourUserAddress
go mod tidy
docker compose run --rm app
```

`docker compose run` starts the daemon, waits for its healthcheck, then runs the program. It prints one encrypted value and a nonzero proof size. Pass both to your confidential contract call. They change on every run.

When you're done, stop the daemon. Add `-v` to also delete its volumes, including stored credentials:

```sh
docker compose down
```

## Next steps

- [Configuration](../../guides/configuration.md) -- chains, relayers, provider options, storage, and the daemon connection
- [Encrypt & decrypt](../../guides/encrypt-decrypt.md) -- submit encrypted inputs and decrypt contract results
- [Attach a wallet](../guides/attach-wallet.md) -- signatures for private decryption and transaction writes
- [Go client API](../reference/go-client.md) -- generated package reference
- [Deploy in production](../operations/run-in-production.md) -- run the daemon on your infrastructure
