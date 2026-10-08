package zama

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/common"
	pb "github.com/zama-ai/sdk/clients/go/v3/internal/gen/zama/sdk/v1beta1"
)

// hashFromWire decodes wire bytes into a hash, reporting message when the length is wrong.
func hashFromWire(bytes []byte, message string) (common.Hash, error) {
	if len(bytes) != common.HashLength {
		return common.Hash{}, errors.New(message)
	}
	return common.BytesToHash(bytes), nil
}

// addressFromWire decodes wire bytes into an address, reporting message when the length is wrong.
func addressFromWire(bytes []byte, message string) (common.Address, error) {
	if len(bytes) != common.AddressLength {
		return common.Address{}, errors.New(message)
	}
	return common.BytesToAddress(bytes), nil
}

type TransactionLog struct {
	Address *common.Address
	Topics  []common.Hash
	Data    []byte
}

type TransactionResult struct {
	TxHash common.Hash
	Logs   []TransactionLog
}

func transactionResult(wire *pb.TransactionResult) (*TransactionResult, error) {
	if wire == nil {
		return nil, errors.New("missing transaction result")
	}
	txHash, err := hashFromWire(wire.TransactionHash, "invalid transaction hash")
	if err != nil {
		return nil, err
	}
	logs := make([]TransactionLog, len(wire.Logs))
	for i, log := range wire.Logs {
		if log == nil {
			return nil, errors.New("missing transaction log")
		}
		var address *common.Address
		if len(log.Address) > 0 {
			value, err := addressFromWire(log.Address, "invalid transaction log address")
			if err != nil {
				return nil, err
			}
			address = &value
		}
		topics := make([]common.Hash, len(log.Topics))
		for j, topic := range log.Topics {
			hash, err := hashFromWire(topic, "invalid transaction log topic")
			if err != nil {
				return nil, err
			}
			topics[j] = hash
		}
		logs[i] = TransactionLog{Address: address, Topics: topics, Data: append([]byte(nil), log.Data...)}
	}
	return &TransactionResult{TxHash: txHash, Logs: logs}, nil
}

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
	Gas   *uint64
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
	if wire == nil {
		return ContractWriteRequest{}, errors.New("invalid contract write payload")
	}
	address, err := addressFromWire(wire.Address, "invalid contract write address")
	if err != nil {
		return ContractWriteRequest{}, err
	}
	switch {
	case len(wire.Data) < 4:
		return ContractWriteRequest{}, errors.New("invalid contract write data")
	case wire.FunctionName == "":
		return ContractWriteRequest{}, errors.New("invalid contract write function name")
	case !isJSONArray(wire.AbiJson):
		return ContractWriteRequest{}, errors.New("invalid contract write ABI")
	case !isJSONArray(wire.ArgsJson):
		return ContractWriteRequest{}, errors.New("invalid contract write args")
	}
	value, err := optionalTransactionInteger("value", wire.Value, 256)
	if err != nil {
		return ContractWriteRequest{}, err
	}
	gasLimit, err := optionalTransactionInteger("gas", wire.Gas, 64)
	if err != nil {
		return ContractWriteRequest{}, err
	}
	var gas *uint64
	if gasLimit != nil {
		limit := gasLimit.Uint64()
		gas = &limit
	}
	return ContractWriteRequest{
		OperationID: operationID, ActionID: actionID, Account: account,
		Address: address, Data: append([]byte(nil), wire.Data...),
		ABI: json.RawMessage(wire.AbiJson), FunctionName: wire.FunctionName, Args: json.RawMessage(wire.ArgsJson),
		Value: value, Gas: gas,
	}, nil
}

func isJSONArray(encoded string) bool {
	var values []json.RawMessage
	return json.Unmarshal([]byte(encoded), &values) == nil && values != nil
}

func optionalTransactionInteger(name string, encoded *string, bits int) (*big.Int, error) {
	if encoded == nil {
		return nil, nil
	}
	value, ok := new(big.Int).SetString(*encoded, 10)
	if !ok || value.Sign() < 0 || value.String() != *encoded {
		return nil, errors.New("invalid canonical transaction " + name)
	}
	if value.BitLen() > bits {
		return nil, fmt.Errorf("transaction %s must fit uint%d", name, bits)
	}
	return value, nil
}
