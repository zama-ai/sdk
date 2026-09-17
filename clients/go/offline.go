package sidecar

import (
	"context"
	"errors"
	"math"
	"math/big"
	"reflect"
	"time"

	"github.com/ethereum/go-ethereum/common"
	pb "github.com/zama-ai/sdk/clients/go/gen/zama/sdk/v1alpha1"
	"google.golang.org/grpc"
)

// TransactionRequest describes one SDK-prepared transaction, not a multi-step token workflow.
type TransactionRequest interface {
	prepareWire() (*pb.PrepareTransactionRequest, error)
}

type PrepareOptions struct {
	Nonce    *uint64
	GasLimit *big.Int
	Fees     *PrepareFees
}
type PrepareFees struct {
	MaxFeePerGas         *big.Int
	MaxPriorityFeePerGas *big.Int
}

// TransactionKind aliases the wire enum values; String renders the wire name.
type TransactionKind int32

const (
	TransactionConfidentialTransfer     = TransactionKind(pb.TransactionKind_TRANSACTION_KIND_CONFIDENTIAL_TRANSFER)
	TransactionConfidentialTransferFrom = TransactionKind(pb.TransactionKind_TRANSACTION_KIND_CONFIDENTIAL_TRANSFER_FROM)
	TransactionSetOperator              = TransactionKind(pb.TransactionKind_TRANSACTION_KIND_SET_OPERATOR)
	TransactionUnwrap                   = TransactionKind(pb.TransactionKind_TRANSACTION_KIND_UNWRAP)
	TransactionUnwrapAll                = TransactionKind(pb.TransactionKind_TRANSACTION_KIND_UNWRAP_ALL)
	TransactionFinalizeUnwrap           = TransactionKind(pb.TransactionKind_TRANSACTION_KIND_FINALIZE_UNWRAP)
	TransactionApproveUnderlying        = TransactionKind(pb.TransactionKind_TRANSACTION_KIND_APPROVE_UNDERLYING)
	TransactionWrap                     = TransactionKind(pb.TransactionKind_TRANSACTION_KIND_WRAP)
	TransactionTransferAndCall          = TransactionKind(pb.TransactionKind_TRANSACTION_KIND_TRANSFER_AND_CALL)
	TransactionDelegateDecryption       = TransactionKind(pb.TransactionKind_TRANSACTION_KIND_DELEGATE_DECRYPTION)
	TransactionRevokeDelegation         = TransactionKind(pb.TransactionKind_TRANSACTION_KIND_REVOKE_DELEGATION)
)

func (k TransactionKind) String() string { return pb.TransactionKind(k).String() }

func transactionKind(wire pb.TransactionKind) (TransactionKind, error) {
	if wire == pb.TransactionKind_TRANSACTION_KIND_UNSPECIFIED {
		return 0, errors.New("prepared transaction has no kind")
	}
	if _, known := pb.TransactionKind_name[int32(wire)]; !known {
		return 0, errors.New("prepared transaction has an unknown kind")
	}
	return TransactionKind(wire), nil
}

type PreparedTransaction struct {
	Kind       TransactionKind
	From       common.Address
	UnsignedTx []byte
}

// decimal reports a nil value as a missing field instead of sending an empty string the sidecar rejects.
func decimal(name string, value *big.Int) (string, error) {
	if value == nil {
		return "", errors.New(name + " is required")
	}
	return value.String(), nil
}
func prepareOptionsWire(options *PrepareOptions) (*pb.PrepareOptions, error) {
	if options == nil {
		return nil, nil
	}
	result := &pb.PrepareOptions{Nonce: options.Nonce}
	if options.GasLimit != nil {
		value := options.GasLimit.String()
		result.GasLimit = &value
	}
	if options.Fees != nil {
		maxFee, err := decimal("max fee per gas", options.Fees.MaxFeePerGas)
		if err != nil {
			return nil, err
		}
		priority, err := decimal("max priority fee per gas", options.Fees.MaxPriorityFeePerGas)
		if err != nil {
			return nil, err
		}
		result.Fees = &pb.PrepareFees{MaxFeePerGas: maxFee, MaxPriorityFeePerGas: priority}
	}
	return result, nil
}

// PrepareTransaction leaves signing and broadcasting to the caller; SDK validation and defaults apply.
func (s *SDKContext) PrepareTransaction(ctx context.Context, request TransactionRequest, options *PrepareOptions) (PreparedTransaction, error) {
	if request == nil || (reflect.ValueOf(request).Kind() == reflect.Pointer && reflect.ValueOf(request).IsNil()) {
		return PreparedTransaction{}, errors.New("transaction request is required")
	}
	wire, err := request.prepareWire()
	if err != nil {
		return PreparedTransaction{}, err
	}
	if wire.Options, err = prepareOptionsWire(options); err != nil {
		return PreparedTransaction{}, err
	}
	response, err := call(ctx, s, func(ctx context.Context, op *pb.Operation, trailer grpc.CallOption) (*pb.PrepareTransactionResponse, error) {
		wire.Operation = op
		return s.client.rpc.PrepareTransaction(ctx, wire, trailer)
	})
	if err != nil {
		return PreparedTransaction{}, err
	}
	if len(response.From) != common.AddressLength {
		return PreparedTransaction{}, errors.New("prepared transaction has invalid sender length")
	}
	kind, err := transactionKind(response.Kind)
	if err != nil {
		return PreparedTransaction{}, err
	}
	return PreparedTransaction{Kind: kind, From: common.BytesToAddress(response.From), UnsignedTx: response.UnsignedTx}, nil
}

type ConfidentialTransferRequest struct {
	From   common.Address
	Token  common.Address
	To     common.Address
	Amount *big.Int
}

func (r ConfidentialTransferRequest) prepareWire() (*pb.PrepareTransactionRequest, error) {
	amount, err := decimal("amount", r.Amount)
	if err != nil {
		return nil, err
	}
	return &pb.PrepareTransactionRequest{From: r.From.Bytes(), Transaction: &pb.PrepareTransactionRequest_ConfidentialTransfer{ConfidentialTransfer: &pb.ConfidentialTransfer{Token: r.Token.Bytes(), To: r.To.Bytes(), Amount: amount}}}, nil
}

type ConfidentialTransferFromRequest struct {
	From   common.Address
	Token  common.Address
	Owner  common.Address
	To     common.Address
	Amount *big.Int
}

func (r ConfidentialTransferFromRequest) prepareWire() (*pb.PrepareTransactionRequest, error) {
	amount, err := decimal("amount", r.Amount)
	if err != nil {
		return nil, err
	}
	return &pb.PrepareTransactionRequest{From: r.From.Bytes(), Transaction: &pb.PrepareTransactionRequest_ConfidentialTransferFrom{ConfidentialTransferFrom: &pb.ConfidentialTransferFrom{Token: r.Token.Bytes(), Owner: r.Owner.Bytes(), To: r.To.Bytes(), Amount: amount}}}, nil
}

type SetOperatorRequest struct {
	From     common.Address
	Token    common.Address
	Operator common.Address
	// Until is a required Unix timestamp in whole seconds; a positive past value revokes. The SDK never defaults it.
	Until *uint64
}

func (r SetOperatorRequest) prepareWire() (*pb.PrepareTransactionRequest, error) {
	if r.Until == nil {
		return nil, errors.New("until is required")
	}
	return &pb.PrepareTransactionRequest{From: r.From.Bytes(), Transaction: &pb.PrepareTransactionRequest_SetOperator{SetOperator: &pb.SetOperator{Token: r.Token.Bytes(), Operator: r.Operator.Bytes(), Until: r.Until}}}, nil
}

type UnwrapRequest struct {
	From   common.Address
	Token  common.Address
	To     common.Address
	Amount *big.Int
}

func (r UnwrapRequest) prepareWire() (*pb.PrepareTransactionRequest, error) {
	amount, err := decimal("amount", r.Amount)
	if err != nil {
		return nil, err
	}
	return &pb.PrepareTransactionRequest{From: r.From.Bytes(), Transaction: &pb.PrepareTransactionRequest_Unwrap{Unwrap: &pb.Unwrap{Token: r.Token.Bytes(), To: r.To.Bytes(), Amount: amount}}}, nil
}

type UnwrapAllRequest struct {
	From  common.Address
	Token common.Address
	To    common.Address
}

func (r UnwrapAllRequest) prepareWire() (*pb.PrepareTransactionRequest, error) {
	return &pb.PrepareTransactionRequest{From: r.From.Bytes(), Transaction: &pb.PrepareTransactionRequest_UnwrapAll{UnwrapAll: &pb.UnwrapAll{Token: r.Token.Bytes(), To: r.To.Bytes()}}}, nil
}

type FinalizeUnwrapRequest struct {
	From                    common.Address
	Wrapper                 common.Address
	UnwrapRequestIDOrAmount []byte
}

func (r FinalizeUnwrapRequest) prepareWire() (*pb.PrepareTransactionRequest, error) {
	return &pb.PrepareTransactionRequest{From: r.From.Bytes(), Transaction: &pb.PrepareTransactionRequest_FinalizeUnwrap{FinalizeUnwrap: &pb.FinalizeUnwrap{Wrapper: r.Wrapper.Bytes(), UnwrapRequestIdOrAmount: r.UnwrapRequestIDOrAmount}}}, nil
}

type ApproveUnderlyingRequest struct {
	From       common.Address
	Underlying common.Address
	Spender    common.Address
	Amount     *big.Int
}

func (r ApproveUnderlyingRequest) prepareWire() (*pb.PrepareTransactionRequest, error) {
	amount, err := decimal("amount", r.Amount)
	if err != nil {
		return nil, err
	}
	return &pb.PrepareTransactionRequest{From: r.From.Bytes(), Transaction: &pb.PrepareTransactionRequest_ApproveUnderlying{ApproveUnderlying: &pb.ApproveUnderlying{Underlying: r.Underlying.Bytes(), Spender: r.Spender.Bytes(), Amount: amount}}}, nil
}

type WrapRequest struct {
	From    common.Address
	Wrapper common.Address
	To      common.Address
	Amount  *big.Int
}

func (r WrapRequest) prepareWire() (*pb.PrepareTransactionRequest, error) {
	amount, err := decimal("amount", r.Amount)
	if err != nil {
		return nil, err
	}
	return &pb.PrepareTransactionRequest{From: r.From.Bytes(), Transaction: &pb.PrepareTransactionRequest_Wrap{Wrap: &pb.Wrap{Wrapper: r.Wrapper.Bytes(), To: r.To.Bytes(), Amount: amount}}}, nil
}

type TransferAndCallRequest struct {
	From       common.Address
	Underlying common.Address
	Wrapper    common.Address
	Amount     *big.Int
	// Nil omits recipient data; an empty non-nil slice sends explicit empty bytes.
	RecipientData []byte
}

func (r TransferAndCallRequest) prepareWire() (*pb.PrepareTransactionRequest, error) {
	amount, err := decimal("amount", r.Amount)
	if err != nil {
		return nil, err
	}
	return &pb.PrepareTransactionRequest{From: r.From.Bytes(), Transaction: &pb.PrepareTransactionRequest_TransferAndCall{TransferAndCall: &pb.TransferAndCall{Underlying: r.Underlying.Bytes(), Wrapper: r.Wrapper.Bytes(), Amount: amount, RecipientData: r.RecipientData}}}, nil
}

type DelegateDecryptionRequest struct {
	From            common.Address
	ContractAddress common.Address
	DelegateAddress common.Address
	ExpirationDate  *time.Time
}

func (r DelegateDecryptionRequest) prepareWire() (*pb.PrepareTransactionRequest, error) {
	var expiration *uint64
	if r.ExpirationDate != nil {
		// Wire milliseconds are unsigned and UnixMilli overflows outside the int64 millisecond range.
		if r.ExpirationDate.Before(time.UnixMilli(0)) || r.ExpirationDate.After(time.UnixMilli(math.MaxInt64)) {
			return nil, errors.New("expiration date is outside the representable millisecond range")
		}
		value := uint64(r.ExpirationDate.UnixMilli())
		expiration = &value
	}
	return &pb.PrepareTransactionRequest{From: r.From.Bytes(), Transaction: &pb.PrepareTransactionRequest_DelegateDecryption{DelegateDecryption: &pb.DelegateDecryption{ContractAddress: r.ContractAddress.Bytes(), DelegateAddress: r.DelegateAddress.Bytes(), ExpirationDateMs: expiration}}}, nil
}

type RevokeDelegationRequest struct {
	From            common.Address
	ContractAddress common.Address
	DelegateAddress common.Address
}

func (r RevokeDelegationRequest) prepareWire() (*pb.PrepareTransactionRequest, error) {
	return &pb.PrepareTransactionRequest{From: r.From.Bytes(), Transaction: &pb.PrepareTransactionRequest_RevokeDelegation{RevokeDelegation: &pb.RevokeDelegation{ContractAddress: r.ContractAddress.Bytes(), DelegateAddress: r.DelegateAddress.Bytes()}}}, nil
}
