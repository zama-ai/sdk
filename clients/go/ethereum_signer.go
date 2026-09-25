package zama

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi"
	bind "github.com/ethereum/go-ethereum/accounts/abi/bind/v2"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/rpc"
)

// DefaultBroadcastTimeout bounds a send that the caller's cancellation is no longer allowed to stop.
const DefaultBroadcastTimeout = 30 * time.Second

type EthereumSignerOptions struct {
	BroadcastTimeout time.Duration
}

// BroadcastUncertainError includes the signed hash for application-owned reconciliation.
type BroadcastUncertainError struct {
	SDKError
	Hash  common.Hash
	Cause error
}

func newBroadcastUncertainError(hash common.Hash, cause error) *BroadcastUncertainError {
	message := fmt.Sprintf("transaction %s submission uncertain: %v", hash.Hex(), cause)
	return &BroadcastUncertainError{SDKError: SDKError{Code: "TRANSACTION_OUTCOME_UNKNOWN", Message: message}, Hash: hash, Cause: cause}
}
func (e *BroadcastUncertainError) Error() string { return e.Message }
func (e *BroadcastUncertainError) Unwrap() error { return e.Cause }

type ethereumWriter struct {
	account          WalletAccount
	auth             *bind.TransactOpts
	backend          bind.ContractTransactor
	broadcastTimeout time.Duration
}

// NewEthereumSigner forwards SDK contract writes to backend; nonces and fees come from the node.
func NewEthereumSigner(privateKey string, chainID uint64, backend bind.ContractTransactor, options ...EthereumSignerOptions) (SignerConfig, error) {
	if backend == nil {
		return SignerConfig{}, errors.New("transaction backend required")
	}
	key, err := crypto.HexToECDSA(strings.TrimPrefix(privateKey, "0x"))
	if err != nil {
		return SignerConfig{}, errors.New("invalid wallet private key")
	}
	timeout := DefaultBroadcastTimeout
	// Later entries override earlier ones; a non-positive timeout keeps the default.
	for _, option := range options {
		if option.BroadcastTimeout > 0 {
			timeout = option.BroadcastTimeout
		}
	}
	config := privateKeySigner(key, chainID)
	writer := &ethereumWriter{
		account:          *config.Account,
		auth:             bind.NewKeyedTransactor(key, new(big.Int).SetUint64(chainID)),
		backend:          backend,
		broadcastTimeout: timeout,
	}
	config.WriteContract = WriteContractFunc(writer.writeContract)
	return config, nil
}

func (w *ethereumWriter) writeContract(ctx context.Context, request ContractWriteRequest) (common.Hash, error) {
	if err := ctx.Err(); err != nil {
		return common.Hash{}, err
	}
	if request.Account.Address != w.account.Address {
		return common.Hash{}, &SDKError{Code: "SIGNING_FAILED", Message: "Wallet does not control the requested account."}
	}
	if request.Account.ChainID != w.account.ChainID {
		return common.Hash{}, &SDKError{Code: "CHAIN_MISMATCH", Message: "Transaction chain does not match the wallet chain."}
	}
	if request.Value != nil && request.Value.BitLen() > 256 {
		return common.Hash{}, &SDKError{Code: "SIGNING_FAILED", Message: "Transaction value must fit uint256."}
	}
	// Copy the shared authorization so per-write fields never race.
	opts := *w.auth
	opts.Context, opts.NoSend, opts.Value = ctx, true, request.Value
	if request.Gas != nil {
		if !request.Gas.IsUint64() {
			return common.Hash{}, errors.New("transaction gas must fit uint64")
		}
		opts.GasLimit = request.Gas.Uint64()
	}
	contract := bind.NewBoundContract(request.Address, abi.ABI{}, nil, w.backend, nil)
	signed, err := contract.RawTransact(&opts, request.Data)
	if err != nil {
		return common.Hash{}, revertError(err)
	}
	if err := ctx.Err(); err != nil {
		return common.Hash{}, err
	}
	// An in-flight send is not interrupted by the caller's cancellation.
	sendCtx, cancelSend := context.WithTimeout(context.WithoutCancel(ctx), w.broadcastTimeout)
	defer cancelSend()
	if err := w.backend.SendTransaction(sendCtx, signed); err != nil {
		// A transport error cannot prove that the node rejected the signed transaction.
		return common.Hash{}, newBroadcastUncertainError(signed.Hash(), err)
	}
	return signed.Hash(), nil
}

// revertError turns a gas-estimation failure carrying revert data into an ExecutionRevertError; other errors pass through unchanged.
// A node JSON-RPC error is a revert when it carries geth's dedicated code 3 (mirrors ethclient.RevertErrorData) or when
// its message starts with the revert marker; any other code, such as insufficient funds, stays a plain error.
func revertError(err error) error {
	var data []byte
	var dataErr rpc.DataError
	if errors.As(err, &dataErr) {
		if hexString, ok := dataErr.ErrorData().(string); ok {
			if decoded, decodeErr := hexutil.Decode(hexString); decodeErr == nil {
				data = decoded
			}
		}
	}
	var rpcErr rpc.Error
	if errors.As(err, &rpcErr) && rpcErr.ErrorCode() == 3 {
		return &ExecutionRevertError{Data: data, Cause: err}
	}
	// Fallback for nodes that revert under a non-dedicated code; anchored to a prefix so an
	// unrelated code carrying "execution reverted" mid-message is not misclassified.
	if strings.HasPrefix(strings.ToLower(err.Error()), "execution reverted") {
		return &ExecutionRevertError{Data: data, Cause: err}
	}
	return err
}
