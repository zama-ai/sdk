package main

import (
	"context"
	"fmt"
	"io"

	sidecar "github.com/zama-ai/sdk/clients/go"
)

func subscribeEvents(ctx context.Context, sdk *sidecar.SDKContext, output io.Writer) (*sidecar.EventSubscription, error) {
	return sdk.SubscribeEvents(ctx, sidecar.EventHandlers{
		OnEvent: func(_ context.Context, correlation sidecar.EventCorrelation, event sidecar.SDKEvent) error {
			_, err := fmt.Fprintf(output, "SDK event: %s (operation %s)\n", event.Kind, correlation.OperationID)
			return err
		},
		OnWalletAccountChanged: func(_ context.Context, _ sidecar.EventCorrelation, _ sidecar.WalletAccountChanged) error {
			_, err := fmt.Fprintln(output, "SDK wallet account changed")
			return err
		},
		OnProgress: func(_ context.Context, _ sidecar.EventCorrelation, progress sidecar.OperationProgress) error {
			_, err := fmt.Fprintf(output, "SDK progress: %d\n", progress.Kind)
			return err
		},
	})
}
