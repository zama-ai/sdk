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
	// Data is SDK-encoded calldata; JSON arguments retain bigints as decimal strings.
	Data         []byte
	ABI          json.RawMessage
	FunctionName string
	Args         json.RawMessage
	Value        *big.Int
	Gas          *big.Int
}

// WriteContractFunc approves, signs and broadcasts once; cancellation cannot undo submission.
// Callbacks may run concurrently. Return the broadcast hash without waiting for a receipt.
type WriteContractFunc func(context.Context, ContractWriteRequest) (common.Hash, error)

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
	if !ok || value.String() != *encoded {
		return nil, errors.New("invalid canonical transaction integer")
	}
	return value, nil
}

func cloneContractWrite(request ContractWriteRequest) ContractWriteRequest {
	request.Data = append([]byte(nil), request.Data...)
	request.ABI = append(json.RawMessage(nil), request.ABI...)
	request.Args = append(json.RawMessage(nil), request.Args...)
	if request.Value != nil {
		request.Value = new(big.Int).Set(request.Value)
	}
	if request.Gas != nil {
		request.Gas = new(big.Int).Set(request.Gas)
	}
	return request
}
