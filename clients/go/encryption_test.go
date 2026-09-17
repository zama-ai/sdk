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
			handles := make([][]byte, len(req.Values))
			for i := range handles {
				handles[i] = handle
			}
			return &pb.EncryptResponse{EncryptedValues: handles, InputProof: []byte{0, 255, 1}}, nil
		}
		return &pb.CreateContextResponse{ContextId: "encrypt"}, nil
	})
	sdk := unsignedSDK(t, client)
	large := new(big.Int).Lsh(big.NewInt(1), 255)
	params := EncryptParams{ContractAddress: common.HexToAddress("0x1111111111111111111111111111111111111111"), UserAddress: common.HexToAddress("0x2222222222222222222222222222222222222222")}
	params.Values = []EncryptInput{
		Euint8(large), Euint16(large), Euint32(large), Euint64(large), Euint128(large), Euint256(large),
		Ebool(false), Ebool(true), EboolBigInt(big.NewInt(0)), EboolBigInt(big.NewInt(1)),
		Eaddress(params.UserAddress), Euint8(big.NewInt(-1)),
	}
	result, err := sdk.Encrypt(testContext(t), params, EncryptOptions{})
	if err != nil {
		t.Fatal(err)
	}
	req := <-requests
	if req.TimeoutMs != nil || req.Operation.ContextId != "encrypt" || req.Operation.OperationId == "" || !bytes.Equal(req.ContractAddress, params.ContractAddress.Bytes()) || !bytes.Equal(req.UserAddress, params.UserAddress.Bytes()) {
		t.Fatalf("parameters lost: %v", req)
	}
	integers := []string{req.Values[0].GetEuint8(), req.Values[1].GetEuint16(), req.Values[2].GetEuint32(), req.Values[3].GetEuint64(), req.Values[4].GetEuint128(), req.Values[5].GetEuint256()}
	for _, value := range integers {
		if value != large.String() {
			t.Fatal("integer lost precision/type")
		}
	}
	if _, ok := req.Values[6].Value.(*pb.EncryptInput_Ebool); !ok || req.Values[6].GetEbool() || !req.Values[7].GetEbool() {
		t.Fatal("boolean representation lost")
	}
	if req.Values[8].GetEboolBigint() != "0" || req.Values[9].GetEboolBigint() != "1" || req.Values[11].GetEuint8() != "-1" || !bytes.Equal(req.Values[10].GetEaddress(), params.UserAddress.Bytes()) {
		t.Fatal("input representation lost")
	}
	if len(result.EncryptedValues) != len(params.Values) || result.EncryptedValues[0] != common.BytesToHash(handle) || !bytes.Equal(result.InputProof, []byte{0, 255, 1}) {
		t.Fatal("result changed")
	}
	for _, timeout := range []uint32{0, 500} {
		if _, err := sdk.Encrypt(testContext(t), EncryptParams{}, EncryptOptions{TimeoutMS: &timeout}); err != nil {
			t.Fatal(err)
		}
		req = <-requests
		if req.TimeoutMs == nil || *req.TimeoutMs != timeout || len(req.Values) != 0 {
			t.Fatalf("explicit timeout or empty inputs changed: %v", req)
		}
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
	if _, err := unsignedSDK(t, client).Encrypt(testContext(t), EncryptParams{Values: []EncryptInput{Ebool(true)}}, EncryptOptions{}); err == nil {
		t.Fatal("malformed handle accepted")
	}
}

func TestEncryptRejectsHandleCountMismatch(t *testing.T) {
	handle := bytes.Repeat([]byte{0xab}, 32)
	client := testClient(t, &pb.UnimplementedSidecarServiceServer{}, func(_ context.Context, request any, _ *grpc.UnaryServerInfo, _ grpc.UnaryHandler) (any, error) {
		if _, ok := request.(*pb.EncryptRequest); ok {
			return &pb.EncryptResponse{EncryptedValues: [][]byte{handle}}, nil
		}
		return &pb.CreateContextResponse{ContextId: "encrypt"}, nil
	})
	params := EncryptParams{Values: []EncryptInput{Ebool(true), Ebool(false)}}
	if _, err := unsignedSDK(t, client).Encrypt(testContext(t), params, EncryptOptions{}); err == nil {
		t.Fatal("handle count mismatch accepted")
	}
}

func TestEncryptRejectsAbsentInputs(t *testing.T) {
	for _, absent := range []struct {
		name    string
		input   EncryptInput
		message string
	}{
		{"zero value", EncryptInput{}, "encryption input 1: missing value"},
		{"nil integer", Euint64(nil), "encryption input 1: euint64 value is nil"},
		{"nil boolean integer", EboolBigInt(nil), "encryption input 1: ebool value is nil"},
	} {
		t.Run(absent.name, func(t *testing.T) {
			params := EncryptParams{Values: []EncryptInput{Ebool(true), absent.input}}
			_, err := (&SDKContext{}).Encrypt(context.Background(), params, EncryptOptions{})
			if err == nil || err.Error() != absent.message {
				t.Fatalf("absent input accepted: %v", err)
			}
		})
	}
}
