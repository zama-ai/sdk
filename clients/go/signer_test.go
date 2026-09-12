package sidecar

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/signer/core/apitypes"
	pb "github.com/zama-ai/sdk/clients/go/gen/zama/sdk/v1alpha1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

type signerSession struct {
	account *pb.WalletAccount
	out     chan *pb.SignerServerMessage
	done    chan struct{}
	replies map[string]chan *pb.SignerReply
}
type signingServer struct {
	pb.UnimplementedSidecarServiceServer
	mu                     sync.Mutex
	sessions               map[string]*signerSession
	sequence               atomic.Uint64
	steps                  int
	afterSignature         chan struct{}
	continueAfterSignature chan struct{}
	staleReply             bool
}

func newSigningServer() *signingServer {
	return &signingServer{sessions: make(map[string]*signerSession), steps: 1}
}
func (s *signingServer) CreateContext(_ context.Context, r *pb.CreateContextRequest) (*pb.CreateContextResponse, error) {
	id := fmt.Sprint(s.sequence.Add(1))
	s.mu.Lock()
	s.sessions[id] = &signerSession{account: r.Account, out: make(chan *pb.SignerServerMessage, 16), done: make(chan struct{}), replies: make(map[string]chan *pb.SignerReply)}
	s.mu.Unlock()
	return &pb.CreateContextResponse{ContextId: id}, nil
}
func (s *signingServer) UpdateAccount(_ context.Context, r *pb.UpdateAccountRequest) (*pb.Empty, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions[r.ContextId].account = r.Account
	return &pb.Empty{}, nil
}
func (s *signingServer) CloseContext(_ context.Context, r *pb.ContextRequest) (*pb.Empty, error) {
	s.disconnect(r.ContextId)
	return &pb.Empty{}, nil
}
func (s *signingServer) disconnect(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	session := s.sessions[id]
	select {
	case <-session.done:
	default:
		close(session.done)
	}
}
func (s *signingServer) SignerChannel(stream grpc.BidiStreamingServer[pb.SignerClientMessage, pb.SignerServerMessage]) error {
	first, err := stream.Recv()
	if err != nil {
		return err
	}
	s.mu.Lock()
	session := s.sessions[first.GetAttach().ContextId]
	s.mu.Unlock()
	if err := stream.Send(&pb.SignerServerMessage{Message: &pb.SignerServerMessage_Attached{Attached: &pb.Empty{}}}); err != nil {
		return err
	}
	return serveCallback(stream, session.out, session.done, func(message *pb.SignerClientMessage) error {
		reply := message.GetReply()
		if reply == nil {
			return errors.New("missing reply")
		}
		s.mu.Lock()
		pending := session.replies[reply.ActionId]
		s.mu.Unlock()
		if pending != nil {
			pending <- reply
		}
		return nil
	})
}
func (s *signingServer) DecryptPublicValues(context.Context, *pb.DecryptPublicValuesRequest) (*pb.DecryptPublicValuesResponse, error) {
	return &pb.DecryptPublicValuesResponse{}, nil
}
func (s *signingServer) DecryptValues(ctx context.Context, r *pb.DecryptValuesRequest) (*pb.DecryptValuesResponse, error) {
	s.mu.Lock()
	session := s.sessions[r.Operation.ContextId]
	s.mu.Unlock()
	var signature []byte
	for step := 0; step < s.steps; step++ {
		id := fmt.Sprint(s.sequence.Add(1))
		reply := make(chan *pb.SignerReply, 1)
		s.mu.Lock()
		session.replies[id] = reply
		account := session.account
		s.mu.Unlock()
		defer func() { s.mu.Lock(); delete(session.replies, id); s.mu.Unlock() }()
		typed, _ := json.Marshal(map[string]any{"domain": map[string]any{"chainId": account.ChainId}, "types": map[string]any{"Request": []any{map[string]string{"name": "operation", "type": "string"}}}, "primaryType": "Request", "message": map[string]string{"operation": r.Operation.OperationId}})
		action := &pb.SignerAction{OperationId: r.Operation.OperationId, ActionId: id, Account: account, TypedDataJson: string(typed)}
		session.out <- &pb.SignerServerMessage{Message: &pb.SignerServerMessage_Action{Action: action}}
		select {
		case <-ctx.Done():
			session.out <- &pb.SignerServerMessage{Message: &pb.SignerServerMessage_Cancelled{Cancelled: &pb.SignerActionCancelled{OperationId: r.Operation.OperationId, ActionId: id}}}
			return nil, status.FromContextError(ctx.Err()).Err()
		case <-session.done:
			return nil, status.Error(codes.Unavailable, "signer disconnected")
		case result := <-reply:
			if result.Error != nil {
				grpc.SetTrailer(ctx, metadata.Pairs("zama-error-code", result.Error.Code))
				return nil, status.Error(codes.FailedPrecondition, result.Error.Message)
			}
			signature = result.Signature
			if s.staleReply {
				session.out <- &pb.SignerServerMessage{Message: &pb.SignerServerMessage_ReplyError{ReplyError: &pb.SignerReplyError{OperationId: r.Operation.OperationId, ActionId: id, Error: &pb.SdkError{Code: "SIGNER_ACTION_NOT_FOUND", Message: "stale"}}}}
			}
		}
	}
	if s.afterSignature != nil {
		close(s.afterSignature)
		select {
		case <-s.continueAfterSignature:
		case <-ctx.Done():
			return nil, status.FromContextError(ctx.Err()).Err()
		}
	}
	if len(signature) == 0 {
		return nil, errors.New("missing test signature")
	}
	return &pb.DecryptValuesResponse{Values: []*pb.ClearEntry{{EncryptedValue: common.Hash{}.Bytes(), Value: &pb.ClearValue{Value: &pb.ClearValue_BigintValue{BigintValue: fmt.Sprint(signature[0])}}}}}, nil
}
func signedSDK(t *testing.T, client *Client, account common.Address, sign SignTypedDataFunc) *SDKContext {
	t.Helper()
	sdk, err := client.CreateContext(testContext(t), SDKConfig{}, SignerConfig{Account: &WalletAccount{Address: account, ChainID: 11155111}, SignTypedData: sign})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		sdk.Close(ctx)
	})
	return sdk
}
func decrypt(sdk *SDKContext, ctx context.Context) (map[common.Hash]ClearValue, error) {
	return sdk.DecryptValues(ctx, []EncryptedInput{{}}, DecryptOptions{})
}
func TestSignerSequentialAndMultipleContexts(t *testing.T) {
	server := newSigningServer()
	server.steps = 2
	server.staleReply = true
	client := testClient(t, server, nil)
	var count atomic.Int32
	sign := func(ctx context.Context, account WalletAccount, typed apitypes.TypedData) ([]byte, error) {
		count.Add(1)
		if typed.PrimaryType != "Request" || account.ChainID != 11155111 {
			return nil, errors.New("signing payload changed")
		}
		return []byte{account.Address[0]}, nil
	}
	first := signedSDK(t, client, common.Address{11}, sign)
	second := signedSDK(t, client, common.Address{22}, sign)
	for sdk, want := range map[*SDKContext]int64{first: 11, second: 22} {
		values, err := decrypt(sdk, testContext(t))
		if err != nil || values[common.Hash{}].Integer.Int64() != want {
			t.Fatalf("context signing misrouted: %v %v", values, err)
		}
	}
	if count.Load() != 4 {
		t.Fatal("sequential signing actions lost")
	}
	if err := first.UpdateAccount(testContext(t), &WalletAccount{Address: common.Address{33}, ChainID: 11155111}); err != nil {
		t.Fatal(err)
	}
	values, err := decrypt(first, testContext(t))
	if err != nil || values[common.Hash{}].Integer.Int64() != 33 {
		t.Fatal("new account not used")
	}
}
func TestSignerConcurrentRoutingAndCancellation(t *testing.T) {
	server := newSigningServer()
	client := testClient(t, server, nil)
	started := make(chan struct{})
	cancelled := make(chan struct{})
	sdk := signedSDK(t, client, common.Address{1}, func(ctx context.Context, _ WalletAccount, typed apitypes.TypedData) ([]byte, error) {
		if typed.Message["operation"] == "1" {
			close(started)
			<-ctx.Done()
			close(cancelled)
			return nil, ctx.Err()
		}
		return []byte{42}, nil
	})
	ctx, cancel := context.WithCancel(testContext(t))
	done := make(chan error, 1)
	go func() { _, err := decrypt(sdk, ctx); done <- err }()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("signer not invoked")
	}
	values, err := decrypt(sdk, testContext(t))
	if err != nil || values[common.Hash{}].Integer.Int64() != 42 {
		t.Fatal("delayed signer blocked independent operation")
	}
	cancel()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("cancelled operation succeeded")
		}
	case <-time.After(time.Second):
		t.Fatal("operation cancellation hung")
	}
	select {
	case <-cancelled:
	case <-time.After(time.Second):
		t.Fatal("wallet callback not cancelled")
	}
}
func TestSignerRejectionAndDisconnect(t *testing.T) {
	for _, disconnect := range []bool{false, true} {
		t.Run(fmt.Sprint(disconnect), func(t *testing.T) {
			server := newSigningServer()
			client := testClient(t, server, nil)
			started := make(chan struct{})
			cancelled := make(chan struct{})
			sdk := signedSDK(t, client, common.Address{1}, func(ctx context.Context, _ WalletAccount, _ apitypes.TypedData) ([]byte, error) {
				if !disconnect {
					return nil, ErrSigningRejected
				}
				close(started)
				<-ctx.Done()
				close(cancelled)
				return nil, ctx.Err()
			})
			if !disconnect {
				_, err := decrypt(sdk, testContext(t))
				var rpc *RPCError
				if !errors.As(err, &rpc) || rpc.Code != "SIGNING_REJECTED" {
					t.Fatalf("lost wallet rejection: %v", err)
				}
				return
			}
			done := make(chan error, 1)
			go func() { _, err := decrypt(sdk, testContext(t)); done <- err }()
			select {
			case <-started:
			case <-time.After(time.Second):
				t.Fatal("no signing action")
			}
			server.disconnect(sdk.id)
			select {
			case err := <-done:
				if err == nil {
					t.Fatal("disconnected operation succeeded")
				}
			case <-time.After(time.Second):
				t.Fatal("disconnect hung")
			}
			select {
			case <-cancelled:
			case <-time.After(time.Second):
				t.Fatal("disconnect did not cancel wallet")
			}
			if _, err := sdk.DecryptPublicValues(testContext(t), nil, DecryptOptions{}); err != nil {
				t.Fatalf("signer loss disabled public decryption: %v", err)
			}
			if err := sdk.WaitChannelFailure(testContext(t), SignerChannel); err == nil {
				t.Fatal("expected callback failure")
			}
			server.mu.Lock()
			previous := server.sessions[sdk.id]
			server.sessions[sdk.id] = &signerSession{account: previous.account, out: make(chan *pb.SignerServerMessage, 16), done: make(chan struct{}), replies: make(map[string]chan *pb.SignerReply)}
			server.mu.Unlock()
			if err := sdk.AttachSigner(testContext(t), func(context.Context, WalletAccount, apitypes.TypedData) ([]byte, error) { return []byte{77}, nil }); err != nil {
				t.Fatal(err)
			}
			values, err := decrypt(sdk, testContext(t))
			if err != nil || values[common.Hash{}].Integer.Int64() != 77 {
				t.Fatalf("reattached signer failed: %v", err)
			}
		})
	}
}

func TestCompletedSignerActionDoesNotCancelRemainingSDKWork(t *testing.T) {
	server := newSigningServer()
	server.afterSignature = make(chan struct{})
	server.continueAfterSignature = make(chan struct{})
	client := testClient(t, server, nil)
	sdk := signedSDK(t, client, common.Address{1}, func(context.Context, WalletAccount, apitypes.TypedData) ([]byte, error) { return []byte{44}, nil })
	done := make(chan error, 1)
	go func() { _, err := decrypt(sdk, testContext(t)); done <- err }()
	select {
	case <-server.afterSignature:
	case <-time.After(time.Second):
		t.Fatal("signature not delivered")
	}
	waitFor(t, func() bool {
		sdk.mu.Lock()
		active := 0
		for _, op := range sdk.operations {
			active += len(op.actions)
		}
		sdk.mu.Unlock()
		return active == 0
	})
	server.disconnect(sdk.id)
	if err := sdk.WaitChannelFailure(testContext(t), SignerChannel); err == nil {
		t.Fatal("expected callback failure")
	}
	close(server.continueAfterSignature)
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("completed signing cancelled later SDK work: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("SDK work did not finish")
	}
}
