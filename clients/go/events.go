package sidecar

import (
	"context"
	"errors"

	"github.com/ethereum/go-ethereum/common"
	pb "github.com/zama-ai/sdk/clients/go/internal/gen/zama/sdk/v1alpha1"
)

type SDKEventKind int32
type EventOperation int32
type ShieldPath int32
type ApprovalStep int32

func (kind SDKEventKind) String() string   { return pb.SdkEventKind(kind).String() }
func (kind EventOperation) String() string { return pb.EventOperation(kind).String() }
func (path ShieldPath) String() string     { return pb.ShieldPath(path).String() }
func (step ApprovalStep) String() string   { return pb.ApprovalStep(step).String() }

const (
	EventOperationUnspecified            = EventOperation(pb.EventOperation_EVENT_OPERATION_UNSPECIFIED)
	EventOperationGrantPermit            = EventOperation(pb.EventOperation_EVENT_OPERATION_GRANT_PERMIT)
	EventOperationGrantDelegationPermit  = EventOperation(pb.EventOperation_EVENT_OPERATION_GRANT_DELEGATION_PERMIT)
	EventOperationRegisterPermit         = EventOperation(pb.EventOperation_EVENT_OPERATION_REGISTER_PERMIT)
	EventOperationApproveUnderlying      = EventOperation(pb.EventOperation_EVENT_OPERATION_APPROVE_UNDERLYING)
	EventOperationApproveUnderlyingReset = EventOperation(pb.EventOperation_EVENT_OPERATION_APPROVE_UNDERLYING_RESET)
	EventOperationDelegateDecryption     = EventOperation(pb.EventOperation_EVENT_OPERATION_DELEGATE_DECRYPTION)
	EventOperationFinalizeUnwrap         = EventOperation(pb.EventOperation_EVENT_OPERATION_FINALIZE_UNWRAP)
	EventOperationRevokeDelegation       = EventOperation(pb.EventOperation_EVENT_OPERATION_REVOKE_DELEGATION)
	EventOperationSetOperator            = EventOperation(pb.EventOperation_EVENT_OPERATION_SET_OPERATOR)
	EventOperationShieldTransferAndCall  = EventOperation(pb.EventOperation_EVENT_OPERATION_SHIELD_TRANSFER_AND_CALL)
	EventOperationShieldApproveAndWrap   = EventOperation(pb.EventOperation_EVENT_OPERATION_SHIELD_APPROVE_AND_WRAP)
	EventOperationWrap                   = EventOperation(pb.EventOperation_EVENT_OPERATION_WRAP)
	EventOperationTransfer               = EventOperation(pb.EventOperation_EVENT_OPERATION_TRANSFER)
	EventOperationTransferAndCall        = EventOperation(pb.EventOperation_EVENT_OPERATION_TRANSFER_AND_CALL)
	EventOperationTransferFrom           = EventOperation(pb.EventOperation_EVENT_OPERATION_TRANSFER_FROM)
	EventOperationTransferFromAndCall    = EventOperation(pb.EventOperation_EVENT_OPERATION_TRANSFER_FROM_AND_CALL)
	EventOperationUnwrap                 = EventOperation(pb.EventOperation_EVENT_OPERATION_UNWRAP)
	EventOperationUnwrapAll              = EventOperation(pb.EventOperation_EVENT_OPERATION_UNWRAP_ALL)
	ShieldPathUnspecified                = ShieldPath(pb.ShieldPath_SHIELD_PATH_UNSPECIFIED)
	ShieldPathTransferAndCall            = ShieldPath(pb.ShieldPath_SHIELD_PATH_TRANSFER_AND_CALL)
	ShieldPathApproveAndWrap             = ShieldPath(pb.ShieldPath_SHIELD_PATH_APPROVE_AND_WRAP)
	ApprovalStepUnspecified              = ApprovalStep(pb.ApprovalStep_APPROVAL_STEP_UNSPECIFIED)
	ApprovalStepReset                    = ApprovalStep(pb.ApprovalStep_APPROVAL_STEP_RESET)
	ApprovalStepApprove                  = ApprovalStep(pb.ApprovalStep_APPROVAL_STEP_APPROVE)
)

const (
	SDKEventKindUnspecified            = SDKEventKind(pb.SdkEventKind_SDK_EVENT_KIND_UNSPECIFIED)
	SDKEventEncryptStart               = SDKEventKind(pb.SdkEventKind_SDK_EVENT_KIND_ENCRYPT_START)
	SDKEventEncryptEnd                 = SDKEventKind(pb.SdkEventKind_SDK_EVENT_KIND_ENCRYPT_END)
	SDKEventEncryptError               = SDKEventKind(pb.SdkEventKind_SDK_EVENT_KIND_ENCRYPT_ERROR)
	SDKEventDecryptStart               = SDKEventKind(pb.SdkEventKind_SDK_EVENT_KIND_DECRYPT_START)
	SDKEventDecryptEnd                 = SDKEventKind(pb.SdkEventKind_SDK_EVENT_KIND_DECRYPT_END)
	SDKEventDecryptError               = SDKEventKind(pb.SdkEventKind_SDK_EVENT_KIND_DECRYPT_ERROR)
	SDKEventPermitError                = SDKEventKind(pb.SdkEventKind_SDK_EVENT_KIND_PERMIT_ERROR)
	SDKEventTransactionError           = SDKEventKind(pb.SdkEventKind_SDK_EVENT_KIND_TRANSACTION_ERROR)
	SDKEventShieldSubmitted            = SDKEventKind(pb.SdkEventKind_SDK_EVENT_KIND_SHIELD_SUBMITTED)
	SDKEventTransferSubmitted          = SDKEventKind(pb.SdkEventKind_SDK_EVENT_KIND_TRANSFER_SUBMITTED)
	SDKEventTransferFromSubmitted      = SDKEventKind(pb.SdkEventKind_SDK_EVENT_KIND_TRANSFER_FROM_SUBMITTED)
	SDKEventSetOperatorSubmitted       = SDKEventKind(pb.SdkEventKind_SDK_EVENT_KIND_SET_OPERATOR_SUBMITTED)
	SDKEventApproveUnderlyingSubmitted = SDKEventKind(pb.SdkEventKind_SDK_EVENT_KIND_APPROVE_UNDERLYING_SUBMITTED)
	SDKEventWrapSubmitted              = SDKEventKind(pb.SdkEventKind_SDK_EVENT_KIND_WRAP_SUBMITTED)
	SDKEventUnwrapSubmitted            = SDKEventKind(pb.SdkEventKind_SDK_EVENT_KIND_UNWRAP_SUBMITTED)
	SDKEventFinalizeUnwrapSubmitted    = SDKEventKind(pb.SdkEventKind_SDK_EVENT_KIND_FINALIZE_UNWRAP_SUBMITTED)
	SDKEventDelegationSubmitted        = SDKEventKind(pb.SdkEventKind_SDK_EVENT_KIND_DELEGATION_SUBMITTED)
	SDKEventRevokeDelegationSubmitted  = SDKEventKind(pb.SdkEventKind_SDK_EVENT_KIND_REVOKE_DELEGATION_SUBMITTED)
	SDKEventUnshieldPhase1Submitted    = SDKEventKind(pb.SdkEventKind_SDK_EVENT_KIND_UNSHIELD_PHASE1_SUBMITTED)
	SDKEventUnshieldPhase2Started      = SDKEventKind(pb.SdkEventKind_SDK_EVENT_KIND_UNSHIELD_PHASE2_STARTED)
	SDKEventUnshieldPhase2Submitted    = SDKEventKind(pb.SdkEventKind_SDK_EVENT_KIND_UNSHIELD_PHASE2_SUBMITTED)
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
type ProgressKind int32

const (
	ProgressKindUnspecified   = ProgressKind(pb.ProgressKind_PROGRESS_KIND_UNSPECIFIED)
	ProgressEncryptComplete   = ProgressKind(pb.ProgressKind_PROGRESS_KIND_ENCRYPT_COMPLETE)
	ProgressTransferSubmitted = ProgressKind(pb.ProgressKind_PROGRESS_KIND_TRANSFER_SUBMITTED)
	ProgressApprovalSubmitted = ProgressKind(pb.ProgressKind_PROGRESS_KIND_APPROVAL_SUBMITTED)
	ProgressShieldSubmitted   = ProgressKind(pb.ProgressKind_PROGRESS_KIND_SHIELD_SUBMITTED)
	ProgressWrapSubmitted     = ProgressKind(pb.ProgressKind_PROGRESS_KIND_WRAP_SUBMITTED)
	ProgressUnwrapSubmitted   = ProgressKind(pb.ProgressKind_PROGRESS_KIND_UNWRAP_SUBMITTED)
	ProgressFinalizing        = ProgressKind(pb.ProgressKind_PROGRESS_KIND_FINALIZING)
	ProgressFinalizeSubmitted = ProgressKind(pb.ProgressKind_PROGRESS_KIND_FINALIZE_SUBMITTED)
)

func (kind ProgressKind) String() string { return pb.ProgressKind(kind).String() }

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
	result := SDKEvent{Kind: SDKEventKind(value.Type), Timestamp: value.Timestamp, SDKOperationID: value.SdkOperationId, DurationMS: value.DurationMs}
	if value.Operation != nil {
		operation := EventOperation(*value.Operation)
		result.Operation = &operation
	}
	if value.ShieldPath != nil {
		path := ShieldPath(*value.ShieldPath)
		result.ShieldPath = &path
	}
	if value.Step != nil {
		step := ApprovalStep(*value.Step)
		result.Step = &step
	}
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
