package sidecar

import (
	"context"
	"errors"
	"math"
	"time"

	"github.com/ethereum/go-ethereum/common"
	pb "github.com/zama-ai/sdk/clients/go/internal/gen/zama/sdk/v1alpha1"
	"google.golang.org/grpc"
)

// PermanentDelegationExpiry is the on-chain sentinel for a delegation that never expires.
const PermanentDelegationExpiry uint64 = math.MaxUint64

type DelegateDecryptionParams struct {
	ContractAddress common.Address
	DelegateAddress common.Address
	// ExpirationDate nil requests a permanent delegation.
	ExpirationDate *time.Time
}

type RevokeDelegationParams struct {
	ContractAddress common.Address
	DelegateAddress common.Address
}

type DelegationQuery struct {
	ContractAddress  common.Address
	DelegatorAddress common.Address
	DelegateAddress  common.Address
}

type DelegationStatus struct {
	IsActive        bool
	ExpiryTimestamp uint64
}

// Wire milliseconds are unsigned and UnixMilli overflows outside the int64 millisecond range.
func expirationMillis(expiration *time.Time) (*uint64, error) {
	if expiration == nil {
		return nil, nil
	}
	if expiration.Before(time.UnixMilli(0)) || expiration.After(time.UnixMilli(math.MaxInt64)) {
		return nil, errors.New("expiration date is outside the representable millisecond range")
	}
	value := uint64(expiration.UnixMilli())
	return &value, nil
}
func delegateDecryptionWire(contract, delegate common.Address, expirationDate *time.Time) (*pb.DelegateDecryption, error) {
	expiration, err := expirationMillis(expirationDate)
	if err != nil {
		return nil, err
	}
	return &pb.DelegateDecryption{ContractAddress: contract.Bytes(), DelegateAddress: delegate.Bytes(), ExpirationDateMs: expiration}, nil
}
func revokeDelegationWire(contract, delegate common.Address) *pb.RevokeDelegation {
	return &pb.RevokeDelegation{ContractAddress: contract.Bytes(), DelegateAddress: delegate.Bytes()}
}
func delegationQueryWire(query DelegationQuery, op *pb.Operation) *pb.DelegationQueryRequest {
	return &pb.DelegationQueryRequest{Operation: op, ContractAddress: query.ContractAddress.Bytes(), DelegatorAddress: query.DelegatorAddress.Bytes(), DelegateAddress: query.DelegateAddress.Bytes()}
}

// DelegateDecryption grants decryption rights as the signer account and returns the mined transaction.
func (s *SDKContext) DelegateDecryption(ctx context.Context, params DelegateDecryptionParams) (*TransactionResult, error) {
	delegation, err := delegateDecryptionWire(params.ContractAddress, params.DelegateAddress, params.ExpirationDate)
	if err != nil {
		return nil, err
	}
	response, err := call(ctx, s, func(ctx context.Context, op *pb.Operation, trailer grpc.CallOption) (*pb.DelegateDecryptionResponse, error) {
		return s.client.rpc.DelegateDecryption(ctx, &pb.DelegateDecryptionRequest{Operation: op, Delegation: delegation}, trailer)
	})
	if err != nil {
		return nil, err
	}
	return transactionResult(response.Transaction)
}

// RevokeDelegation revokes decryption rights as the signer account and returns the mined transaction.
func (s *SDKContext) RevokeDelegation(ctx context.Context, params RevokeDelegationParams) (*TransactionResult, error) {
	delegation := revokeDelegationWire(params.ContractAddress, params.DelegateAddress)
	response, err := call(ctx, s, func(ctx context.Context, op *pb.Operation, trailer grpc.CallOption) (*pb.RevokeDelegationResponse, error) {
		return s.client.rpc.RevokeDelegation(ctx, &pb.RevokeDelegationRequest{Operation: op, Delegation: delegation}, trailer)
	})
	if err != nil {
		return nil, err
	}
	return transactionResult(response.Transaction)
}

// IsDelegationActive reads whether the delegation is currently active, without requiring a signer.
func (s *SDKContext) IsDelegationActive(ctx context.Context, query DelegationQuery) (bool, error) {
	response, err := call(ctx, s, func(ctx context.Context, op *pb.Operation, trailer grpc.CallOption) (*pb.IsDelegationActiveResponse, error) {
		return s.client.rpc.IsDelegationActive(ctx, delegationQueryWire(query, op), trailer)
	})
	if err != nil {
		return false, err
	}
	return response.IsActive, nil
}

// GetDelegationExpiry reads the delegation's expiry timestamp without requiring a signer: 0 means none, PermanentDelegationExpiry means permanent.
func (s *SDKContext) GetDelegationExpiry(ctx context.Context, query DelegationQuery) (uint64, error) {
	response, err := call(ctx, s, func(ctx context.Context, op *pb.Operation, trailer grpc.CallOption) (*pb.GetDelegationExpiryResponse, error) {
		return s.client.rpc.GetDelegationExpiry(ctx, delegationQueryWire(query, op), trailer)
	})
	if err != nil {
		return 0, err
	}
	return response.ExpiryTimestamp, nil
}

// GetDelegationStatus reads the delegation's active flag and expiry timestamp, without requiring a signer.
func (s *SDKContext) GetDelegationStatus(ctx context.Context, query DelegationQuery) (*DelegationStatus, error) {
	response, err := call(ctx, s, func(ctx context.Context, op *pb.Operation, trailer grpc.CallOption) (*pb.GetDelegationStatusResponse, error) {
		return s.client.rpc.GetDelegationStatus(ctx, delegationQueryWire(query, op), trailer)
	})
	if err != nil {
		return nil, err
	}
	return &DelegationStatus{IsActive: response.IsActive, ExpiryTimestamp: response.ExpiryTimestamp}, nil
}
