package sidecar

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	pb "github.com/zama-ai/sdk/clients/go/gen/zama/sdk/v1alpha1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

func testClient(t *testing.T, service pb.SidecarServiceServer, interceptor grpc.UnaryServerInterceptor) *Client {
	t.Helper()
	// Short paths stay within macOS Unix-domain socket limits.
	dir, err := os.MkdirTemp("/tmp", "sdk-go-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
	socket := filepath.Join(dir, "s")
	listener, err := net.Listen("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	options := []grpc.ServerOption{}
	if interceptor != nil {
		options = append(options, grpc.UnaryInterceptor(interceptor))
	}
	server := grpc.NewServer(options...)
	pb.RegisterSidecarServiceServer(server, service)
	go server.Serve(listener)
	t.Cleanup(server.Stop)
	client, err := Dial(socket)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { client.Close() })
	return client
}
func testContext(t *testing.T) context.Context {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)
	return ctx
}
func unsignedSDK(t *testing.T, c *Client) *SDKContext {
	t.Helper()
	sdk, err := c.CreateContext(testContext(t), NewSDKConfig(11155111, "http://localhost"), SignerConfig{})
	if err != nil {
		t.Fatal(err)
	}
	return sdk
}
func TestRejectRelativeSocket(t *testing.T) {
	if _, err := Dial("relative.sock"); err == nil {
		t.Fatal("relative socket accepted")
	}
}

func TestClearValueTypesAndPrecision(t *testing.T) {
	large := "1606938044258990275541962092341162602522202993782792835301376"
	for _, test := range []struct {
		value *pb.ClearValue
		kind  ClearValueKind
		valid bool
	}{
		{&pb.ClearValue{Value: &pb.ClearValue_BigintValue{BigintValue: large}}, ClearBigInt, true},
		{&pb.ClearValue{Value: &pb.ClearValue_BoolValue{BoolValue: false}}, ClearBool, true},
		{&pb.ClearValue{Value: &pb.ClearValue_StringValue{StringValue: "0x1234"}}, ClearString, true},
		{&pb.ClearValue{Value: &pb.ClearValue_UndefinedValue{UndefinedValue: true}}, ClearUndefined, true},
		{&pb.ClearValue{Value: &pb.ClearValue_BigintValue{BigintValue: "01"}}, 0, false},
		{&pb.ClearValue{}, 0, false}, {nil, 0, false},
	} {
		value, err := clearValue(test.value)
		if test.valid {
			if err != nil || value.Kind != test.kind {
				t.Fatalf("wrong value: %#v %v", value, err)
			}
			if test.kind == ClearBigInt && value.Integer.String() != large {
				t.Fatal("bigint truncated")
			}
		} else if err == nil {
			t.Fatal("malformed value accepted")
		}
	}
}
func TestSDKContextParametersAndOptionalDefaults(t *testing.T) {
	var sequence atomic.Uint64
	requests := make(chan any, 32)
	client := testClient(t, &pb.UnimplementedSidecarServiceServer{}, func(_ context.Context, request any, info *grpc.UnaryServerInfo, _ grpc.UnaryHandler) (any, error) {
		if strings.HasSuffix(info.FullMethod, "/CreateContext") {
			requests <- request
			return &pb.CreateContextResponse{ContextId: fmt.Sprint(sequence.Add(1))}, nil
		}
		requests <- request
		switch request.(type) {
		case *pb.PreparePermitRequest:
			return &pb.PreparePermitResponse{PreparedPermitJson: "{}"}, nil
		case *pb.DecryptValuesRequest, *pb.DelegatedDecryptValuesRequest:
			return &pb.DecryptValuesResponse{}, nil
		case *pb.DecryptPublicValuesRequest:
			return &pb.DecryptPublicValuesResponse{AbiEncodedClearValues: []byte{1}, DecryptionProof: []byte{2}}, nil
		case *pb.DelegatedBatchDecryptValuesRequest:
			return &pb.DelegatedBatchDecryptValuesResponse{}, nil
		case *pb.ContractsRequest, *pb.DelegationContractsRequest:
			if strings.Contains(info.FullMethod, "/Has") {
				return &pb.HasPermitResponse{HasPermit: true}, nil
			}
		}
		return &pb.Empty{}, nil
	})
	ctx := testContext(t)
	first := unsignedSDK(t, client)
	created := (<-requests).(*pb.CreateContextRequest)
	if created.SignerEnabled || created.Account != nil {
		t.Fatal("read-only context gained signer")
	}
	second := unsignedSDK(t, client)
	<-requests
	if first.id == second.id {
		t.Fatal("contexts not isolated")
	}
	signer, delegator, contract := common.Address{1}, common.Address{2}, common.Address{3}
	for _, duration := range []*float64{nil, number(0), number(1.5)} {
		_, err := first.PreparePermit(ctx, signer, []common.Address{contract}, PreparePermitOptions{Delegator: &delegator, DurationDays: duration})
		if err != nil {
			t.Fatal(err)
		}
		r := (<-requests).(*pb.PreparePermitRequest)
		if !bytes.Equal(r.SignerAddress, signer.Bytes()) || !bytes.Equal(r.DelegatorAddress, delegator.Bytes()) || r.Operation.ContextId != first.id {
			t.Fatal("permit identity changed")
		}
		if (r.DurationDays == nil) != (duration == nil) || duration != nil && *r.DurationDays != *duration {
			t.Fatal("duration default changed")
		}
	}
	for _, contracts := range [][]common.Address{nil, {}, {contract}} {
		if err := first.RevokePermits(ctx, contracts); err != nil {
			t.Fatal(err)
		}
		r := (<-requests).(*pb.RevokePermitsRequest)
		if (r.Contracts == nil) != (contracts == nil) {
			t.Fatal("revoke omitted vs empty lost")
		}
	}
	wait := false
	if _, err := second.DelegatedDecryptValues(ctx, nil, delegator, DelegatedDecryptOptions{WaitForPropagation: &wait}); err != nil {
		t.Fatal(err)
	}
	r := (<-requests).(*pb.DelegatedDecryptValuesRequest)
	if r.AccountAddress != nil || r.WaitForPropagation == nil || *r.WaitForPropagation || r.Operation.ContextId != second.id {
		t.Fatal("delegation defaults changed")
	}
	if _, err := first.DelegatedBatchDecryptValues(ctx, nil, delegator, DelegatedBatchOptions{AccountAddress: &signer, MaxConcurrency: number(0)}); err != nil {
		t.Fatal(err)
	}
	batch := (<-requests).(*pb.DelegatedBatchDecryptValuesRequest)
	if batch.MaxConcurrency == nil || *batch.MaxConcurrency != 0 || !bytes.Equal(batch.AccountAddress, signer.Bytes()) || batch.WaitForPropagation != nil {
		t.Fatal("batch option presence changed")
	}
	if _, err := first.DecryptValues(ctx, nil, DecryptOptions{TimeoutMS: number(0)}); err != nil {
		t.Fatal(err)
	}
	direct := (<-requests).(*pb.DecryptValuesRequest)
	if direct.TimeoutMs == nil || *direct.TimeoutMs != 0 {
		t.Fatal("explicit zero timeout lost")
	}
	public, err := second.DecryptPublicValues(ctx, nil, DecryptOptions{})
	if err != nil {
		t.Fatal(err)
	}
	publicRequest := (<-requests).(*pb.DecryptPublicValuesRequest)
	if publicRequest.TimeoutMs != nil || !bytes.Equal(public.DecryptionProof, []byte{2}) || !bytes.Equal(public.ABIEncodedClearValues, []byte{1}) {
		t.Fatal("public proof or default lost")
	}
	if err := second.UpdateAccount(ctx, &WalletAccount{Address: signer, ChainID: 1}); err != nil {
		t.Fatal(err)
	}
	updated := (<-requests).(*pb.UpdateAccountRequest)
	if updated.Account.ChainId != 1 || !bytes.Equal(updated.Account.Address, signer.Bytes()) {
		t.Fatal("wallet update changed")
	}
	if err := second.UpdateAccount(ctx, nil); err != nil {
		t.Fatal(err)
	}
	if (<-requests).(*pb.UpdateAccountRequest).Account != nil {
		t.Fatal("wallet disconnect lost")
	}
	if err := first.RegisterPermit(ctx, "{}", []byte{1}); err != nil {
		t.Fatal("client prevalidated SDK signature")
	}
	<-requests
	for _, operation := range []func() error{
		func() error { return first.GrantPermit(ctx, []common.Address{contract}) },
		func() error { return first.GrantDelegationPermit(ctx, delegator, []common.Address{contract}) },
		func() error { _, err := first.HasPermit(ctx, []common.Address{contract}); return err },
		func() error {
			_, err := first.HasDelegationPermit(ctx, delegator, []common.Address{contract})
			return err
		},
		func() error { return first.ClearPermits(ctx) }, func() error { return first.WarmTransportKeyPair(ctx) },
		func() error { return first.WarmTransportKeyPairScope(ctx, "shared") }, func() error { return first.RevokeTransportKeyPair(ctx, "shared") },
		func() error { return first.Close(ctx) },
	} {
		if err := operation(); err != nil {
			t.Fatal(err)
		}
		<-requests
	}
}
func number(n float64) *float64 { return &n }
func TestRPCErrorTrailers(t *testing.T) {
	client := testClient(t, &pb.UnimplementedSidecarServiceServer{}, func(ctx context.Context, _ any, _ *grpc.UnaryServerInfo, _ grpc.UnaryHandler) (any, error) {
		grpc.SetTrailer(ctx, metadata.Pairs("zama-error-code", "RPC_RATE_LIMITED", "zama-error-retryable", "true", "zama-error-retry-after-seconds", "1.5"))
		return nil, status.Error(codes.ResourceExhausted, "slow down")
	})
	_, err := client.Info(testContext(t))
	var rpc *RPCError
	if !errors.As(err, &rpc) || rpc.Code != "RPC_RATE_LIMITED" || !rpc.Retryable || rpc.RetryAfterSeconds == nil || *rpc.RetryAfterSeconds != 1.5 || status.Code(err) != codes.ResourceExhausted || status.Code(errors.Unwrap(err)) != codes.ResourceExhausted {
		t.Fatalf("lost SDK error: %#v %v", rpc, err)
	}
}

func TestSDKNumberRemainsDistinctFromBigIntAcrossWire(t *testing.T) {
	client := testClient(t, &pb.UnimplementedSidecarServiceServer{}, func(_ context.Context, request any, _ *grpc.UnaryServerInfo, _ grpc.UnaryHandler) (any, error) {
		if _, ok := request.(*pb.CreateContextRequest); ok {
			return &pb.CreateContextResponse{ContextId: "number-context"}, nil
		}
		return &pb.DecryptValuesResponse{Values: []*pb.ClearEntry{
			{EncryptedValue: common.Hash{1}.Bytes(), Value: &pb.ClearValue{Value: &pb.ClearValue_NumberValue{NumberValue: 4294967295}}},
			{EncryptedValue: common.Hash{2}.Bytes(), Value: &pb.ClearValue{Value: &pb.ClearValue_BigintValue{BigintValue: "4294967295"}}},
		}}, nil
	})
	sdk := unsignedSDK(t, client)
	values, err := sdk.DecryptValues(testContext(t), []EncryptedInput{{EncryptedValue: common.Hash{1}}, {EncryptedValue: common.Hash{2}}}, DecryptOptions{})
	if err != nil {
		t.Fatal(err)
	}
	number, integer := values[common.Hash{1}], values[common.Hash{2}]
	if number.Kind != ClearNumber || number.Number != 4294967295 || number.Integer != nil {
		t.Fatalf("SDK number type or value changed: %#v", number)
	}
	if integer.Kind != ClearBigInt || integer.Integer.String() != "4294967295" {
		t.Fatalf("SDK bigint type or value changed: %#v", integer)
	}
}
