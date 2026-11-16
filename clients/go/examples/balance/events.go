package main

import (
	"context"
	"fmt"
	"io"

	"github.com/zama-ai/sdk/clients/go/v3"
)

func subscribeEvents(ctx context.Context, sdk *zama.SDKContext, output io.Writer) (*zama.EventSubscription, error) {
	return sdk.SubscribeEvents(ctx, zama.EventHandlers{
		OnEvent: func(_ context.Context, correlation zama.EventCorrelation, event zama.SDKEvent) error {
			_, err := fmt.Fprintf(output, "SDK event: %s (operation %s)\n", event.Kind, correlation.OperationID)
			return err
		},
		OnWalletAccountChanged: func(_ context.Context, _ zama.EventCorrelation, _ zama.WalletAccountChanged) error {
			_, err := fmt.Fprintln(output, "SDK wallet account changed")
			return err
		},
		OnProgress: func(_ context.Context, _ zama.EventCorrelation, progress zama.OperationProgress) error {
			_, err := fmt.Fprintf(output, "SDK progress: %s\n", progress.Kind)
			return err
		},
	})
}
