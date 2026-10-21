package zama

import (
	"bytes"
	"context"
	"errors"
	"math"
	"math/big"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	pb "github.com/zama-ai/sdk/clients/go/v3/internal/gen/zama/sdk/v1beta1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

func TestOfflineEveryKindWire(t *testing.T) {
	from, token, to := common.Address{1}, common.Address{2}, common.Address{3}
	large, _ := new(big.Int).SetString("1606938044258990275541962092341162602522202993782792835301376", 10)
	expiry := time.UnixMilli(1900000000123)
	tests := []struct {
		request TransactionRequest
		kind    TransactionKind
		want    string
	}{
		{ConfidentialTransferRequest{from, token, to, large}, TransactionConfidentialTransfer, `{"confidentialTransfer":{"token":"AgAAAAAAAAAAAAAAAAAAAAAAAAA=","to":"AwAAAAAAAAAAAAAAAAAAAAAAAAA=","amount":"1606938044258990275541962092341162602522202993782792835301376"}}`},
		{ConfidentialTransferFromRequest{from, token, from, to, large}, TransactionConfidentialTransferFrom, `{"confidentialTransferFrom":{"token":"AgAAAAAAAAAAAAAAAAAAAAAAAAA=","owner":"AQAAAAAAAAAAAAAAAAAAAAAAAAA=","to":"AwAAAAAAAAAAAAAAAAAAAAAAAAA=","amount":"1606938044258990275541962092341162602522202993782792835301376"}}`},
		{SetOperatorRequest{from, token, to, nonce(1)}, TransactionSetOperator, `{"setOperator":{"token":"AgAAAAAAAAAAAAAAAAAAAAAAAAA=","operator":"AwAAAAAAAAAAAAAAAAAAAAAAAAA=","until":1}}`},
		{UnwrapRequest{from, token, to, large}, TransactionUnwrap, `{"unwrap":{"token":"AgAAAAAAAAAAAAAAAAAAAAAAAAA=","to":"AwAAAAAAAAAAAAAAAAAAAAAAAAA=","amount":"1606938044258990275541962092341162602522202993782792835301376"}}`},
		{UnwrapAllRequest{from, token, to}, TransactionUnwrapAll, `{"unwrapAll":{"token":"AgAAAAAAAAAAAAAAAAAAAAAAAAA=","to":"AwAAAAAAAAAAAAAAAAAAAAAAAAA="}}`},
		{FinalizeUnwrapRequest{from, token, []byte{0, 1, 255}}, TransactionFinalizeUnwrap, `{"finalizeUnwrap":{"wrapper":"AgAAAAAAAAAAAAAAAAAAAAAAAAA=","unwrapRequestIdOrAmount":"AAH/"}}`},
		{ApproveUnderlyingRequest{from, token, to, large}, TransactionApproveUnderlying, `{"approveUnderlying":{"underlying":"AgAAAAAAAAAAAAAAAAAAAAAAAAA=","spender":"AwAAAAAAAAAAAAAAAAAAAAAAAAA=","amount":"1606938044258990275541962092341162602522202993782792835301376"}}`},
		{WrapRequest{from, token, to, large}, TransactionWrap, `{"wrap":{"wrapper":"AgAAAAAAAAAAAAAAAAAAAAAAAAA=","to":"AwAAAAAAAAAAAAAAAAAAAAAAAAA=","amount":"1606938044258990275541962092341162602522202993782792835301376"}}`},
		{TransferAndCallRequest{from, token, to, large, []byte{}}, TransactionTransferAndCall, `{"transferAndCall":{"underlying":"AgAAAAAAAAAAAAAAAAAAAAAAAAA=","wrapper":"AwAAAAAAAAAAAAAAAAAAAAAAAAA=","amount":"1606938044258990275541962092341162602522202993782792835301376","recipientData":""}}`},
		{DelegateDecryptionRequest{from, token, to, &expiry}, TransactionDelegateDecryption, `{"delegateDecryption":{"contractAddress":"AgAAAAAAAAAAAAAAAAAAAAAAAAA=","delegateAddress":"AwAAAAAAAAAAAAAAAAAAAAAAAAA=","expirationDateMs":"1900000000123"}}`},
		{RevokeDelegationRequest{from, token, to}, TransactionRevokeDelegation, `{"revokeDelegation":{"contractAddress":"AgAAAAAAAAAAAAAAAAAAAAAAAAA=","delegateAddress":"AwAAAAAAAAAAAAAAAAAAAAAAAAA="}}`},
	}
	for _, tt := range tests {
		t.Run(tt.kind.String(), func(t *testing.T) {
			requests := make(chan *pb.PrepareTransactionRequest, 1)
			unsigned := []byte{2, 0, 255, 128}
			client := testClient(t, &pb.UnimplementedDaemonServiceServer{}, func(_ context.Context, request any, _ *grpc.UnaryServerInfo, _ grpc.UnaryHandler) (any, error) {
				if wire, ok := request.(*pb.PrepareTransactionRequest); ok {
					requests <- wire
					return &pb.PrepareTransactionResponse{Kind: pb.TransactionKind(tt.kind), From: from.Bytes(), UnsignedTx: unsigned}, nil
				}
				return &pb.CreateContextResponse{ContextId: "offline"}, nil
			})
			prepared, err := unsignedSDK(t, client).PrepareTransaction(testContext(t), tt.request, &PrepareOptions{Nonce: nonce(0), GasLimit: nonce(0), Fees: &PrepareFees{MaxFeePerGas: large, MaxPriorityFeePerGas: big.NewInt(0)}})
			if err != nil {
				t.Fatal(err)
			}
			if prepared.Kind != tt.kind || prepared.From != from || !bytes.Equal(prepared.UnsignedTx, unsigned) {
				t.Fatalf("changed response: %#v", prepared)
			}
			wire := <-requests
			if wire.Operation.GetContextId() != "offline" || wire.Operation.GetOperationId() == "" {
				t.Fatal("missing operation identity")
			}
			want := &pb.PrepareTransactionRequest{}
			if err := protojson.Unmarshal([]byte(tt.want), want); err != nil {
				t.Fatal(err)
			}
			want.From = from.Bytes()
			want.Operation = wire.Operation
			zero := "0"
			want.Options = &pb.PrepareOptions{Nonce: nonce(0), GasLimit: &zero, Fees: &pb.PrepareFees{MaxFeePerGas: large.String(), MaxPriorityFeePerGas: "0"}}
			if !proto.Equal(wire, want) {
				t.Fatalf("wire mismatch\ngot %v\nwant %v", wire, want)
			}
		})
	}
}

func TestOfflinePresenceAndErrors(t *testing.T) {
	if omitted, err := prepareOptionsWire(nil); err != nil || omitted != nil {
		t.Fatal("omitted options became present")
	}
	empty, err := prepareOptionsWire(&PrepareOptions{})
	if err != nil || empty.Nonce != nil || empty.GasLimit != nil || empty.Fees != nil {
		t.Fatal("defaults populated")
	}
	if _, err := prepareOptionsWire(&PrepareOptions{Fees: &PrepareFees{MaxFeePerGas: big.NewInt(1)}}); err == nil {
		t.Fatal("missing priority fee accepted")
	}
	for _, request := range []TransactionRequest{ConfidentialTransferRequest{}, WrapRequest{}, SetOperatorRequest{}} {
		if _, err := request.prepareWire(); err == nil {
			t.Fatalf("missing required field accepted: %T", request)
		}
	}
	transferAndCall, err := (TransferAndCallRequest{Amount: big.NewInt(1)}).prepareWire()
	if err != nil || transferAndCall.GetTransferAndCall().RecipientData != nil {
		t.Fatalf("missing recipient became present: %v", err)
	}
	delegate, err := (DelegateDecryptionRequest{}).prepareWire()
	if err != nil || delegate.GetDelegateDecryption().ExpirationDateMs != nil {
		t.Fatalf("missing expiration became present: %v", err)
	}
	client := testClient(t, &pb.UnimplementedDaemonServiceServer{}, func(ctx context.Context, request any, _ *grpc.UnaryServerInfo, _ grpc.UnaryHandler) (any, error) {
		if _, ok := request.(*pb.PrepareTransactionRequest); ok {
			grpc.SetTrailer(ctx, metadata.Pairs("zama-error-code", "VALIDATION_ERROR", "zama-error-retryable", "false"))
			return nil, status.Error(codes.InvalidArgument, "invalid amount")
		}
		return &pb.CreateContextResponse{ContextId: "offline"}, nil
	})
	sdk := unsignedSDK(t, client)
	_, err = sdk.PrepareTransaction(testContext(t), ConfidentialTransferRequest{Amount: big.NewInt(1)}, nil)
	var details *RPCError
	if !errors.As(err, &details) || details.Code != "VALIDATION_ERROR" || status.Code(err) != codes.InvalidArgument {
		t.Fatalf("lost SDK error: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = sdk.PrepareTransaction(ctx, SetOperatorRequest{Until: nonce(1)}, nil)
	if status.Code(err) != codes.Canceled {
		t.Fatalf("lost cancellation: %v", err)
	}
}

func TestOfflineRejectsNilRequestAndMalformedSender(t *testing.T) {
	client := testClient(t, &pb.UnimplementedDaemonServiceServer{}, func(_ context.Context, request any, _ *grpc.UnaryServerInfo, _ grpc.UnaryHandler) (any, error) {
		if _, ok := request.(*pb.PrepareTransactionRequest); ok {
			return &pb.PrepareTransactionResponse{From: []byte{1}}, nil
		}
		return &pb.CreateContextResponse{ContextId: "offline"}, nil
	})
	sdk := unsignedSDK(t, client)
	if _, err := sdk.PrepareTransaction(testContext(t), nil, nil); err == nil {
		t.Fatal("nil request accepted")
	}
	if _, err := sdk.PrepareTransaction(testContext(t), SetOperatorRequest{Until: nonce(1)}, nil); err == nil {
		t.Fatal("malformed sender accepted")
	}
}

func TestOfflineRejectsUnspecifiedOrUnknownKind(t *testing.T) {
	tests := []struct {
		kind pb.TransactionKind
		want string
	}{
		{pb.TransactionKind_TRANSACTION_KIND_UNSPECIFIED, "prepared transaction has no kind"},
		{pb.TransactionKind(99), "prepared transaction has an unknown kind"},
	}
	for _, tt := range tests {
		client := testClient(t, &pb.UnimplementedDaemonServiceServer{}, func(_ context.Context, request any, _ *grpc.UnaryServerInfo, _ grpc.UnaryHandler) (any, error) {
			if _, ok := request.(*pb.PrepareTransactionRequest); ok {
				return &pb.PrepareTransactionResponse{Kind: tt.kind, From: common.Address{1}.Bytes(), UnsignedTx: []byte{2}}, nil
			}
			return &pb.CreateContextResponse{ContextId: "offline"}, nil
		})
		_, err := unsignedSDK(t, client).PrepareTransaction(testContext(t), SetOperatorRequest{Until: nonce(1)}, nil)
		if err == nil || err.Error() != tt.want {
			t.Fatalf("kind %d: got %v, want %s", tt.kind, err, tt.want)
		}
	}
}

func TestOfflineExpiryMillisecondsAndRange(t *testing.T) {
	preserved := time.UnixMilli(1900000000123)
	wire, err := (DelegateDecryptionRequest{ExpirationDate: &preserved}).prepareWire()
	if err != nil {
		t.Fatal(err)
	}
	if expiration := wire.GetDelegateDecryption().ExpirationDateMs; expiration == nil || *expiration != 1900000000123 {
		t.Fatalf("expiry changed: %v", expiration)
	}
	for _, rejected := range []time.Time{time.Unix(-1, 0), time.Date(300000000, 1, 1, 0, 0, 0, 0, time.UTC)} {
		if _, err := (DelegateDecryptionRequest{ExpirationDate: &rejected}).prepareWire(); err == nil {
			t.Fatalf("unrepresentable expiry accepted: %v", rejected)
		}
	}
}

func nonce(value uint64) *uint64 { return &value }

func TestOfflineQuantityBounds(t *testing.T) {
	maxU256 := new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), 256), big.NewInt(1))
	wire, err := prepareOptionsWire(&PrepareOptions{GasLimit: nonce(math.MaxUint64), Fees: &PrepareFees{MaxFeePerGas: maxU256, MaxPriorityFeePerGas: maxU256}})
	if err != nil || wire.GetGasLimit() != "18446744073709551615" || wire.Fees.MaxFeePerGas != maxU256.String() || wire.Fees.MaxPriorityFeePerGas != maxU256.String() {
		t.Fatalf("max quantities changed: %v %v", wire, err)
	}
	amount, err := (WrapRequest{Amount: maxU256}).prepareWire()
	if err != nil || amount.GetWrap().Amount != maxU256.String() {
		t.Fatalf("max amount changed: %v", err)
	}
	for name, value := range map[string]*big.Int{"negative": big.NewInt(-1), "overflow": new(big.Int).Lsh(big.NewInt(1), 256)} {
		t.Run(name, func(t *testing.T) {
			for field, options := range map[string]*PrepareOptions{
				"max fee per gas":          {Fees: &PrepareFees{MaxFeePerGas: value, MaxPriorityFeePerGas: big.NewInt(0)}},
				"max priority fee per gas": {Fees: &PrepareFees{MaxFeePerGas: big.NewInt(0), MaxPriorityFeePerGas: value}},
			} {
				if _, err := prepareOptionsWire(options); err == nil || err.Error() != field+" must fit uint256" {
					t.Fatalf("%s accepted or misreported: %v", field, err)
				}
			}
			if _, err := (ConfidentialTransferRequest{Amount: value}).prepareWire(); err == nil || err.Error() != "amount must fit uint256" {
				t.Fatalf("amount accepted or misreported: %v", err)
			}
		})
	}
}
