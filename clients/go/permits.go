package sidecar

import (
	"context"

	"github.com/ethereum/go-ethereum/common"
	pb "github.com/zama-ai/sdk/clients/go/gen/zama/sdk/v1alpha1"
	"google.golang.org/grpc"
)

type PreparePermitOptions struct {
	Delegator    *common.Address
	DurationDays *float64
}

func addressesWire(addresses []common.Address) [][]byte {
	result := make([][]byte, len(addresses))
	for i, a := range addresses {
		result[i] = a.Bytes()
	}
	return result
}
func (s *SDKContext) PreparePermit(ctx context.Context, signer common.Address, contracts []common.Address, options PreparePermitOptions) (string, error) {
	r, err := call(ctx, s, func(ctx context.Context, op *pb.Operation, trailer grpc.CallOption) (*pb.PreparePermitResponse, error) {
		return s.client.rpc.PreparePermit(ctx, &pb.PreparePermitRequest{Operation: op, SignerAddress: signer.Bytes(), ContractAddresses: addressesWire(contracts), DelegatorAddress: optionalAddress(options.Delegator), DurationDays: options.DurationDays}, trailer)
	})
	if err != nil {
		return "", err
	}
	return r.PreparedPermitJson, nil
}
func (s *SDKContext) RegisterPermit(ctx context.Context, prepared string, signature []byte) error {
	_, err := call(ctx, s, func(ctx context.Context, op *pb.Operation, trailer grpc.CallOption) (*pb.Empty, error) {
		return s.client.rpc.RegisterPermit(ctx, &pb.RegisterPermitRequest{Operation: op, PreparedPermitJson: prepared, Signature: signature}, trailer)
	})
	return err
}
func (s *SDKContext) GrantPermit(ctx context.Context, contracts []common.Address) error {
	_, err := call(ctx, s, func(ctx context.Context, op *pb.Operation, trailer grpc.CallOption) (*pb.Empty, error) {
		return s.client.rpc.GrantPermit(ctx, &pb.ContractsRequest{Operation: op, ContractAddresses: addressesWire(contracts)}, trailer)
	})
	return err
}
func (s *SDKContext) GrantDelegationPermit(ctx context.Context, delegator common.Address, contracts []common.Address) error {
	_, err := call(ctx, s, func(ctx context.Context, op *pb.Operation, trailer grpc.CallOption) (*pb.Empty, error) {
		return s.client.rpc.GrantDelegationPermit(ctx, &pb.DelegationContractsRequest{Operation: op, DelegatorAddress: delegator.Bytes(), ContractAddresses: addressesWire(contracts)}, trailer)
	})
	return err
}
func (s *SDKContext) HasPermit(ctx context.Context, contracts []common.Address) (bool, error) {
	r, err := call(ctx, s, func(ctx context.Context, op *pb.Operation, trailer grpc.CallOption) (*pb.HasPermitResponse, error) {
		return s.client.rpc.HasPermit(ctx, &pb.ContractsRequest{Operation: op, ContractAddresses: addressesWire(contracts)}, trailer)
	})
	if err != nil {
		return false, err
	}
	return r.HasPermit, nil
}
func (s *SDKContext) HasDelegationPermit(ctx context.Context, delegator common.Address, contracts []common.Address) (bool, error) {
	r, err := call(ctx, s, func(ctx context.Context, op *pb.Operation, trailer grpc.CallOption) (*pb.HasPermitResponse, error) {
		return s.client.rpc.HasDelegationPermit(ctx, &pb.DelegationContractsRequest{Operation: op, DelegatorAddress: delegator.Bytes(), ContractAddresses: addressesWire(contracts)}, trailer)
	})
	if err != nil {
		return false, err
	}
	return r.HasPermit, nil
}

// RevokePermits revokes all permits for nil contracts; an empty slice is forwarded unchanged.
func (s *SDKContext) RevokePermits(ctx context.Context, contracts []common.Address) error {
	var list *pb.ContractList
	if contracts != nil {
		list = &pb.ContractList{Addresses: addressesWire(contracts)}
	}
	_, err := call(ctx, s, func(ctx context.Context, op *pb.Operation, trailer grpc.CallOption) (*pb.Empty, error) {
		return s.client.rpc.RevokePermits(ctx, &pb.RevokePermitsRequest{Operation: op, Contracts: list}, trailer)
	})
	return err
}
func (s *SDKContext) ClearPermits(ctx context.Context) error {
	_, err := call(ctx, s, func(ctx context.Context, op *pb.Operation, trailer grpc.CallOption) (*pb.Empty, error) {
		return s.client.rpc.ClearPermits(ctx, &pb.OperationRequest{Operation: op}, trailer)
	})
	return err
}
func (s *SDKContext) WarmTransportKeyPair(ctx context.Context) error {
	_, err := call(ctx, s, func(ctx context.Context, op *pb.Operation, trailer grpc.CallOption) (*pb.Empty, error) {
		return s.client.rpc.WarmTransportKeyPair(ctx, &pb.OperationRequest{Operation: op}, trailer)
	})
	return err
}
func (s *SDKContext) WarmTransportKeyPairScope(ctx context.Context, scope string) error {
	_, err := call(ctx, s, func(ctx context.Context, op *pb.Operation, trailer grpc.CallOption) (*pb.Empty, error) {
		return s.client.rpc.WarmTransportKeyPairScope(ctx, &pb.ScopeRequest{Operation: op, ScopeId: scope}, trailer)
	})
	return err
}
func (s *SDKContext) RevokeTransportKeyPair(ctx context.Context, scope string) error {
	_, err := call(ctx, s, func(ctx context.Context, op *pb.Operation, trailer grpc.CallOption) (*pb.Empty, error) {
		return s.client.rpc.RevokeTransportKeyPair(ctx, &pb.ScopeRequest{Operation: op, ScopeId: scope}, trailer)
	})
	return err
}
