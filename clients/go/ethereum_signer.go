package sidecar

import (
	"context"
	"crypto/ecdsa"
	"errors"
	"fmt"
	"math"
	"math/big"
	"strings"
	"time"

	ethereum "github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
)

type EthereumTransactionBackend interface {
	ChainID(context.Context) (*big.Int, error)
	PendingNonceAt(context.Context, common.Address) (uint64, error)
	SuggestGasPrice(context.Context) (*big.Int, error)
	EstimateGas(context.Context, ethereum.CallMsg) (uint64, error)
	SendTransaction(context.Context, *types.Transaction) error
}

type ApproveContractWriteFunc func(context.Context, ContractWriteRequest) error

// broadcastTimeout bounds a send that the caller's cancellation is no longer allowed to stop.
const broadcastTimeout = 30 * time.Second

type WritePolicy struct {
	// Approve runs before signing; returning an error stops the write without a broadcast.
	Approve ApproveContractWriteFunc
	// Submitting receives the signed transaction before broadcast. Record it: a cancelled
	// or lost callback cannot report the hash afterwards.
	Submitting func(ContractWriteRequest, *types.Transaction)
}

// BroadcastUncertainError includes the signed hash for application-owned reconciliation.
// Recreate the signer only after resolving whether this transaction was accepted.
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
func (e *BroadcastUncertainError) As(target any) bool {
	sdk, ok := target.(**SDKError)
	if ok {
		*sdk = &e.SDKError
	}
	return ok
}

type ethereumWriter struct {
	key       *ecdsa.PrivateKey
	account   WalletAccount
	backend   EthereumTransactionBackend
	policy    WritePolicy
	gate      chan struct{}
	nextNonce uint64
	uncertain *BroadcastUncertainError
}

// NewEthereumSigner uses legacy gas-price transactions. Share one result across contexts
// for the same wallet; external nonce users require application-owned coordination.
func NewEthereumSigner(privateKey string, chainID uint64, backend EthereumTransactionBackend, policy WritePolicy) (SignerConfig, error) {
	if backend == nil || policy.Approve == nil {
		return SignerConfig{}, errors.New("transaction backend and approval callback required")
	}
	key, err := crypto.HexToECDSA(strings.TrimPrefix(privateKey, "0x"))
	if err != nil {
		return SignerConfig{}, errors.New("invalid wallet private key")
	}
	config := privateKeySigner(key, chainID)
	writer := &ethereumWriter{key: key, account: *config.Account, backend: backend, policy: policy, gate: make(chan struct{}, 1)}
	config.WriteContract = writer.writeContract
	return config, nil
}

func (w *ethereumWriter) verifyChain(ctx context.Context) error {
	chain, err := w.backend.ChainID(ctx)
	if err != nil {
		return err
	}
	if chain == nil || !chain.IsUint64() || chain.Uint64() != w.account.ChainID {
		return &SDKError{Code: "CHAIN_MISMATCH", Message: "RPC chain does not match wallet"}
	}
	return nil
}

func (w *ethereumWriter) writeContract(ctx context.Context, request ContractWriteRequest) (common.Hash, error) {
	if err := ctx.Err(); err != nil {
		return common.Hash{}, err
	}
	if request.Account.Address != w.account.Address {
		return common.Hash{}, &SDKError{Code: "SIGNING_FAILED", Message: "wallet does not control the requested account"}
	}
	if request.Account.ChainID != w.account.ChainID {
		return common.Hash{}, &SDKError{Code: "CHAIN_MISMATCH", Message: "transaction chain does not match wallet"}
	}
	request = cloneContractWrite(request)
	// Approval runs outside the serialization gate, so the chain is rechecked once this write holds it.
	if err := w.policy.Approve(ctx, cloneContractWrite(request)); err != nil {
		return common.Hash{}, err
	}
	select {
	case w.gate <- struct{}{}:
		defer func() { <-w.gate }()
	case <-ctx.Done():
		return common.Hash{}, ctx.Err()
	}
	if err := ctx.Err(); err != nil {
		return common.Hash{}, err
	}
	if w.uncertain != nil {
		// This write never reached the RPC; only the earlier submission is uncertain.
		return common.Hash{}, &SDKError{Code: "SIGNING_FAILED", Message: fmt.Sprintf("reconcile uncertain transaction %s before sending another", w.uncertain.Hash.Hex())}
	}
	if err := w.verifyChain(ctx); err != nil {
		return common.Hash{}, err
	}
	tx, err := w.prepare(ctx, request)
	if err != nil {
		return common.Hash{}, err
	}
	signed, err := types.SignTx(tx, types.LatestSignerForChainID(new(big.Int).SetUint64(w.account.ChainID)), w.key)
	if err != nil {
		return common.Hash{}, err
	}
	if w.policy.Submitting != nil {
		w.policy.Submitting(cloneContractWrite(request), signed)
	}
	// The signed transaction must reach the RPC even if the caller gave up while it was being signed.
	sendCtx, cancelSend := context.WithTimeout(context.WithoutCancel(ctx), broadcastTimeout)
	defer cancelSend()
	if err := w.backend.SendTransaction(sendCtx, signed); err != nil {
		// A transport error cannot prove that the node rejected the signed transaction.
		w.uncertain = newBroadcastUncertainError(signed.Hash(), err)
		return common.Hash{}, w.uncertain
	}
	w.nextNonce = signed.Nonce() + 1
	return signed.Hash(), nil
}

func (w *ethereumWriter) prepare(ctx context.Context, request ContractWriteRequest) (*types.Transaction, error) {
	value := new(big.Int)
	if request.Value != nil {
		value.Set(request.Value)
	}
	if value.Sign() < 0 || value.BitLen() > 256 {
		return nil, errors.New("transaction value must fit uint256")
	}
	nonce, err := w.backend.PendingNonceAt(ctx, w.account.Address)
	if err != nil {
		return nil, err
	}
	if nonce < w.nextNonce {
		nonce = w.nextNonce
	}
	if nonce == math.MaxUint64 {
		return nil, errors.New("transaction nonce exhausted")
	}
	price, err := w.backend.SuggestGasPrice(ctx)
	if err != nil {
		return nil, err
	}
	if price == nil || price.Sign() < 0 {
		return nil, errors.New("invalid RPC gas price")
	}
	var gas uint64
	if request.Gas != nil {
		if !request.Gas.IsUint64() {
			return nil, errors.New("transaction gas must fit uint64")
		}
		gas = request.Gas.Uint64()
	} else {
		gas, err = w.backend.EstimateGas(ctx, ethereum.CallMsg{From: w.account.Address, To: &request.Address, Value: value, Data: request.Data, GasPrice: price})
		if err != nil {
			return nil, err
		}
	}
	return types.NewTx(&types.LegacyTx{Nonce: nonce, To: &request.Address, Value: value, Gas: gas, GasPrice: price, Data: request.Data}), nil
}
