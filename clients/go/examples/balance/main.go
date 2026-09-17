package main

import (
	"context"
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
	sdkConfig, err := config.sdkConfig()
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
	sdk, err := client.CreateContext(ctx, sdkConfig, signer)
	if err != nil {
		return err
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		sdk.Close(cleanup)
	}()

	if err := encryptInputs(ctx, sdk, config.token, config.owner); err != nil {
		return err
	}

	return showBalance(ctx, provider, sdk, config.token, config.owner)
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
