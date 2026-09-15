package sidecar

import (
	"bytes"
	"context"
	"errors"
	"math/big"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	pb "github.com/zama-ai/sdk/clients/go/gen/zama/sdk/v1alpha1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

func TestEncryptWire(t *testing.T) {
	requests := make(chan *pb.EncryptRequest, 4)
	handle := bytes.Repeat([]byte{0xab}, 32)
	client := testClient(t, &pb.UnimplementedSidecarServiceServer{}, func(_ context.Context, request any, _ *grpc.UnaryServerInfo, _ grpc.UnaryHandler) (any, error) {
		if req, ok := request.(*pb.EncryptRequest); ok {
			requests <- req
			return &pb.EncryptResponse{EncryptedValues: [][]byte{handle}, InputProof: []byte{0, 255, 1}}, nil
		}
		return &pb.CreateContextResponse{ContextId: "encrypt"}, nil
	})
	sdk := unsignedSDK(t, client)
	large := new(big.Int).Lsh(big.NewInt(1), 255)
	params := EncryptParams{ContractAddress: common.HexToAddress("0x1111111111111111111111111111111111111111"), UserAddress: common.HexToAddress("0x2222222222222222222222222222222222222222")}
	types := []IntegerType{EUint8, EUint16, EUint32, EUint64, EUint128, EUint256}
	for _, typ := range types {
		params.Values = append(params.Values, IntegerInput{Type: typ, Value: large})
	}
	params.Values = append(params.Values, BoolInput{Value: false}, BoolInput{Value: true}, BoolBigIntInput{Value: big.NewInt(0)}, BoolBigIntInput{Value: big.NewInt(1)}, AddressInput{Value: params.UserAddress}, IntegerInput{Type: EUint8, Value: big.NewInt(-1)})
	result, err := sdk.Encrypt(testContext(t), params, EncryptOptions{})
	if err != nil {
		t.Fatal(err)
	}
	req := <-requests
	if req.TimeoutMs != nil || req.Operation.ContextId != "encrypt" || req.Operation.OperationId == "" || !bytes.Equal(req.ContractAddress, params.ContractAddress.Bytes()) || !bytes.Equal(req.UserAddress, params.UserAddress.Bytes()) {
		t.Fatalf("parameters lost: %v", req)
	}
	for i, typ := range types {
		if req.Values[i].GetBigintValue() != large.String() || req.Values[i].Type != string(typ) {
			t.Fatal("integer lost precision/type")
		}
	}
	if _, ok := req.Values[6].Value.(*pb.EncryptInput_BoolValue); !ok || req.Values[6].GetBoolValue() || !req.Values[7].GetBoolValue() {
		t.Fatal("boolean representation lost")
	}
	if req.Values[8].GetBigintValue() != "0" || req.Values[9].GetBigintValue() != "1" || req.Values[11].GetBigintValue() != "-1" || !bytes.Equal(req.Values[10].GetAddressValue(), params.UserAddress.Bytes()) {
		t.Fatal("input representation lost")
	}
	if len(result.EncryptedValues) != 1 || result.EncryptedValues[0] != common.BytesToHash(handle) || !bytes.Equal(result.InputProof, []byte{0, 255, 1}) {
		t.Fatal("result changed")
	}
	zero := uint32(0)
	if _, err := sdk.Encrypt(testContext(t), EncryptParams{}, EncryptOptions{TimeoutMS: &zero}); err != nil {
		t.Fatal(err)
	}
	req = <-requests
	if req.TimeoutMs == nil || *req.TimeoutMs != 0 || len(req.Values) != 0 {
		t.Fatal("explicit zero or empty inputs changed")
	}
}

func TestEncryptErrorsAndCancellation(t *testing.T) {
	started, cancelled := make(chan struct{}, 1), make(chan struct{}, 1)
	client := testClient(t, &pb.UnimplementedSidecarServiceServer{}, func(ctx context.Context, request any, _ *grpc.UnaryServerInfo, _ grpc.UnaryHandler) (any, error) {
		if req, ok := request.(*pb.EncryptRequest); ok {
			if req.TimeoutMs != nil {
				grpc.SetTrailer(ctx, metadata.Pairs("zama-error-code", "RELAYER_REQUEST_FAILED", "zama-error-retryable", "true", "zama-error-retry-after-seconds", "7"))
				return nil, status.Error(codes.Unavailable, "fixture failure")
			}
			started <- struct{}{}
			<-ctx.Done()
			cancelled <- struct{}{}
			return nil, ctx.Err()
		}
		return &pb.CreateContextResponse{ContextId: "encrypt"}, nil
	})
	sdk := unsignedSDK(t, client)
	timeout := uint32(13)
	_, err := sdk.Encrypt(testContext(t), EncryptParams{}, EncryptOptions{TimeoutMS: &timeout})
	var rpc *RPCError
	if !errors.As(err, &rpc) || rpc.Code != "RELAYER_REQUEST_FAILED" || !rpc.Retryable || rpc.RetryAfterSeconds == nil || *rpc.RetryAfterSeconds != 7 || status.Code(err) != codes.Unavailable {
		t.Fatalf("structured error lost: %#v", err)
	}
	ctx, cancel := context.WithCancel(testContext(t))
	defer cancel()
	done := make(chan error, 1)
	go func() { _, err := sdk.Encrypt(ctx, EncryptParams{}, EncryptOptions{}); done <- err }()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("request did not start")
	}
	cancel()
	if err := <-done; status.Code(err) != codes.Canceled {
		t.Fatalf("unexpected cancellation: %v", err)
	}
	select {
	case <-cancelled:
	case <-time.After(time.Second):
		t.Fatal("server not cancelled")
	}
}

func TestEncryptRejectsMalformedHandle(t *testing.T) {
	client := testClient(t, &pb.UnimplementedSidecarServiceServer{}, func(_ context.Context, request any, _ *grpc.UnaryServerInfo, _ grpc.UnaryHandler) (any, error) {
		if _, ok := request.(*pb.EncryptRequest); ok {
			return &pb.EncryptResponse{EncryptedValues: [][]byte{{1}}}, nil
		}
		return &pb.CreateContextResponse{ContextId: "encrypt"}, nil
	})
	if _, err := unsignedSDK(t, client).Encrypt(testContext(t), EncryptParams{}, EncryptOptions{}); err == nil {
		t.Fatal("malformed handle accepted")
	}
}

func TestEncryptRejectsAbsentInputs(t *testing.T) {
	var pointer *BoolInput
	for _, input := range []EncryptInput{nil, pointer, IntegerInput{Type: EUint64}, BoolBigIntInput{}} {
		if _, err := (&SDKContext{}).Encrypt(context.Background(), EncryptParams{Values: []EncryptInput{input}}, EncryptOptions{}); err == nil {
			t.Fatalf("absent input accepted: %#v", input)
		}
	}
}
