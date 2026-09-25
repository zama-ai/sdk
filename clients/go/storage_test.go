package zama

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	pb "github.com/zama-ai/sdk/clients/go/v3/internal/gen/zama/sdk/v1beta1"
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
	client := testClient(t, &pb.UnimplementedDaemonServiceServer{}, func(_ context.Context, request any, _ *grpc.UnaryServerInfo, _ grpc.UnaryHandler) (any, error) {
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
	if r.Config.PermitTtl == nil || *r.Config.PermitTtl != 0 || r.Config.GetChainId() != 11155111 || r.Config.Chains[0].Auth.GetApiKeyHeader().Value != "example" {
		t.Fatal("typed SDK config changed")
	}
	config.Storage = PersistentStorage("credentials")
	permitStorage := DaemonMemoryStorage()
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
	pb.UnimplementedDaemonServiceServer
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
func (s *storageServer) CloseContext(_ context.Context, r *pb.ContextRequest) (*pb.CloseContextResponse, error) {
	s.disconnect(r.ContextId)
	return &pb.CloseContextResponse{}, nil
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
	if reply.GetError() != nil {
		t.Fatalf("storage callback failed: %v", reply.GetError())
	}
	return reply
}
func TestApplicationStorageOpaqueWireAndNewDaemonContext(t *testing.T) {
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
	if value := storeRequest(t, firstServer, first, pb.StorageMethod_STORAGE_METHOD_GET, "empty", nil).GetValue(); value == nil || len(value) != 0 {
		t.Fatal("empty lost protobuf presence")
	}
	if value := storeRequest(t, firstServer, first, pb.StorageMethod_STORAGE_METHOD_GET, "missing", nil).GetValue(); value != nil {
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
	if value := storeRequest(t, secondServer, second, pb.StorageMethod_STORAGE_METHOD_GET, "credential", nil).GetValue(); !bytes.Equal(value, blob) {
		t.Fatal("native data lost when daemon context was replaced")
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
				failure = fmt.Errorf("adapter: %w", &SDKError{Code: "RPC_RATE_LIMITED", Message: "retry later", Retryable: true, RetryAfterSeconds: number(2)})
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
			if reply.GetError() == nil {
				t.Fatal("storage failure lost")
			}
			if rich {
				if reply.GetError().Code != "RPC_RATE_LIMITED" || reply.GetError().Message != "retry later" || !reply.GetError().Retryable || reply.GetError().RetryAfterSeconds == nil || *reply.GetError().RetryAfterSeconds != 2 {
					t.Fatalf("SDK metadata lost: %v", reply.GetError())
				}
			} else if reply.GetError().Code != "STORAGE_FAILED" || reply.GetError().Message != "database unavailable" {
				t.Fatalf("ordinary storage error changed: %v", reply.GetError())
			}
		})
	}
}

func TestChainOverridesPreservePresence(t *testing.T) {
	empty := ""
	address := "0x0000000000000000000000000000000000000001"
	chain, err := (ChainConfig{ID: 11155111, RegistryAddress: &empty, ACLContractAddress: &address, Auth: APIKeyCookie{Value: "token", Cookie: &empty}}).wire()
	if err != nil {
		t.Fatal(err)
	}
	if chain.RegistryAddress == nil || len(chain.RegistryAddress) != 0 || chain.ExecutorAddress != nil || chain.Network != nil {
		t.Fatal("preset omission or explicit clearing changed")
	}
	if len(chain.AclContractAddress) != 20 || chain.AclContractAddress[19] != 1 {
		t.Fatal("address changed")
	}
	if chain.Auth.GetApiKeyCookie().Name == nil || *chain.Auth.GetApiKeyCookie().Name != "" {
		t.Fatal("explicit credential name became omitted")
	}
	invalid := "0x1234"
	if _, err := (ChainConfig{ACLContractAddress: &invalid}).wire(); err == nil {
		t.Fatal("short address was padded")
	}
}

func TestConfigurationRejectsAmbiguousChainSelection(t *testing.T) {
	for _, update := range []func(*SDKConfig){
		func(config *SDKConfig) { config.Chains = []ChainConfig{} },
		func(config *SDKConfig) { config.Chains = []ChainConfig{{ID: 11155111}} },
		func(config *SDKConfig) {
			config.RPCURL = nil
			config.Auth = BearerToken{Token: "token"}
			config.Chains = []ChainConfig{{ID: 11155111}}
		},
	} {
		config := NewSDKConfig(11155111, "http://localhost")
		update(&config)
		if _, err := config.wire(); err == nil {
			t.Fatal("ambiguous chain configuration accepted")
		}
	}
}
