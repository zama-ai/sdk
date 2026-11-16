package zama

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	pb "github.com/zama-ai/sdk/clients/go/v3/internal/gen/zama/sdk/v1beta1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type flakyCloseServer struct {
	*storageServer
	failures []error
	closes   atomic.Int32
}

func (s *flakyCloseServer) CloseContext(ctx context.Context, r *pb.ContextRequest) (*pb.CloseContextResponse, error) {
	call := int(s.closes.Add(1)) - 1
	if call < len(s.failures) {
		return nil, s.failures[call]
	}
	return s.storageServer.CloseContext(ctx, r)
}

func waitStorageChannelClosed(t *testing.T, sdk *SDKContext) {
	t.Helper()
	sdk.mu.Lock()
	channel := sdk.storage
	sdk.mu.Unlock()
	select {
	case <-channel.done:
	case <-time.After(2 * time.Second):
		t.Fatal("storage channel stayed open")
	}
}

func closeTestContext(t *testing.T, server *flakyCloseServer) *SDKContext {
	t.Helper()
	client := testClient(t, server, nil)
	sdk, err := client.CreateContext(testContext(t), SDKConfig{Storage: ApplicationStorage(NewMemoryStorage())}, SignerConfig{})
	if err != nil {
		t.Fatal(err)
	}
	return sdk
}

func TestCloseKeepsContextAfterTransientFailure(t *testing.T) {
	server := &flakyCloseServer{storageServer: newStorageServer(), failures: []error{status.Error(codes.Unavailable, "daemon busy")}}
	sdk := closeTestContext(t, server)
	if err := sdk.Close(testContext(t)); status.Code(err) != codes.Unavailable {
		t.Fatalf("transient close error = %v", err)
	}
	storeRequest(t, server.storageServer, sdk, pb.StorageMethod_STORAGE_METHOD_SET, "key", []byte{1})
	if err := sdk.Close(testContext(t)); err != nil {
		t.Fatal(err)
	}
	waitStorageChannelClosed(t, sdk)
	if got := server.closes.Load(); got != 2 {
		t.Fatalf("close RPCs = %d", got)
	}
}

func TestCloseTearsDownLostContextOnce(t *testing.T) {
	server := &flakyCloseServer{storageServer: newStorageServer(), failures: []error{status.Error(codes.NotFound, "context not found")}}
	sdk := closeTestContext(t, server)
	if err := sdk.Close(testContext(t)); status.Code(err) != codes.NotFound {
		t.Fatalf("lost context close error = %v", err)
	}
	waitStorageChannelClosed(t, sdk)
	if err := sdk.Close(testContext(t)); err != nil {
		t.Fatalf("second close = %v", err)
	}
	if got := server.closes.Load(); got != 1 {
		t.Fatalf("close RPCs = %d", got)
	}
}

func TestConcurrentClosesSendOneRequest(t *testing.T) {
	server := &flakyCloseServer{storageServer: newStorageServer()}
	sdk := closeTestContext(t, server)
	errs := make(chan error, 2)
	for range 2 {
		go func() { errs <- sdk.Close(testContext(t)) }()
	}
	for range 2 {
		if err := <-errs; err != nil {
			t.Fatalf("concurrent close = %v", err)
		}
	}
	if got := server.closes.Load(); got != 1 {
		t.Fatalf("close RPCs = %d", got)
	}
}
