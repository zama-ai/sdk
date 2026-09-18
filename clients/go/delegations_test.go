package sidecar

import (
	"bytes"
	"context"
	"errors"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	pb "github.com/zama-ai/sdk/clients/go/gen/zama/sdk/v1alpha1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

func hashBytes(fill byte) []byte { return bytes.Repeat([]byte{fill}, common.HashLength) }

func TestDelegateDecryptionWire(t *testing.T) {
	contract, delegate := common.Address{1}, common.Address{2}
	txHash := hashBytes(0xaa)
	logAddress := common.Address{3}
	explicit := time.UnixMilli(1900000000123)
	for _, tt := range []struct {
		name     string
		expiry   *time.Time
		wantNil  bool
		wantWire uint64
	}{
		{"nil expiry is permanent", nil, true, 0},
		{"explicit expiry preserved", &explicit, false, 1900000000123},
	} {
		t.Run(tt.name, func(t *testing.T) {
			requests := make(chan *pb.DelegateDecryptionRequest, 1)
			client := testClient(t, &pb.UnimplementedSidecarServiceServer{}, func(_ context.Context, request any, _ *grpc.UnaryServerInfo, _ grpc.UnaryHandler) (any, error) {
				if req, ok := request.(*pb.DelegateDecryptionRequest); ok {
					requests <- req
					return &pb.DelegateDecryptionResponse{Transaction: &pb.TransactionResult{
						TransactionHash: txHash,
						Logs: []*pb.TransactionLog{
							{Address: logAddress.Bytes(), Topics: [][]byte{hashBytes(0x01)}, Data: []byte{9, 8, 7}},
						},
					}}, nil
				}
				return &pb.CreateContextResponse{ContextId: "delegations"}, nil
			})
			sdk := unsignedSDK(t, client)
			result, err := sdk.DelegateDecryption(testContext(t), DelegateDecryptionParams{ContractAddress: contract, DelegateAddress: delegate, ExpirationDate: tt.expiry})
			if err != nil {
				t.Fatal(err)
			}
			req := <-requests
			if !bytes.Equal(req.Delegation.ContractAddress, contract.Bytes()) || !bytes.Equal(req.Delegation.DelegateAddress, delegate.Bytes()) {
				t.Fatalf("delegation addresses lost: %v", req.Delegation)
			}
			if tt.wantNil {
				if req.Delegation.ExpirationDateMs != nil {
					t.Fatal("nil expiry became present on the wire")
				}
			} else {
				if req.Delegation.ExpirationDateMs == nil || *req.Delegation.ExpirationDateMs != tt.wantWire {
					t.Fatalf("expiry changed: %v", req.Delegation.ExpirationDateMs)
				}
			}
			if result.TxHash != common.BytesToHash(txHash) {
				t.Fatal("transaction hash changed")
			}
			if len(result.Logs) != 1 || *result.Logs[0].Address != logAddress || len(result.Logs[0].Topics) != 1 || result.Logs[0].Topics[0] != common.BytesToHash(hashBytes(0x01)) || !bytes.Equal(result.Logs[0].Data, []byte{9, 8, 7}) {
				t.Fatalf("transaction log changed: %#v", result.Logs)
			}
		})
	}
}

func TestDelegateDecryptionRejectsUnrepresentableExpiry(t *testing.T) {
	unrepresentable := time.Date(300000000, 1, 1, 0, 0, 0, 0, time.UTC)
	if _, err := (&SDKContext{}).DelegateDecryption(context.Background(), DelegateDecryptionParams{ExpirationDate: &unrepresentable}); err == nil {
		t.Fatal("unrepresentable expiry accepted")
	}
}

func TestRevokeDelegationWire(t *testing.T) {
	contract, delegate := common.Address{4}, common.Address{5}
	txHash := hashBytes(0xbb)
	requests := make(chan *pb.RevokeDelegationRequest, 1)
	client := testClient(t, &pb.UnimplementedSidecarServiceServer{}, func(_ context.Context, request any, _ *grpc.UnaryServerInfo, _ grpc.UnaryHandler) (any, error) {
		if req, ok := request.(*pb.RevokeDelegationRequest); ok {
			requests <- req
			return &pb.RevokeDelegationResponse{Transaction: &pb.TransactionResult{TransactionHash: txHash}}, nil
		}
		return &pb.CreateContextResponse{ContextId: "delegations"}, nil
	})
	sdk := unsignedSDK(t, client)
	result, err := sdk.RevokeDelegation(testContext(t), RevokeDelegationParams{ContractAddress: contract, DelegateAddress: delegate})
	if err != nil {
		t.Fatal(err)
	}
	req := <-requests
	if !bytes.Equal(req.Delegation.ContractAddress, contract.Bytes()) || !bytes.Equal(req.Delegation.DelegateAddress, delegate.Bytes()) {
		t.Fatalf("delegation addresses lost: %v", req.Delegation)
	}
	if result.TxHash != common.BytesToHash(txHash) || len(result.Logs) != 0 {
		t.Fatalf("transaction result changed: %#v", result)
	}
}

func TestTransactionResultRejectsMalformedShapes(t *testing.T) {
	for _, tt := range []struct {
		name string
		wire *pb.TransactionResult
	}{
		{"missing transaction", nil},
		{"short hash", &pb.TransactionResult{TransactionHash: []byte{1}}},
		{"short topic", &pb.TransactionResult{TransactionHash: hashBytes(1), Logs: []*pb.TransactionLog{{Topics: [][]byte{{1}}}}}},
		{"short address", &pb.TransactionResult{TransactionHash: hashBytes(1), Logs: []*pb.TransactionLog{{Address: []byte{1}}}}},
		{"nil log", &pb.TransactionResult{TransactionHash: hashBytes(1), Logs: []*pb.TransactionLog{nil}}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := transactionResult(tt.wire); err == nil {
				t.Fatal("malformed transaction result accepted")
			}
		})
	}
	if tt, err := transactionResult(&pb.TransactionResult{TransactionHash: hashBytes(1), Logs: []*pb.TransactionLog{{Data: []byte{}}}}); err != nil || tt.Logs[0].Address != nil {
		t.Fatalf("absent log address became present: %v %v", tt, err)
	}
}

func TestDelegationReadsWire(t *testing.T) {
	contract, delegator, delegate := common.Address{6}, common.Address{7}, common.Address{8}
	requests := make(chan *pb.DelegationQuery, 8)
	client := testClient(t, &pb.UnimplementedSidecarServiceServer{}, func(_ context.Context, request any, _ *grpc.UnaryServerInfo, _ grpc.UnaryHandler) (any, error) {
		if req, ok := request.(*pb.DelegationQuery); ok {
			requests <- req
			return &pb.IsDelegationActiveResponse{}, nil
		}
		return &pb.CreateContextResponse{ContextId: "delegations"}, nil
	})
	sdk := unsignedSDK(t, client)
	query := DelegationQuery{ContractAddress: contract, DelegatorAddress: delegator, DelegateAddress: delegate}
	if _, err := sdk.IsDelegationActive(testContext(t), query); err != nil {
		t.Fatal(err)
	}
	req := <-requests
	if !bytes.Equal(req.ContractAddress, contract.Bytes()) || !bytes.Equal(req.DelegatorAddress, delegator.Bytes()) || !bytes.Equal(req.DelegateAddress, delegate.Bytes()) || req.Operation.ContextId != sdk.id {
		t.Fatalf("query parameters lost: %v", req)
	}
}

func TestDelegationReadMethods(t *testing.T) {
	for _, tt := range []struct {
		name     string
		response any
		assert   func(t *testing.T, sdk *SDKContext)
	}{
		{
			"IsDelegationActive",
			&pb.IsDelegationActiveResponse{IsActive: true},
			func(t *testing.T, sdk *SDKContext) {
				active, err := sdk.IsDelegationActive(testContext(t), DelegationQuery{})
				if err != nil || !active {
					t.Fatalf("active flag lost: %v %v", active, err)
				}
			},
		},
		{
			"GetDelegationExpiry",
			&pb.GetDelegationExpiryResponse{ExpiryTimestamp: PermanentDelegationExpiry},
			func(t *testing.T, sdk *SDKContext) {
				expiry, err := sdk.GetDelegationExpiry(testContext(t), DelegationQuery{})
				if err != nil || expiry != PermanentDelegationExpiry {
					t.Fatalf("expiry lost: %v %v", expiry, err)
				}
			},
		},
		{
			"GetDelegationStatus",
			&pb.GetDelegationStatusResponse{IsActive: true, ExpiryTimestamp: 42},
			func(t *testing.T, sdk *SDKContext) {
				status, err := sdk.GetDelegationStatus(testContext(t), DelegationQuery{})
				if err != nil || !status.IsActive || status.ExpiryTimestamp != 42 {
					t.Fatalf("status lost: %#v %v", status, err)
				}
			},
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			client := testClient(t, &pb.UnimplementedSidecarServiceServer{}, func(_ context.Context, request any, _ *grpc.UnaryServerInfo, _ grpc.UnaryHandler) (any, error) {
				if _, ok := request.(*pb.DelegationQuery); ok {
					return tt.response, nil
				}
				return &pb.CreateContextResponse{ContextId: "delegations"}, nil
			})
			tt.assert(t, unsignedSDK(t, client))
		})
	}
}

func TestDelegationErrorTrailersSurfaceAsRPCError(t *testing.T) {
	client := testClient(t, &pb.UnimplementedSidecarServiceServer{}, func(ctx context.Context, request any, _ *grpc.UnaryServerInfo, _ grpc.UnaryHandler) (any, error) {
		switch request.(type) {
		case *pb.RevokeDelegationRequest, *pb.DelegationQuery, *pb.DelegateDecryptionRequest:
			grpc.SetTrailer(ctx, metadata.Pairs("zama-error-code", "DELEGATION_NOT_FOUND", "zama-error-retryable", "false"))
			return nil, status.Error(codes.NotFound, "no delegation")
		}
		return &pb.CreateContextResponse{ContextId: "delegations"}, nil
	})
	sdk := unsignedSDK(t, client)
	_, err := sdk.RevokeDelegation(testContext(t), RevokeDelegationParams{})
	var rpc *RPCError
	if !errors.As(err, &rpc) || rpc.Code != "DELEGATION_NOT_FOUND" || status.Code(err) != codes.NotFound {
		t.Fatalf("structured error lost: %#v", err)
	}
}
