package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"time"

	sidecar "github.com/zama-ai/sdk/clients/go"
)

func run() error {
	config, err := loadConfig(os.Args[1:])
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	provider, signer, err := connectEthereum(ctx, config)
	if err != nil {
		return err
	}
	defer provider.Close()
	client, err := sidecar.Dial(config.socket)
	if err != nil {
		return err
	}
	defer client.Close()
	sdkConfig := sidecar.NewSDKConfig(sepoliaChainID, config.rpcURL)
	sdkConfig.Storage = sidecar.ApplicationStorage(sidecar.NewMemoryStorage())
	if config.relayerAPIKey != "" {
		sdkConfig.Auth = sidecar.APIKeyHeader{Value: config.relayerAPIKey}
	}
	sdk, err := client.CreateContext(ctx, sdkConfig, signer)
	if err != nil {
		return err
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		sdk.Close(cleanup)
	}()

	name, encrypted, err := readToken(ctx, provider, config.token, config.owner)
	if err != nil {
		return err
	}
	fmt.Printf("User Address: %s\n", config.owner.Hex())
	fmt.Printf("Token: %s (%s) https://eth-sepolia.blockscout.com/token/%s\n", name, config.token.Hex(), config.token.Hex())
	fmt.Printf("Encrypted balance: %s\n", encrypted.Hex())
	values, err := sdk.DecryptValues(ctx, []sidecar.EncryptedInput{{EncryptedValue: encrypted, ContractAddress: config.token}}, sidecar.DecryptOptions{})
	if err != nil {
		return err
	}
	balance, ok := values[encrypted]
	if !ok || balance.Kind != sidecar.ClearBigInt {
		return errors.New("decryption returned no integer balance")
	}
	fmt.Printf("Decrypted balance: %s\n", balance.Integer)
	return nil
}
func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
