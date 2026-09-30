---
description: Encrypt a first confidential contract input from Go with the Zama SDK daemon.
---

# Go quick start

{% hint style="warning" %}
The daemon and its Go and Rust clients are experimental. The wire protocol can change between minor versions, so upgrade the daemon image and the clients together.
{% endhint %}

We'll encrypt `1000` as an `euint64` for a confidential contract on Sepolia and print the encrypted value and the size of its input proof. You don't sign or broadcast anything.

The Go client talks to a local SDK daemon over a private Unix socket. The daemon runs the Zama SDK, so your application stays in Go.

You need Go 1.25 or later, a Linux host with Docker, a Sepolia RPC URL, the address of your confidential contract, and the address of the user who will submit the input. On Docker Desktop, run your application in a container that shares a socket volume with the daemon; see [Deploy in production](../operations/run-in-production.md).

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
mkdir encrypt-input
cd encrypt-input
go mod init example.com/encrypt-input
go get github.com/zama-ai/sdk/clients/go/v3
```

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

Your application connects with `zama.Dial` and creates an SDK context from a chain configuration. The context lives in the daemon until you close it.

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

Set your values and run it from the same shell, so `DAEMON_SOCKET` is still set:

```sh
export SEPOLIA_RPC_URL=https://your-sepolia-rpc.example
export CONTRACT_ADDRESS=0xYourConfidentialContract
export USER_ADDRESS=0xYourUserAddress
go mod tidy
go run .
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
- [Go client API](../reference/go-client.md) -- generated package reference
- [Deploy in production](../operations/run-in-production.md) -- run the daemon on your infrastructure
