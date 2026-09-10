package sidecar

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	pb "github.com/zama-ai/sdk/clients/go/gen/zama/sdk/v1alpha1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

func serveCallback[C, S any](stream grpc.BidiStreamingServer[C, S], outgoing <-chan *S, done <-chan struct{}, reply func(*C) error) error {
	incoming := make(chan *C)
	receiveError := make(chan error, 1)
	go func() {
		for {
			message, err := stream.Recv()
			if err != nil {
				receiveError <- err
				return
			}
			select {
			case incoming <- message:
			case <-stream.Context().Done():
				return
			}
		}
	}()
	for {
		select {
		case <-done:
			return status.Error(codes.Unavailable, "callback disconnected")
		case err := <-receiveError:
			return err
		case message := <-outgoing:
			if err := stream.Send(message); err != nil {
				return err
			}
		case message := <-incoming:
			if err := reply(message); err != nil {
				return err
			}
		}
	}
}

func waitFor(t *testing.T, condition func() bool) {
	t.Helper()
	until := time.Now().Add(time.Second)
	for !condition() {
		if time.Now().After(until) {
			t.Fatal("condition did not become true")
		}
		time.Sleep(time.Millisecond)
	}
}

func TestRPCErrorPreservesCallbackMetadata(t *testing.T) {
	cause := status.Error(codes.ResourceExhausted, "retry later")
	err := rpcError(cause, metadata.Pairs("zama-error-code", "RATE_LIMITED", "zama-error-retryable", "true", "zama-error-retry-after-seconds", "2.5"))
	wrapped := fmt.Errorf("storage: %w", err)
	var sdk *SDKError
	if !errors.As(wrapped, &sdk) || !errors.Is(wrapped, cause) {
		t.Fatal("lost error chain")
	}
	wire := callbackError(wrapped, "STORAGE_FAILED")
	if wire.Code != "RATE_LIMITED" || !wire.Retryable || wire.GetRetryAfterSeconds() != 2.5 {
		t.Fatalf("lost metadata: %v", wire)
	}
	if status.Code(err) != codes.ResourceExhausted {
		t.Fatal("lost gRPC status")
	}
}

func TestWaitChannelFailureAndReattach(t *testing.T) {
	server := newStorageServer()
	client := testClient(t, server, nil)
	sdk, err := client.CreateContext(testContext(t), SDKConfig{Storage: ApplicationStorage(NewMemoryStorage())}, SignerConfig{})
	if err != nil {
		t.Fatal(err)
	}
	server.disconnect(sdk.id)
	if err := sdk.WaitChannelFailure(testContext(t), StorageChannel); status.Code(err) != codes.Unavailable {
		t.Fatalf("failure: %v", err)
	}
	server.mu.Lock()
	server.sessions[sdk.id].done = make(chan struct{})
	server.mu.Unlock()
	if err := sdk.AttachStorage(testContext(t)); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := sdk.WaitChannelFailure(ctx, StorageChannel); !errors.Is(err, context.Canceled) {
		t.Fatalf("new connection failed: %v", err)
	}
}

func TestAttachCancellationIncludesStreamOpening(t *testing.T) {
	sdk := &SDKContext{}
	ctx, cancel := context.WithCancel(context.Background())
	opening := make(chan struct{})
	cancelled := make(chan struct{})
	result := make(chan error, 1)
	go func() {
		result <- attachChannel(ctx, sdk, StorageChannel, &sdk.storage,
			func(ctx context.Context) (grpc.BidiStreamingClient[int, int], error) {
				close(opening)
				<-ctx.Done()
				close(cancelled)
				return nil, ctx.Err()
			}, new(int), func(*int) bool { return true }, func(context.Context, *int, func(*int)) error { return nil })
	}()
	<-opening
	cancel()
	select {
	case err := <-result:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("unexpected error: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("attachment ignored cancellation")
	}
	select {
	case <-cancelled:
	case <-time.After(time.Second):
		t.Fatal("opening context was not cancelled")
	}
}

func TestStorageReplyRejections(t *testing.T) {
	for _, code := range []string{"STORAGE_REQUEST_NOT_FOUND", "STORAGE_DENIED"} {
		t.Run(code, func(t *testing.T) {
			server := newStorageServer()
			client := testClient(t, server, nil)
			sdk, err := client.CreateContext(testContext(t), SDKConfig{Storage: ApplicationStorage(NewMemoryStorage())}, SignerConfig{})
			if err != nil {
				t.Fatal(err)
			}
			server.mu.Lock()
			outgoing := server.sessions[sdk.id].out
			server.mu.Unlock()
			outgoing <- &pb.StorageServerMessage{Message: &pb.StorageServerMessage_ReplyError{ReplyError: &pb.StorageReplyError{RequestId: "stale", Error: &pb.SdkError{Code: code, Message: "rejected"}}}}
			if code == "STORAGE_REQUEST_NOT_FOUND" {
				storeRequest(t, server, sdk, pb.StorageMethod_STORAGE_METHOD_SET, "still attached", []byte{1})
			} else {
				var failure *SDKError
				if err := sdk.WaitChannelFailure(testContext(t), StorageChannel); !errors.As(err, &failure) || failure.Code != code {
					t.Fatalf("lost rejection: %v", err)
				}
			}
		})
	}
}
