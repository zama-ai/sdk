package zama

import (
	"context"
	"errors"
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/common"
	pb "github.com/zama-ai/sdk/clients/go/v3/internal/gen/zama/sdk/v1beta1"
	"google.golang.org/grpc"
)

type EncryptInput struct {
	wire *pb.EncryptInput
	err  error
}

type EncryptParams struct {
	Values          []EncryptInput
	ContractAddress common.Address
	UserAddress     common.Address
}

type EncryptOptions struct {
	// TimeoutMS is the SDK relayer timeout, not the ctx deadline; nil keeps the SDK default.
	TimeoutMS *uint32
}

type EncryptResult struct {
	EncryptedValues []common.Hash
	InputProof      []byte
}

func Ebool(value bool) EncryptInput {
	return EncryptInput{wire: &pb.EncryptInput{Value: &pb.EncryptInput_Ebool{Ebool: value}}}
}

func EboolBigInt(value *big.Int) EncryptInput {
	if value == nil {
		return EncryptInput{err: errors.New("ebool value is nil")}
	}
	return EncryptInput{wire: &pb.EncryptInput{Value: &pb.EncryptInput_EboolBigint{EboolBigint: value.String()}}}
}

func Euint8(value *big.Int) EncryptInput {
	if value == nil {
		return EncryptInput{err: errors.New("euint8 value is nil")}
	}
	return EncryptInput{wire: &pb.EncryptInput{Value: &pb.EncryptInput_Euint8{Euint8: value.String()}}}
}

func Euint16(value *big.Int) EncryptInput {
	if value == nil {
		return EncryptInput{err: errors.New("euint16 value is nil")}
	}
	return EncryptInput{wire: &pb.EncryptInput{Value: &pb.EncryptInput_Euint16{Euint16: value.String()}}}
}

func Euint32(value *big.Int) EncryptInput {
	if value == nil {
		return EncryptInput{err: errors.New("euint32 value is nil")}
	}
	return EncryptInput{wire: &pb.EncryptInput{Value: &pb.EncryptInput_Euint32{Euint32: value.String()}}}
}

func Euint64(value *big.Int) EncryptInput {
	if value == nil {
		return EncryptInput{err: errors.New("euint64 value is nil")}
	}
	return EncryptInput{wire: &pb.EncryptInput{Value: &pb.EncryptInput_Euint64{Euint64: value.String()}}}
}

func Euint128(value *big.Int) EncryptInput {
	if value == nil {
		return EncryptInput{err: errors.New("euint128 value is nil")}
	}
	return EncryptInput{wire: &pb.EncryptInput{Value: &pb.EncryptInput_Euint128{Euint128: value.String()}}}
}

func Euint256(value *big.Int) EncryptInput {
	if value == nil {
		return EncryptInput{err: errors.New("euint256 value is nil")}
	}
	return EncryptInput{wire: &pb.EncryptInput{Value: &pb.EncryptInput_Euint256{Euint256: value.String()}}}
}

func Eaddress(value common.Address) EncryptInput {
	return EncryptInput{wire: &pb.EncryptInput{Value: &pb.EncryptInput_Eaddress{Eaddress: value.Bytes()}}}
}

func (s *SDKContext) Encrypt(ctx context.Context, params EncryptParams, options EncryptOptions) (*EncryptResult, error) {
	values := make([]*pb.EncryptInput, len(params.Values))
	for i, value := range params.Values {
		if value.err != nil {
			return nil, fmt.Errorf("encryption input %d: %w", i, value.err)
		}
		if value.wire == nil {
			return nil, fmt.Errorf("encryption input %d: missing value", i)
		}
		values[i] = value.wire
	}
	response, err := call(ctx, s, func(ctx context.Context, op *pb.Operation, trailer grpc.CallOption) (*pb.EncryptResponse, error) {
		return s.client.rpc.Encrypt(ctx, &pb.EncryptRequest{
			Operation:       op,
			Values:          values,
			ContractAddress: params.ContractAddress.Bytes(),
			UserAddress:     params.UserAddress.Bytes(),
			TimeoutMs:       options.TimeoutMS,
		}, trailer)
	})
	if err != nil {
		return nil, err
	}
	if len(response.EncryptedValues) != len(params.Values) {
		return nil, errors.New("encrypted value count does not match inputs")
	}
	result := &EncryptResult{EncryptedValues: make([]common.Hash, len(response.EncryptedValues)), InputProof: response.InputProof}
	for i, value := range response.EncryptedValues {
		hash, err := hashFromWire(value, "invalid encrypted value in response")
		if err != nil {
			return nil, err
		}
		result.EncryptedValues[i] = hash
	}
	return result, nil
}
