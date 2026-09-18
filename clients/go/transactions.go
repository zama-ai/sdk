package sidecar

import (
	"context"
	"encoding/json"
	"errors"
	"math/big"

	"github.com/ethereum/go-ethereum/common"
	pb "github.com/zama-ai/sdk/clients/go/gen/zama/sdk/v1alpha1"
)

type ContractWriteRequest struct {
	OperationID string
	ActionID    string
	Account     WalletAccount
	Address     common.Address
	// Data is SDK-encoded calldata and must be broadcast unchanged.
	Data         []byte
	ABI          json.RawMessage
	FunctionName string
	// Args carries SDK bigint arguments as canonical decimal strings.
	Args  json.RawMessage
	Value *big.Int
	Gas   *big.Int
}

// WriteContractFunc signs and broadcasts once; cancellation cannot undo submission.
// Callbacks may run concurrently. Return the broadcast hash without waiting for a receipt.
// Return *ExecutionRevertError only when nothing was broadcast (a pre-broadcast simulation/estimation revert).
type WriteContractFunc func(context.Context, ContractWriteRequest) (common.Hash, error)

// ExecutionRevertError reports that the node rejected the simulated write before broadcast; nothing was sent.
type ExecutionRevertError struct {
	Data  []byte
	Cause error
}

func (e *ExecutionRevertError) Error() string {
	if e.Cause != nil {
		return e.Cause.Error()
	}
	return "execution reverted"
}
func (e *ExecutionRevertError) Unwrap() error { return e.Cause }

func contractWriteRequest(operationID, actionID string, account WalletAccount, wire *pb.ContractWriteRequest) (ContractWriteRequest, error) {
	if wire == nil || len(wire.Address) != common.AddressLength || len(wire.Data) < 4 || wire.FunctionName == "" || !json.Valid([]byte(wire.AbiJson)) || !json.Valid([]byte(wire.ArgsJson)) {
		return ContractWriteRequest{}, errors.New("invalid contract write payload")
	}
	value, err := optionalTransactionInteger(wire.Value)
	if err != nil {
		return ContractWriteRequest{}, err
	}
	gas, err := optionalTransactionInteger(wire.Gas)
	if err != nil {
		return ContractWriteRequest{}, err
	}
	return ContractWriteRequest{
		OperationID: operationID, ActionID: actionID, Account: account,
		Address: common.BytesToAddress(wire.Address), Data: append([]byte(nil), wire.Data...),
		ABI: json.RawMessage(wire.AbiJson), FunctionName: wire.FunctionName, Args: json.RawMessage(wire.ArgsJson),
		Value: value, Gas: gas,
	}, nil
}

func optionalTransactionInteger(encoded *string) (*big.Int, error) {
	if encoded == nil {
		return nil, nil
	}
	value, ok := new(big.Int).SetString(*encoded, 10)
	if !ok || value.Sign() < 0 || value.String() != *encoded {
		return nil, errors.New("invalid canonical transaction integer")
	}
	return value, nil
}
