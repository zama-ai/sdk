package sidecar

import (
	"context"
	"errors"
	"math/big"

	"github.com/ethereum/go-ethereum/common"
	pb "github.com/zama-ai/sdk/clients/go/gen/zama/sdk/v1alpha1"
)

type SDKEventKind string

const (
	EncryptStart               SDKEventKind = "encrypt:start"
	EncryptEnd                 SDKEventKind = "encrypt:end"
	EncryptError               SDKEventKind = "encrypt:error"
	DecryptStart               SDKEventKind = "decrypt:start"
	DecryptEnd                 SDKEventKind = "decrypt:end"
	DecryptError               SDKEventKind = "decrypt:error"
	PermitError                SDKEventKind = "permit:error"
	TransactionError           SDKEventKind = "transaction:error"
	ShieldSubmitted            SDKEventKind = "shield:submitted"
	TransferSubmitted          SDKEventKind = "transfer:submitted"
	TransferFromSubmitted      SDKEventKind = "transferFrom:submitted"
	SetOperatorSubmitted       SDKEventKind = "setOperator:submitted"
	ApproveUnderlyingSubmitted SDKEventKind = "approveUnderlying:submitted"
	WrapSubmitted              SDKEventKind = "wrap:submitted"
	UnwrapSubmitted            SDKEventKind = "unwrap:submitted"
	FinalizeUnwrapSubmitted    SDKEventKind = "finalizeUnwrap:submitted"
	DelegationSubmitted        SDKEventKind = "delegation:submitted"
	RevokeDelegationSubmitted  SDKEventKind = "revokeDelegation:submitted"
	UnshieldPhase1Submitted    SDKEventKind = "unshield:phase1_submitted"
	UnshieldPhase2Started      SDKEventKind = "unshield:phase2_started"
	UnshieldPhase2Submitted    SDKEventKind = "unshield:phase2_submitted"
)

type SDKEvent struct {
	Kind            SDKEventKind
	Timestamp       float64
	TokenAddress    *common.Address
	SDKOperationID  *string
	DurationMS      *float64
	EncryptedValues []common.Hash
	Result          map[common.Hash]ClearValue
	Error           *SDKError
	Operation       *string
	TxHash          *common.Hash
	ShieldPath      *string
	Step            *string
}
type EventCorrelation struct {
	ContextID   string
	OperationID string
	Sequence    uint64
}
type WalletAccountChanged struct{ Previous, Next *WalletAccount }
type ProgressKind int32

const (
	EncryptComplete           ProgressKind = 1
	ProgressTransferSubmitted ProgressKind = 2
	ProgressApprovalSubmitted ProgressKind = 3
	ProgressShieldSubmitted   ProgressKind = 4
	ProgressWrapSubmitted     ProgressKind = 5
	ProgressUnwrapSubmitted   ProgressKind = 6
	Finalizing                ProgressKind = 7
	ProgressFinalizeSubmitted ProgressKind = 8
)

type OperationProgress struct {
	Kind   ProgressKind
	TxHash *common.Hash
}
type BatchErrorCallback struct {
	TokenAddress common.Address
	Error        *SDKError
}

// Handlers run in delivery order and must honor cancellation; notification errors are acknowledged without failing SDK operations.
type EventHandlers struct {
	OnEvent                func(context.Context, EventCorrelation, SDKEvent) error
	OnWalletAccountChanged func(context.Context, EventCorrelation, WalletAccountChanged) error
	OnProgress             func(context.Context, EventCorrelation, OperationProgress) error
	OnBatchError           func(context.Context, EventCorrelation, BatchErrorCallback) (*big.Int, error)
}

func eventAddress(value []byte) (*common.Address, error) {
	if value == nil {
		return nil, nil
	}
	if len(value) != common.AddressLength {
		return nil, errors.New("invalid event address")
	}
	result := common.BytesToAddress(value)
	return &result, nil
}
func eventHash(value []byte) (*common.Hash, error) {
	if value == nil {
		return nil, nil
	}
	if len(value) != common.HashLength {
		return nil, errors.New("invalid event hash")
	}
	result := common.BytesToHash(value)
	return &result, nil
}
func eventAccount(value *pb.WalletAccount) (*WalletAccount, error) {
	if value == nil {
		return nil, nil
	}
	address, err := eventAddress(value.Address)
	if err != nil {
		return nil, err
	}
	if address == nil {
		return nil, errors.New("missing wallet address")
	}
	return &WalletAccount{Address: *address, ChainID: value.ChainId}, nil
}
func sdkEvent(value *pb.SdkEvent) (SDKEvent, error) {
	if value == nil {
		return SDKEvent{}, errors.New("missing SDK event")
	}
	switch SDKEventKind(value.Type) {
	case EncryptStart, EncryptEnd, EncryptError, DecryptStart, DecryptEnd, DecryptError, PermitError, TransactionError, ShieldSubmitted, TransferSubmitted, TransferFromSubmitted, SetOperatorSubmitted, ApproveUnderlyingSubmitted, WrapSubmitted, UnwrapSubmitted, FinalizeUnwrapSubmitted, DelegationSubmitted, RevokeDelegationSubmitted, UnshieldPhase1Submitted, UnshieldPhase2Started, UnshieldPhase2Submitted:
	default:
		return SDKEvent{}, errors.New("unknown SDK event kind")
	}
	result := SDKEvent{Kind: SDKEventKind(value.Type), Timestamp: value.Timestamp, SDKOperationID: value.SdkOperationId, DurationMS: value.DurationMs, Operation: value.Operation, ShieldPath: value.ShieldPath, Step: value.Step}
	var err error
	result.TokenAddress, err = eventAddress(value.TokenAddress)
	if err != nil {
		return result, err
	}
	result.TxHash, err = eventHash(value.TxHash)
	if err != nil {
		return result, err
	}
	if value.Error != nil {
		result.Error = sdkError(value.Error)
	}
	for _, bytes := range value.EncryptedValues {
		hash, err := eventHash(bytes)
		if err != nil {
			return result, err
		}
		if hash == nil {
			return result, errors.New("missing encrypted value")
		}
		result.EncryptedValues = append(result.EncryptedValues, *hash)
	}
	result.Result, err = clearEntries(value.Result)
	return result, err
}
