package sidecar

import (
	"context"
	"errors"
	"math/big"
	"reflect"

	"github.com/ethereum/go-ethereum/common"
	pb "github.com/zama-ai/sdk/clients/go/gen/zama/sdk/v1alpha1"
	"google.golang.org/grpc"
)

type IntegerType string

const (
	EUint8   IntegerType = "euint8"
	EUint16  IntegerType = "euint16"
	EUint32  IntegerType = "euint32"
	EUint64  IntegerType = "euint64"
	EUint128 IntegerType = "euint128"
	EUint256 IntegerType = "euint256"
)

type EncryptInput interface {
	encryptWire() (*pb.EncryptInput, error)
}

type IntegerInput struct {
	Type  IntegerType
	Value *big.Int
}
type BoolInput struct{ Value bool }
type BoolBigIntInput struct{ Value *big.Int }
type AddressInput struct{ Value common.Address }

type EncryptParams struct {
	Values          []EncryptInput
	ContractAddress common.Address
	UserAddress     common.Address
}
type EncryptOptions struct{ TimeoutMS *uint32 }
type EncryptResult struct {
	EncryptedValues []common.Hash
	InputProof      []byte
}

func integerEncryptWire(kind string, value *big.Int) (*pb.EncryptInput, error) {
	if value == nil {
		return nil, errors.New("encryption integer is nil")
	}
	return &pb.EncryptInput{Type: kind, Value: &pb.EncryptInput_BigintValue{BigintValue: value.String()}}, nil
}
func (v IntegerInput) encryptWire() (*pb.EncryptInput, error) {
	return integerEncryptWire(string(v.Type), v.Value)
}
func (v BoolBigIntInput) encryptWire() (*pb.EncryptInput, error) {
	return integerEncryptWire("ebool", v.Value)
}
func (v BoolInput) encryptWire() (*pb.EncryptInput, error) {
	return &pb.EncryptInput{Type: "ebool", Value: &pb.EncryptInput_BoolValue{BoolValue: v.Value}}, nil
}
func (v AddressInput) encryptWire() (*pb.EncryptInput, error) {
	return &pb.EncryptInput{Type: "eaddress", Value: &pb.EncryptInput_AddressValue{AddressValue: v.Value.Bytes()}}, nil
}

func (s *SDKContext) Encrypt(ctx context.Context, params EncryptParams, options EncryptOptions) (*EncryptResult, error) {
	values := make([]*pb.EncryptInput, len(params.Values))
	for i, value := range params.Values {
		if value == nil || (reflect.ValueOf(value).Kind() == reflect.Pointer && reflect.ValueOf(value).IsNil()) {
			return nil, errors.New("encryption input is nil")
		}
		encoded, err := value.encryptWire()
		if err != nil {
			return nil, err
		}
		values[i] = encoded
	}
	response, err := call(ctx, s, func(ctx context.Context, op *pb.Operation, trailer grpc.CallOption) (*pb.EncryptResponse, error) {
		return s.client.rpc.Encrypt(ctx, &pb.EncryptRequest{Operation: op, Values: values, ContractAddress: params.ContractAddress.Bytes(), UserAddress: params.UserAddress.Bytes(), TimeoutMs: options.TimeoutMS}, trailer)
	})
	if err != nil {
		return nil, err
	}
	result := &EncryptResult{EncryptedValues: make([]common.Hash, len(response.EncryptedValues)), InputProof: response.InputProof}
	for i, value := range response.EncryptedValues {
		if len(value) != common.HashLength {
			return nil, errors.New("invalid encrypted value in response")
		}
		result.EncryptedValues[i] = common.BytesToHash(value)
	}
	return result, nil
}
