package sidecar

import (
	"context"
	"errors"
	ethereum "github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"math/big"
	"strings"
	"sync"
	"testing"
	"time"
)

const transactionTestKey = "0000000000000000000000000000000000000000000000000000000000000001"

type transactionBackend struct {
	mu          sync.Mutex
	chain       uint64
	nonce       uint64
	sent        []*types.Transaction
	estimates   int
	estimateErr error
	sendErr     error
	beforeSend  func(context.Context)
}

func (b *transactionBackend) ChainID(context.Context) (*big.Int, error) {
	return new(big.Int).SetUint64(b.chain), nil
}
func (b *transactionBackend) PendingNonceAt(context.Context, common.Address) (uint64, error) {
	return b.nonce, nil
}
func (b *transactionBackend) SuggestGasPrice(context.Context) (*big.Int, error) {
	return big.NewInt(100), nil
}
func (b *transactionBackend) EstimateGas(context.Context, ethereum.CallMsg) (uint64, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.estimates++
	return 50000, b.estimateErr
}
func (b *transactionBackend) SendTransaction(ctx context.Context, tx *types.Transaction) error {
	b.mu.Lock()
	b.sent = append(b.sent, tx)
	b.mu.Unlock()
	if b.beforeSend != nil {
		b.beforeSend(ctx)
	}
	return b.sendErr
}
func acceptTransaction(ctx context.Context, _ ContractWriteRequest) error { return ctx.Err() }
func transactionSigner(t *testing.T, backend *transactionBackend, approve ApproveContractWriteFunc) SignerConfig {
	t.Helper()
	signer, err := NewEthereumSigner(transactionTestKey, 1, backend, WritePolicy{Approve: approve})
	if err != nil {
		t.Fatal(err)
	}
	return signer
}
func transactionRequest(signer SignerConfig) ContractWriteRequest {
	return ContractWriteRequest{Account: *signer.Account, Address: common.Address{4}, Data: []byte{1, 2, 3, 4}, Value: new(big.Int).Lsh(big.NewInt(1), 70)}
}
func TestEthereumSignerConcurrentNoncesAndSignedPayload(t *testing.T) {
	backend := &transactionBackend{chain: 1, nonce: 7}
	signer := transactionSigner(t, backend, acceptTransaction)
	request := transactionRequest(signer)
	var group sync.WaitGroup
	for range 12 {
		group.Go(func() {
			hash, err := signer.WriteContract(t.Context(), request)
			if err != nil || hash == (common.Hash{}) {
				t.Errorf("write failed: %v", err)
			}
		})
	}
	group.Wait()
	if len(backend.sent) != 12 {
		t.Fatal("missing transactions")
	}
	for index, tx := range backend.sent {
		sender, err := types.Sender(types.LatestSignerForChainID(big.NewInt(1)), tx)
		if err != nil || sender != signer.Account.Address || tx.Nonce() != uint64(7+index) || *tx.To() != request.Address || tx.Value().Cmp(request.Value) != 0 || string(tx.Data()) != string(request.Data) || tx.Gas() != 50000 {
			t.Fatalf("signed transaction changed: %v", tx)
		}
	}
}
func TestEthereumSignerExplicitZeroAndApprovalMutation(t *testing.T) {
	backend := &transactionBackend{chain: 1}
	signer := transactionSigner(t, backend, func(_ context.Context, request ContractWriteRequest) error {
		request.Data[0] = 99
		request.Value.SetUint64(99)
		request.Gas.SetUint64(99)
		return nil
	})
	request := transactionRequest(signer)
	request.Gas, request.Value = big.NewInt(0), big.NewInt(0)
	if _, err := signer.WriteContract(t.Context(), request); err != nil {
		t.Fatal(err)
	}
	tx := backend.sent[0]
	if backend.estimates != 0 || tx.Gas() != 0 || tx.Value().Sign() != 0 || tx.Data()[0] != 1 {
		t.Fatal("explicit zero or approved payload changed")
	}
}
func TestEthereumSignerRejectsBeforeBroadcast(t *testing.T) {
	for _, scenario := range []string{"rejection", "account", "chain", "estimate-revert", "negative-value", "gas-overflow", "cancel"} {
		t.Run(scenario, func(t *testing.T) {
			backend := &transactionBackend{chain: 1}
			approve := ApproveContractWriteFunc(acceptTransaction)
			if scenario == "rejection" {
				approve = func(context.Context, ContractWriteRequest) error { return ErrSigningRejected }
			}
			signer := transactionSigner(t, backend, approve)
			request := transactionRequest(signer)
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()
			switch scenario {
			case "account":
				request.Account.Address = common.Address{9}
			case "chain":
				backend.chain = 2
			case "estimate-revert":
				backend.estimateErr = errors.New("execution reverted")
			case "negative-value":
				request.Value = big.NewInt(-1)
			case "gas-overflow":
				request.Gas = new(big.Int).Lsh(big.NewInt(1), 64)
			case "cancel":
				cancel()
			}
			if _, err := signer.WriteContract(ctx, request); err == nil {
				t.Fatal("invalid write succeeded")
			}
			if len(backend.sent) != 0 {
				t.Fatal("invalid transaction broadcast")
			}
		})
	}
}
func TestEthereumSignerUncertainBroadcastBlocksFutureSubmission(t *testing.T) {
	backend := &transactionBackend{chain: 1, sendErr: errors.New("connection lost after acceptance")}
	signer := transactionSigner(t, backend, acceptTransaction)
	request := transactionRequest(signer)
	_, err := signer.WriteContract(t.Context(), request)
	var uncertain *BroadcastUncertainError
	if !errors.As(err, &uncertain) || uncertain.Hash != backend.sent[0].Hash() {
		t.Fatalf("submission uncertainty lost: %v", err)
	}
	wire := signingError(err)
	if wire.Code != "TRANSACTION_OUTCOME_UNKNOWN" || wire.Retryable {
		t.Fatal("unsafe broadcast error")
	}
	_, second := signer.WriteContract(t.Context(), request)
	var blocked *SDKError
	if !errors.As(second, &blocked) || blocked.Code != "SIGNING_FAILED" || !strings.Contains(blocked.Message, uncertain.Hash.Hex()) || len(backend.sent) != 1 {
		t.Fatalf("blocked write misreported: %v", second)
	}
}
func TestEthereumSignerReportsSignedTransactionBeforeBroadcast(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	var recorded []*types.Transaction
	backend := &transactionBackend{chain: 1}
	signer, err := NewEthereumSigner(transactionTestKey, 1, backend, WritePolicy{
		Approve: acceptTransaction,
		// Cancelling here leaves the caller gone between signing and the send.
		Submitting: func(_ ContractWriteRequest, tx *types.Transaction) { recorded = append(recorded, tx); cancel() },
	})
	if err != nil {
		t.Fatal(err)
	}
	hash, err := signer.WriteContract(ctx, transactionRequest(signer))
	if err != nil || len(recorded) != 1 || recorded[0].Hash() != hash || len(backend.sent) != 1 || backend.sent[0].Hash() != hash {
		t.Fatalf("recorded transaction not broadcast after cancellation: %s %v", hash, err)
	}
}
func TestEthereumSignerBroadcastIgnoresCallerCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	backend := &transactionBackend{chain: 1}
	backend.beforeSend = func(sendCtx context.Context) {
		cancel()
		select {
		case <-sendCtx.Done():
			backend.sendErr = sendCtx.Err()
		case <-time.After(20 * time.Millisecond):
		}
	}
	signer := transactionSigner(t, backend, acceptTransaction)
	hash, err := signer.WriteContract(ctx, transactionRequest(signer))
	if err != nil || hash != backend.sent[0].Hash() {
		t.Fatalf("accepted hash lost: %s %v", hash, err)
	}
}

func TestEthereumSignerBoundedBroadcastFailureStaysUncertain(t *testing.T) {
	backend := &transactionBackend{chain: 1}
	backend.beforeSend = func(sendCtx context.Context) {
		deadline, bounded := sendCtx.Deadline()
		if !bounded || time.Until(deadline) > broadcastTimeout {
			t.Error("broadcast is not bounded by the adapter timeout")
		}
		short, stop := context.WithTimeout(sendCtx, time.Millisecond)
		defer stop()
		<-short.Done()
		backend.sendErr = short.Err()
	}
	signer := transactionSigner(t, backend, acceptTransaction)
	hash, err := signer.WriteContract(t.Context(), transactionRequest(signer))
	var uncertain *BroadcastUncertainError
	if hash != (common.Hash{}) || !errors.As(err, &uncertain) || uncertain.Hash != backend.sent[0].Hash() {
		t.Fatalf("timed out broadcast misreported: %s %v", hash, err)
	}
}

func TestEthereumSignerRechecksChainAfterApproval(t *testing.T) {
	backend := &transactionBackend{chain: 1}
	signer := transactionSigner(t, backend, func(context.Context, ContractWriteRequest) error { backend.chain = 2; return nil })
	_, err := signer.WriteContract(t.Context(), transactionRequest(signer))
	var details *SDKError
	if !errors.As(err, &details) || details.Code != "CHAIN_MISMATCH" || len(backend.sent) != 0 {
		t.Fatalf("chain change ignored: %v", err)
	}
}

func TestEthereumSignerCancelledConcurrentCallDoesNotSubmit(t *testing.T) {
	started, release := make(chan struct{}), make(chan struct{})
	backend := &transactionBackend{chain: 1, beforeSend: func(context.Context) { close(started); <-release }}
	signer := transactionSigner(t, backend, acceptTransaction)
	request := transactionRequest(signer)
	done := make(chan error, 1)
	go func() { _, err := signer.WriteContract(t.Context(), request); done <- err }()
	<-started
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	if _, err := signer.WriteContract(ctx, request); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled write: %v", err)
	}
	close(release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if len(backend.sent) != 1 {
		t.Fatal("cancelled write was submitted")
	}
}
