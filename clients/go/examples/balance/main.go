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

	subscription, err := subscribeEvents(ctx, sdk, os.Stderr)
	if err != nil {
		return err
	}
	defer subscription.Close()
	monitorCtx, stopMonitor := context.WithCancel(ctx)
	defer stopMonitor()
	go func() {
		if err := sdk.WaitChannelFailure(monitorCtx, sidecar.EventChannel); err != nil && monitorCtx.Err() == nil {
			fmt.Fprintln(os.Stderr, "SDK event channel failed; event notifications may be incomplete")
		}
	}()

	if err := encryptInputs(ctx, sdk, config.token, config.owner); err != nil {
		return err
	}
	if err := showBalance(ctx, provider, sdk, config.token, config.owner, os.Stdout); err != nil {
		return err
	}
	if err := prepareOffline(ctx, sdk, config.token, config.owner, config.privateKey); err != nil {
		return err
	}
	return manageDelegation(ctx, sdk, provider, config.token, config.owner, config.delegate)
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
