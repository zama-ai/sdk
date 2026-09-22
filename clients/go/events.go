package sidecar

import (
	"context"
	"errors"

	"github.com/ethereum/go-ethereum/common"
	pb "github.com/zama-ai/sdk/clients/go/gen/zama/sdk/v1alpha1"
)

type SDKEventKind = pb.SdkEventKind
type EventOperation = pb.EventOperation
type ShieldPath = pb.ShieldPath
type ApprovalStep = pb.ApprovalStep

const (
	EncryptStart               SDKEventKind = pb.SdkEventKind_SDK_EVENT_KIND_ENCRYPT_START
	EncryptEnd                 SDKEventKind = pb.SdkEventKind_SDK_EVENT_KIND_ENCRYPT_END
	EncryptError               SDKEventKind = pb.SdkEventKind_SDK_EVENT_KIND_ENCRYPT_ERROR
	DecryptStart               SDKEventKind = pb.SdkEventKind_SDK_EVENT_KIND_DECRYPT_START
	DecryptEnd                 SDKEventKind = pb.SdkEventKind_SDK_EVENT_KIND_DECRYPT_END
	DecryptError               SDKEventKind = pb.SdkEventKind_SDK_EVENT_KIND_DECRYPT_ERROR
	PermitError                SDKEventKind = pb.SdkEventKind_SDK_EVENT_KIND_PERMIT_ERROR
	TransactionError           SDKEventKind = pb.SdkEventKind_SDK_EVENT_KIND_TRANSACTION_ERROR
	ShieldSubmitted            SDKEventKind = pb.SdkEventKind_SDK_EVENT_KIND_SHIELD_SUBMITTED
	TransferSubmitted          SDKEventKind = pb.SdkEventKind_SDK_EVENT_KIND_TRANSFER_SUBMITTED
	TransferFromSubmitted      SDKEventKind = pb.SdkEventKind_SDK_EVENT_KIND_TRANSFER_FROM_SUBMITTED
	SetOperatorSubmitted       SDKEventKind = pb.SdkEventKind_SDK_EVENT_KIND_SET_OPERATOR_SUBMITTED
	ApproveUnderlyingSubmitted SDKEventKind = pb.SdkEventKind_SDK_EVENT_KIND_APPROVE_UNDERLYING_SUBMITTED
	WrapSubmitted              SDKEventKind = pb.SdkEventKind_SDK_EVENT_KIND_WRAP_SUBMITTED
	UnwrapSubmitted            SDKEventKind = pb.SdkEventKind_SDK_EVENT_KIND_UNWRAP_SUBMITTED
	FinalizeUnwrapSubmitted    SDKEventKind = pb.SdkEventKind_SDK_EVENT_KIND_FINALIZE_UNWRAP_SUBMITTED
	DelegationSubmitted        SDKEventKind = pb.SdkEventKind_SDK_EVENT_KIND_DELEGATION_SUBMITTED
	RevokeDelegationSubmitted  SDKEventKind = pb.SdkEventKind_SDK_EVENT_KIND_REVOKE_DELEGATION_SUBMITTED
	UnshieldPhase1Submitted    SDKEventKind = pb.SdkEventKind_SDK_EVENT_KIND_UNSHIELD_PHASE1_SUBMITTED
	UnshieldPhase2Started      SDKEventKind = pb.SdkEventKind_SDK_EVENT_KIND_UNSHIELD_PHASE2_STARTED
	UnshieldPhase2Submitted    SDKEventKind = pb.SdkEventKind_SDK_EVENT_KIND_UNSHIELD_PHASE2_SUBMITTED
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
	Operation       *EventOperation
	TxHash          *common.Hash
	ShieldPath      *ShieldPath
	Step            *ApprovalStep
}
type EventCorrelation struct {
	ContextID   string
	OperationID string
	Sequence    uint64
}
type WalletAccountChanged struct{ Previous, Next *WalletAccount }
type ProgressKind = pb.ProgressKind

const (
	EncryptComplete           ProgressKind = pb.ProgressKind_PROGRESS_KIND_ENCRYPT_COMPLETE
	ProgressTransferSubmitted ProgressKind = pb.ProgressKind_PROGRESS_KIND_TRANSFER_SUBMITTED
	ProgressApprovalSubmitted ProgressKind = pb.ProgressKind_PROGRESS_KIND_APPROVAL_SUBMITTED
	ProgressShieldSubmitted   ProgressKind = pb.ProgressKind_PROGRESS_KIND_SHIELD_SUBMITTED
	ProgressWrapSubmitted     ProgressKind = pb.ProgressKind_PROGRESS_KIND_WRAP_SUBMITTED
	ProgressUnwrapSubmitted   ProgressKind = pb.ProgressKind_PROGRESS_KIND_UNWRAP_SUBMITTED
	Finalizing                ProgressKind = pb.ProgressKind_PROGRESS_KIND_FINALIZING
	ProgressFinalizeSubmitted ProgressKind = pb.ProgressKind_PROGRESS_KIND_FINALIZE_SUBMITTED
)

type OperationProgress struct {
	Kind   ProgressKind
	TxHash *common.Hash
}

// EventHandlers process notifications in delivery order.
// Handlers must honor cancellation; notification errors do not fail SDK operations.
type EventHandlers struct {
	OnEvent                func(context.Context, EventCorrelation, SDKEvent) error
	OnWalletAccountChanged func(context.Context, EventCorrelation, WalletAccountChanged) error
	OnProgress             func(context.Context, EventCorrelation, OperationProgress) error
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
	result := SDKEvent{Kind: value.Type, Timestamp: value.Timestamp, SDKOperationID: value.SdkOperationId, DurationMS: value.DurationMs, Operation: value.Operation, ShieldPath: value.ShieldPath, Step: value.Step}
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
