package sidecar

import (
	"context"
	"errors"
	"strconv"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/signer/core/apitypes"
	pb "github.com/zama-ai/sdk/clients/go/gen/zama/sdk/v1alpha1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
)

const cleanupTimeout = 5 * time.Second

type WalletAccount struct {
	Address common.Address
	ChainID uint64
}

// SignTypedDataFunc may run concurrently and must honor cancellation.
type SignTypedDataFunc func(context.Context, WalletAccount, apitypes.TypedData) ([]byte, error)

type operationState struct {
	ctx         context.Context
	cancel      context.CancelFunc
	failure     error
	actions     map[string]context.CancelFunc
	seenActions map[string]struct{}
}
type SDKContext struct {
	client     *Client
	id         string
	mu         sync.Mutex
	sequence   uint64
	operations map[string]*operationState
	terminal   error
	signer     *callbackChannel
	storage    *callbackChannel
	stores     map[string]*storageBackend
}

func accountWire(account *WalletAccount) *pb.WalletAccount {
	if account == nil {
		return nil
	}
	return &pb.WalletAccount{Address: account.Address.Bytes(), ChainId: account.ChainID}
}
func (s *SDKContext) Close(ctx context.Context) error {
	var trailers metadata.MD
	_, err := s.client.rpc.CloseContext(ctx, &pb.ContextRequest{ContextId: s.id}, grpc.Trailer(&trailers))
	s.stop(errors.New("SDK context closed"))
	s.mu.Lock()
	for _, channel := range []*callbackChannel{s.signer, s.storage} {
		if channel != nil {
			channel.cancel()
		}
	}
	s.mu.Unlock()
	return rpcError(err, trailers)
}
func (s *SDKContext) UpdateAccount(ctx context.Context, account *WalletAccount) error {
	var trailers metadata.MD
	_, err := s.client.rpc.UpdateAccount(ctx, &pb.UpdateAccountRequest{ContextId: s.id, Account: accountWire(account)}, grpc.Trailer(&trailers))
	return rpcError(err, trailers)
}
func (s *SDKContext) stop(err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.terminal == nil {
		s.terminal = err
	}
	for _, op := range s.operations {
		if op.failure == nil {
			op.failure = err
		}
		op.cancel()
	}
}
func (s *SDKContext) failOperation(id string, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if op := s.operations[id]; op != nil {
		if op.failure == nil {
			op.failure = err
		}
		op.cancel()
	}
}
func call[T any](ctx context.Context, s *SDKContext, invoke func(context.Context, *pb.Operation, grpc.CallOption) (T, error)) (T, error) {
	s.mu.Lock()
	if s.terminal != nil {
		err := s.terminal
		s.mu.Unlock()
		var zero T
		return zero, err
	}
	s.sequence++
	id := strconv.FormatUint(s.sequence, 10)
	opctx, cancel := context.WithCancel(ctx)
	state := &operationState{ctx: opctx, cancel: cancel, actions: make(map[string]context.CancelFunc), seenActions: make(map[string]struct{})}
	s.operations[id] = state
	s.mu.Unlock()
	defer func() { s.mu.Lock(); delete(s.operations, id); s.mu.Unlock(); cancel() }()
	var trailers metadata.MD
	result, err := invoke(opctx, &pb.Operation{ContextId: s.id, OperationId: id}, grpc.Trailer(&trailers))
	s.mu.Lock()
	failure := state.failure
	s.mu.Unlock()
	if failure != nil {
		return result, failure
	}
	return result, rpcError(err, trailers)
}
