package sidecar

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	pb "github.com/zama-ai/sdk/clients/go/gen/zama/sdk/v1alpha1"
	"google.golang.org/grpc"
)

func TestMemoryStorageCopiesAndPreservesPresence(t *testing.T) {
	store := NewMemoryStorage()
	ctx := testContext(t)
	if _, found, err := store.Get(ctx, "missing"); err != nil || found {
		t.Fatal("missing key changed")
	}
	if err := store.Set(ctx, "empty", nil); err != nil {
		t.Fatal(err)
	}
	if value, found, err := store.Get(ctx, "empty"); err != nil || !found || len(value) != 0 {
		t.Fatal("empty value became missing")
	}
	input := []byte{0, 255, 12}
	store.Set(ctx, "opaque", input)
	input[0] = 99
	value, _, _ := store.Get(ctx, "opaque")
	if value[0] != 0 {
		t.Fatal("store retained caller buffer")
	}
	value[0] = 88
	value, _, _ = store.Get(ctx, "opaque")
	if value[0] != 0 {
		t.Fatal("get exposed store buffer")
	}
	var group sync.WaitGroup
	for i := 0; i < 32; i++ {
		group.Add(1)
		go func() {
			defer group.Done()
			key := fmt.Sprint(i)
			store.Set(ctx, key, []byte{byte(i)})
			store.Get(ctx, key)
			store.Delete(ctx, key)
		}()
	}
	group.Wait()
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if err := store.Set(cancelled, "key", nil); !errors.Is(err, context.Canceled) {
		t.Fatal("cancelled write proceeded")
	}
}
func TestTypedConfigurationAndStorageChoices(t *testing.T) {
	requests := make(chan *pb.CreateContextRequest, 3)
	client := testClient(t, &pb.UnimplementedSidecarServiceServer{}, func(_ context.Context, request any, _ *grpc.UnaryServerInfo, _ grpc.UnaryHandler) (any, error) {
		requests <- request.(*pb.CreateContextRequest)
		return &pb.CreateContextResponse{ContextId: "config"}, nil
	})
	config := NewSDKConfig(11155111, "http://localhost")
	config.Auth = APIKeyHeader{Value: "example"}
	config.PermitTTL = number(0)
	if _, err := client.CreateContext(testContext(t), config, SignerConfig{}); err != nil {
		t.Fatal(err)
	}
	r := <-requests
	if r.Storage.GetMemory() == nil || r.PermitStorage != nil {
		t.Fatal("default storage choices changed")
	}
	var decoded map[string]any
	if err := json.Unmarshal([]byte(r.ConfigJson), &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded["permitTTL"] != float64(0) || decoded["chainId"] != float64(11155111) || decoded["auth"].(map[string]any)["__type"] != "ApiKeyHeader" {
		t.Fatal("typed SDK config changed")
	}
	config.Storage = PersistentStorage("credentials")
	permitStorage := SidecarMemoryStorage()
	config.PermitStorage = &permitStorage
	if _, err := client.CreateContext(testContext(t), config, SignerConfig{}); err != nil {
		t.Fatal(err)
	}
	r = <-requests
	if r.Storage.GetPersistent() != "credentials" || r.PermitStorage.GetMemory() == nil {
		t.Fatal("separate storage choice lost")
	}
}

type storageSession struct {
	binding string
	out     chan *pb.StorageServerMessage
	done    chan struct{}
	replies map[string]chan *pb.StorageReply
}
type storageServer struct {
	pb.UnimplementedSidecarServiceServer
	mu       sync.Mutex
	sessions map[string]*storageSession
	sequence atomic.Uint64
}

func newStorageServer() *storageServer {
	return &storageServer{sessions: make(map[string]*storageSession)}
}
func (s *storageServer) CreateContext(_ context.Context, r *pb.CreateContextRequest) (*pb.CreateContextResponse, error) {
	id := fmt.Sprint(s.sequence.Add(1))
	s.mu.Lock()
	s.sessions[id] = &storageSession{binding: r.Storage.GetApplication(), out: make(chan *pb.StorageServerMessage, 16), done: make(chan struct{}), replies: make(map[string]chan *pb.StorageReply)}
	s.mu.Unlock()
	return &pb.CreateContextResponse{ContextId: id}, nil
}
func (s *storageServer) CloseContext(_ context.Context, r *pb.ContextRequest) (*pb.Empty, error) {
	s.disconnect(r.ContextId)
	return &pb.Empty{}, nil
}
func (s *storageServer) disconnect(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	session := s.sessions[id]
	select {
	case <-session.done:
	default:
		close(session.done)
	}
}
func (s *storageServer) StorageChannel(stream grpc.BidiStreamingServer[pb.StorageClientMessage, pb.StorageServerMessage]) error {
	first, err := stream.Recv()
	if err != nil {
		return err
	}
	s.mu.Lock()
	session := s.sessions[first.GetAttach().ContextId]
	s.mu.Unlock()
	if err := stream.Send(&pb.StorageServerMessage{Message: &pb.StorageServerMessage_Attached{Attached: &pb.Empty{}}}); err != nil {
		return err
	}
	return serveCallback(stream, session.out, session.done, func(message *pb.StorageClientMessage) error {
		reply := message.GetReply()
		if reply == nil {
			return errors.New("missing reply")
		}
		s.mu.Lock()
		pending := session.replies[reply.RequestId]
		s.mu.Unlock()
		if pending != nil {
			pending <- reply
		}
		return nil
	})
}
func (s *storageServer) request(ctx context.Context, id string, method pb.StorageMethod, key string, value []byte) (*pb.StorageReply, error) {
	s.mu.Lock()
	session := s.sessions[id]
	requestID := fmt.Sprint(s.sequence.Add(1))
	result := make(chan *pb.StorageReply, 1)
	session.replies[requestID] = result
	s.mu.Unlock()
	defer func() { s.mu.Lock(); delete(session.replies, requestID); s.mu.Unlock() }()
	session.out <- &pb.StorageServerMessage{Message: &pb.StorageServerMessage_Action{Action: &pb.StorageAction{RequestId: requestID, BackendId: session.binding, Method: method, Key: key, Value: value}}}
	select {
	case reply := <-result:
		return reply, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-session.done:
		return nil, errors.New("storage disconnected")
	}
}
func storeRequest(t *testing.T, server *storageServer, sdk *SDKContext, method pb.StorageMethod, key string, value []byte) *pb.StorageReply {
	t.Helper()
	reply, err := server.request(testContext(t), sdk.id, method, key, value)
	if err != nil {
		t.Fatal(err)
	}
	if reply.Error != nil {
		t.Fatalf("storage callback failed: %v", reply.Error)
	}
	return reply
}
func TestApplicationStorageOpaqueWireAndNewSidecarContext(t *testing.T) {
	backend := NewMemoryStorage()
	choice := ApplicationStorage(backend)
	config := NewSDKConfig(11155111, "http://localhost")
	config.Storage = choice
	firstServer := newStorageServer()
	firstClient := testClient(t, firstServer, nil)
	first, err := firstClient.CreateContext(testContext(t), config, SignerConfig{})
	if err != nil {
		t.Fatal(err)
	}
	blob := []byte{1, 0, 255, 17, 0, 128}
	storeRequest(t, firstServer, first, pb.StorageMethod_STORAGE_METHOD_SET, "credential", blob)
	stored, found, _ := backend.Get(testContext(t), "credential")
	if !found || !bytes.Equal(stored, blob) {
		t.Fatal("opaque credential was not stored in native backend")
	}
	storeRequest(t, firstServer, first, pb.StorageMethod_STORAGE_METHOD_SET, "empty", nil)
	if value := storeRequest(t, firstServer, first, pb.StorageMethod_STORAGE_METHOD_GET, "empty", nil).Value; value == nil || len(value) != 0 {
		t.Fatal("empty lost protobuf presence")
	}
	if value := storeRequest(t, firstServer, first, pb.StorageMethod_STORAGE_METHOD_GET, "missing", nil).Value; value != nil {
		t.Fatal("missing became empty")
	}
	if err := first.Close(testContext(t)); err != nil {
		t.Fatal(err)
	}
	firstClient.Close()
	secondServer := newStorageServer()
	secondClient := testClient(t, secondServer, nil)
	second, err := secondClient.CreateContext(testContext(t), config, SignerConfig{})
	if err != nil {
		t.Fatal(err)
	}
	defer second.Close(testContext(t))
	if value := storeRequest(t, secondServer, second, pb.StorageMethod_STORAGE_METHOD_GET, "credential", nil).Value; !bytes.Equal(value, blob) {
		t.Fatal("native data lost when sidecar context was replaced")
	}
	storeRequest(t, secondServer, second, pb.StorageMethod_STORAGE_METHOD_DELETE, "credential", nil)
	if _, found, _ := backend.Get(testContext(t), "credential"); found {
		t.Fatal("native deletion not performed")
	}
}

type blockingStorage struct {
	Storage
	started   chan struct{}
	cancelled chan struct{}
}

func (s *blockingStorage) Get(ctx context.Context, key string) ([]byte, bool, error) {
	close(s.started)
	<-ctx.Done()
	close(s.cancelled)
	return nil, false, ctx.Err()
}
func TestStorageDisconnectCancelsNativeCallbackAndReattaches(t *testing.T) {
	backend := &blockingStorage{Storage: NewMemoryStorage(), started: make(chan struct{}), cancelled: make(chan struct{})}
	server := newStorageServer()
	client := testClient(t, server, nil)
	config := SDKConfig{Storage: ApplicationStorage(backend)}
	sdk, err := client.CreateContext(testContext(t), config, SignerConfig{})
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	ctx := testContext(t)
	go func() {
		_, err := server.request(ctx, sdk.id, pb.StorageMethod_STORAGE_METHOD_GET, "slow", nil)
		done <- err
	}()
	select {
	case <-backend.started:
	case <-time.After(time.Second):
		t.Fatal("storage callback not started")
	}
	server.disconnect(sdk.id)
	select {
	case <-backend.cancelled:
	case <-time.After(time.Second):
		t.Fatal("storage callback ignored channel cancellation")
	}
	<-done
	if err := sdk.WaitChannelFailure(testContext(t), StorageChannel); err == nil {
		t.Fatal("expected callback failure")
	}
	server.mu.Lock()
	previous := server.sessions[sdk.id]
	server.sessions[sdk.id] = &storageSession{binding: previous.binding, out: make(chan *pb.StorageServerMessage, 16), done: make(chan struct{}), replies: make(map[string]chan *pb.StorageReply)}
	server.mu.Unlock()
	if err := sdk.AttachStorage(testContext(t)); err != nil {
		t.Fatal(err)
	}
	storeRequest(t, server, sdk, pb.StorageMethod_STORAGE_METHOD_SET, "reconnected", []byte{9})
	stored, found, _ := backend.Storage.Get(testContext(t), "reconnected")
	if !found || !bytes.Equal(stored, []byte{9}) {
		t.Fatal("reattached storage unavailable")
	}
	if err := sdk.Close(testContext(t)); err != nil {
		t.Fatal(err)
	}
}

func TestApplicationStorageBindingIdentity(t *testing.T) {
	backend := NewMemoryStorage()
	binding := NamedApplicationStorage("database/tenant", backend)
	stores := make(map[string]*storageBackend)
	if _, err := storageBinding(binding, stores); err != nil {
		t.Fatal(err)
	}
	if _, err := storageBinding(binding, stores); err != nil {
		t.Fatal("reused binding rejected")
	}
	if _, err := storageBinding(NamedApplicationStorage("database/tenant", NewMemoryStorage()), stores); err == nil {
		t.Fatal("conflicting backend silently replaced")
	}
}

type failingStorage struct {
	Storage
	failure error
}

func (s failingStorage) Get(context.Context, string) ([]byte, bool, error) {
	return nil, false, s.failure
}
func TestStorageCallbackErrorMetadataAcrossWire(t *testing.T) {
	for _, rich := range []bool{false, true} {
		t.Run(fmt.Sprint(rich), func(t *testing.T) {
			var failure error = errors.New("database unavailable")
			if rich {
				failure = fmt.Errorf("adapter: %w", &SDKError{Code: "RPC_RATE_LIMITED", Message: "retry later", Retryable: true, RetryAfterSeconds: number(2.5)})
			}
			server := newStorageServer()
			client := testClient(t, server, nil)
			config := SDKConfig{Storage: ApplicationStorage(failingStorage{Storage: NewMemoryStorage(), failure: failure})}
			sdk, err := client.CreateContext(testContext(t), config, SignerConfig{})
			if err != nil {
				t.Fatal(err)
			}
			defer sdk.Close(testContext(t))
			reply, err := server.request(testContext(t), sdk.id, pb.StorageMethod_STORAGE_METHOD_GET, "key", nil)
			if err != nil {
				t.Fatal(err)
			}
			if reply.Error == nil {
				t.Fatal("storage failure lost")
			}
			if rich {
				if reply.Error.Code != "RPC_RATE_LIMITED" || reply.Error.Message != "retry later" || !reply.Error.Retryable || reply.Error.RetryAfterSeconds == nil || *reply.Error.RetryAfterSeconds != 2.5 {
					t.Fatalf("SDK metadata lost: %v", reply.Error)
				}
			} else if reply.Error.Code != "STORAGE_FAILED" || reply.Error.Message != "database unavailable" {
				t.Fatalf("ordinary storage error changed: %v", reply.Error)
			}
		})
	}
}
