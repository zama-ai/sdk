package sidecar

import (
	"context"
	"os"
	"testing"
	"time"
)

func TestEventResubscribeAcrossRealSidecar(t *testing.T) {
	socket := os.Getenv("SIDECAR_EVENT_RESUBSCRIBE_SOCKET")
	if socket == "" {
		t.Skip("set SIDECAR_EVENT_RESUBSCRIBE_SOCKET with the SDK fixture harness")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	client, err := Dial(socket)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	sdk, err := client.CreateContext(ctx, NewSDKConfig(31337, "http://localhost"), SignerConfig{})
	if err != nil {
		t.Fatal(err)
	}
	defer sdk.Close(ctx)

	subscription, err := sdk.SubscribeEvents(ctx, EventHandlers{})
	if err != nil {
		t.Fatal(err)
	}
	for range 8 {
		subscription.Close()
		subscription, err = sdk.SubscribeEvents(ctx, EventHandlers{})
		if err != nil {
			t.Fatalf("immediate resubscription failed: %v", err)
		}
	}
	subscription.Close()
}
