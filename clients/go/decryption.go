package sidecar

import (
	"context"
	"errors"
	"math/big"

	"github.com/ethereum/go-ethereum/common"
	pb "github.com/zama-ai/sdk/clients/go/gen/zama/sdk/v1alpha1"
	"google.golang.org/grpc"
)

type EncryptedInput struct {
	EncryptedValue  common.Hash
	ContractAddress common.Address
}
type ClearValueKind uint8

const (
	ClearUnknown ClearValueKind = iota
	ClearBigInt
	ClearBool
	ClearString
	ClearUndefined
	ClearNumber
)

type ClearValue struct {
	Kind    ClearValueKind
	Integer *big.Int
	Boolean bool
	Text    string
	Number  uint32
}
type DecryptOptions struct{ TimeoutMS *uint32 }
type DelegatedDecryptOptions struct {
	AccountAddress     *common.Address
	WaitForPropagation *bool
}
type DelegatedBatchOptions struct {
	AccountAddress     *common.Address
	WaitForPropagation *bool
	// MaxConcurrency uses the SDK default when nil; zero means unlimited.
	MaxConcurrency *uint32
}
type PublicDecryption struct {
	ClearValues           map[common.Hash]ClearValue
	ABIEncodedClearValues []byte
	DecryptionProof       []byte
}
type BatchItem struct {
	EncryptedValue  common.Hash
	ContractAddress common.Address
	Value           *ClearValue
	Error           *SDKError
}

func inputsWire(inputs []EncryptedInput) []*pb.EncryptedInput {
	result := make([]*pb.EncryptedInput, len(inputs))
	for i, input := range inputs {
		result[i] = &pb.EncryptedInput{EncryptedValue: input.EncryptedValue.Bytes(), ContractAddress: input.ContractAddress.Bytes()}
	}
	return result
}
func optionalAddress(address *common.Address) []byte {
	if address == nil {
		return nil
	}
	return address.Bytes()
}
func clearValue(value *pb.ClearValue) (ClearValue, error) {
	if value == nil {
		return ClearValue{}, errors.New("missing clear value")
	}
	switch v := value.Value.(type) {
	case *pb.ClearValue_BigintValue:
		n, ok := new(big.Int).SetString(v.BigintValue, 10)
		if !ok || n.String() != v.BigintValue {
			return ClearValue{}, errors.New("invalid bigint encoding")
		}
		return ClearValue{Kind: ClearBigInt, Integer: n}, nil
	case *pb.ClearValue_BoolValue:
		return ClearValue{Kind: ClearBool, Boolean: v.BoolValue}, nil
	case *pb.ClearValue_StringValue:
		return ClearValue{Kind: ClearString, Text: v.StringValue}, nil
	case *pb.ClearValue_NumberValue:
		return ClearValue{Kind: ClearNumber, Number: v.NumberValue}, nil
	case *pb.ClearValue_UndefinedValue:
		return ClearValue{Kind: ClearUndefined}, nil
	default:
		return ClearValue{}, errors.New("unknown clear value type")
	}
}
func clearEntries(entries []*pb.ClearEntry) (map[common.Hash]ClearValue, error) {
	values := make(map[common.Hash]ClearValue, len(entries))
	for _, entry := range entries {
		if entry == nil {
			return nil, errors.New("invalid encrypted value in response")
		}
		handle, err := hashFromWire(entry.EncryptedValue, "invalid encrypted value in response")
		if err != nil {
			return nil, err
		}
		value, err := clearValue(entry.Value)
		if err != nil {
			return nil, err
		}
		if _, exists := values[handle]; exists {
			return nil, errors.New("duplicate encrypted value in response")
		}
		values[handle] = value
	}
	return values, nil
}
func (s *SDKContext) DecryptValues(ctx context.Context, inputs []EncryptedInput, options DecryptOptions) (map[common.Hash]ClearValue, error) {
	response, err := call(ctx, s, func(ctx context.Context, op *pb.Operation, trailer grpc.CallOption) (*pb.DecryptValuesResponse, error) {
		return s.client.rpc.DecryptValues(ctx, &pb.DecryptValuesRequest{Operation: op, Inputs: inputsWire(inputs), TimeoutMs: options.TimeoutMS}, trailer)
	})
	if err != nil {
		return nil, err
	}
	return clearEntries(response.Values)
}
func (s *SDKContext) DelegatedDecryptValues(ctx context.Context, inputs []EncryptedInput, delegator common.Address, options DelegatedDecryptOptions) (map[common.Hash]ClearValue, error) {
	response, err := call(ctx, s, func(ctx context.Context, op *pb.Operation, trailer grpc.CallOption) (*pb.DelegatedDecryptValuesResponse, error) {
		return s.client.rpc.DelegatedDecryptValues(ctx, &pb.DelegatedDecryptValuesRequest{Operation: op, Inputs: inputsWire(inputs), DelegatorAddress: delegator.Bytes(), AccountAddress: optionalAddress(options.AccountAddress), WaitForPropagation: options.WaitForPropagation}, trailer)
	})
	if err != nil {
		return nil, err
	}
	return clearEntries(response.Values)
}
func (s *SDKContext) DecryptPublicValues(ctx context.Context, handles []common.Hash, options DecryptOptions) (*PublicDecryption, error) {
	values := make([][]byte, len(handles))
	for i, h := range handles {
		values[i] = h.Bytes()
	}
	response, err := call(ctx, s, func(ctx context.Context, op *pb.Operation, trailer grpc.CallOption) (*pb.DecryptPublicValuesResponse, error) {
		return s.client.rpc.DecryptPublicValues(ctx, &pb.DecryptPublicValuesRequest{Operation: op, EncryptedValues: values, TimeoutMs: options.TimeoutMS}, trailer)
	})
	if err != nil {
		return nil, err
	}
	clear, err := clearEntries(response.Values)
	if err != nil {
		return nil, err
	}
	return &PublicDecryption{ClearValues: clear, ABIEncodedClearValues: response.AbiEncodedClearValues, DecryptionProof: response.DecryptionProof}, nil
}
func (s *SDKContext) DelegatedBatchDecryptValues(ctx context.Context, inputs []EncryptedInput, delegator common.Address, options DelegatedBatchOptions) ([]BatchItem, error) {
	response, err := call(ctx, s, func(ctx context.Context, op *pb.Operation, trailer grpc.CallOption) (*pb.DelegatedBatchDecryptValuesResponse, error) {
		return s.client.rpc.DelegatedBatchDecryptValues(ctx, &pb.DelegatedBatchDecryptValuesRequest{Operation: op, Inputs: inputsWire(inputs), DelegatorAddress: delegator.Bytes(), AccountAddress: optionalAddress(options.AccountAddress), WaitForPropagation: options.WaitForPropagation, MaxConcurrency: options.MaxConcurrency}, trailer)
	})
	if err != nil {
		return nil, err
	}
	items := make([]BatchItem, len(response.Items))
	for i, item := range response.Items {
		if item == nil {
			return nil, errors.New("invalid batch response address")
		}
		encryptedValue, err := hashFromWire(item.EncryptedValue, "invalid batch response address")
		if err != nil {
			return nil, err
		}
		contractAddress, err := addressFromWire(item.ContractAddress, "invalid batch response address")
		if err != nil {
			return nil, err
		}
		items[i] = BatchItem{EncryptedValue: encryptedValue, ContractAddress: contractAddress}
		switch result := item.Result.(type) {
		case *pb.BatchItem_Value:
			value, err := clearValue(result.Value)
			if err != nil {
				return nil, err
			}
			items[i].Value = &value
		case *pb.BatchItem_Error:
			if result.Error == nil {
				return nil, errors.New("missing batch item error")
			}
			items[i].Error = sdkError(result.Error)
		default:
			return nil, errors.New("batch item must contain a value or error")
		}
	}
	return items, nil
}
