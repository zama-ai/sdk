package zama

import (
	"bytes"
	"context"
	"errors"
	"math/big"
	"sync"
	"testing"
	"time"

	ethereum "github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
)

const transactionTestKey = "0000000000000000000000000000000000000000000000000000000000000001"

// fakeDataError mimics go-ethereum rpc.jsonError, the shape nodes use to attach a code and raw revert bytes to an RPC error.
type fakeDataError struct {
	msg  string
	code int
	data any
}

func (e *fakeDataError) Error() string  { return e.msg }
func (e *fakeDataError) ErrorCode() int { return e.code }
func (e *fakeDataError) ErrorData() any { return e.data }

type transactionBackend struct {
	mu          sync.Mutex
	baseFee     *big.Int
	nonce       uint64
	calls       map[string]int
	estimated   ethereum.CallMsg
	sent        []*types.Transaction
	sendErr     error
	estimateErr error
	beforeSend  func(context.Context)
	onNonce     func()
}

func newTransactionBackend() *transactionBackend {
	return &transactionBackend{baseFee: big.NewInt(1000), calls: map[string]int{}}
}
func (b *transactionBackend) record(name string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.calls[name]++
}
func (b *transactionBackend) count(name string) int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.calls[name]
}
func (b *transactionBackend) rpcCalls() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.calls)
}
func (b *transactionBackend) HeaderByNumber(context.Context, *big.Int) (*types.Header, error) {
	b.record("HeaderByNumber")
	return &types.Header{BaseFee: b.baseFee}, nil
}
func (b *transactionBackend) PendingCodeAt(context.Context, common.Address) ([]byte, error) {
	b.record("PendingCodeAt")
	return []byte{0xfe}, nil
}
func (b *transactionBackend) PendingNonceAt(context.Context, common.Address) (uint64, error) {
	b.record("PendingNonceAt")
	if b.onNonce != nil {
		b.onNonce()
	}
	return b.nonce, nil
}
func (b *transactionBackend) SuggestGasPrice(context.Context) (*big.Int, error) {
	b.record("SuggestGasPrice")
	return big.NewInt(100), nil
}
func (b *transactionBackend) SuggestGasTipCap(context.Context) (*big.Int, error) {
	b.record("SuggestGasTipCap")
	return big.NewInt(7), nil
}
func (b *transactionBackend) EstimateGas(_ context.Context, msg ethereum.CallMsg) (uint64, error) {
	b.record("EstimateGas")
	b.mu.Lock()
	b.estimated = msg
	err := b.estimateErr
	b.mu.Unlock()
	if err != nil {
		return 0, err
	}
	return 50000, nil
}
func (b *transactionBackend) TransactionByHash(context.Context, common.Hash) (*types.Transaction, bool, error) {
	b.record("TransactionByHash")
	return nil, false, errors.New("unsupported")
}
func (b *transactionBackend) SendTransaction(ctx context.Context, tx *types.Transaction) error {
	b.record("SendTransaction")
	b.mu.Lock()
	b.sent = append(b.sent, tx)
	b.mu.Unlock()
	if b.beforeSend != nil {
		b.beforeSend(ctx)
	}
	return b.sendErr
}

func transactionSigner(t *testing.T, backend *transactionBackend, options ...EthereumSignerOptions) SignerConfig {
	t.Helper()
	signer, err := NewEthereumSigner(transactionTestKey, 1, backend, options...)
	if err != nil {
		t.Fatal(err)
	}
	return signer
}
func transactionRequest(signer SignerConfig) ContractWriteRequest {
	return ContractWriteRequest{Account: *signer.Account, Address: common.Address{4}, Data: []byte{1, 2, 3, 4}}
}

func TestEthereumSignerSendsDynamicFeeTransaction(t *testing.T) {
	backend := newTransactionBackend()
	signer := transactionSigner(t, backend)
	request := transactionRequest(signer)
	hash, err := signer.WriteContract(t.Context(), request)
	if err != nil || len(backend.sent) != 1 || backend.sent[0].Hash() != hash {
		t.Fatalf("write did not return the sent hash: %s %v", hash, err)
	}
	tx := backend.sent[0]
	sender, err := types.Sender(types.LatestSignerForChainID(big.NewInt(1)), tx)
	if err != nil || sender != signer.Account.Address {
		t.Fatalf("transaction not signed by the wallet: %v", err)
	}
	// No fee field is forced, so the backend's own selection survives.
	if tx.Type() != types.DynamicFeeTxType {
		t.Fatalf("base-fee chain did not select dynamic fees: %v", tx)
	}
	if *tx.To() != request.Address || string(tx.Data()) != string(request.Data) {
		t.Fatal("calldata or recipient changed")
	}
}

func TestEthereumSignerForwardsExplicitGasAndValue(t *testing.T) {
	backend := newTransactionBackend()
	signer := transactionSigner(t, backend)
	request := transactionRequest(signer)
	request.Gas, request.Value = big.NewInt(21000), new(big.Int).Lsh(big.NewInt(1), 70)
	if _, err := signer.WriteContract(t.Context(), request); err != nil {
		t.Fatal(err)
	}
	tx := backend.sent[0]
	if tx.Gas() != 21000 || backend.count("EstimateGas") != 0 || tx.Value().Cmp(request.Value) != 0 {
		t.Fatalf("explicit gas or value changed: %v", tx)
	}
}

func TestEthereumSignerTreatsZeroGasAsEstimate(t *testing.T) {
	backend := newTransactionBackend()
	signer := transactionSigner(t, backend)
	request := transactionRequest(signer)
	request.Gas = big.NewInt(0)
	if _, err := signer.WriteContract(t.Context(), request); err != nil {
		t.Fatal(err)
	}
	if tx := backend.sent[0]; tx.Gas() == 0 || backend.count("EstimateGas") != 1 {
		t.Fatalf("zero gas was not estimated: %v", tx)
	}
}

func TestEthereumSignerEstimatesAbsentGasAndSendsZeroValue(t *testing.T) {
	backend := newTransactionBackend()
	signer := transactionSigner(t, backend)
	if _, err := signer.WriteContract(t.Context(), transactionRequest(signer)); err != nil {
		t.Fatal(err)
	}
	tx := backend.sent[0]
	if tx.Gas() == 0 || backend.count("EstimateGas") != 1 || tx.Value().Sign() != 0 {
		t.Fatalf("absent gas or value mishandled: %v", tx)
	}
	if backend.estimated.From != signer.Account.Address || backend.estimated.Value.Sign() != 0 {
		t.Fatalf("estimation message changed: %v", backend.estimated)
	}
}

func TestEthereumSignerRejectsWithoutRPC(t *testing.T) {
	for _, scenario := range []string{"account", "chain", "gas-overflow", "value-overflow", "cancel"} {
		t.Run(scenario, func(t *testing.T) {
			backend := newTransactionBackend()
			signer := transactionSigner(t, backend)
			request := transactionRequest(signer)
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()
			code := ""
			switch scenario {
			case "account":
				request.Account.Address, code = common.Address{9}, "SIGNING_FAILED"
			case "chain":
				request.Account.ChainID, code = 2, "CHAIN_MISMATCH"
			case "gas-overflow":
				request.Gas = new(big.Int).Lsh(big.NewInt(1), 64)
			case "value-overflow":
				request.Value, code = new(big.Int).Lsh(big.NewInt(1), 256), "SIGNING_FAILED"
			case "cancel":
				cancel()
			}
			_, err := signer.WriteContract(ctx, request)
			if err == nil {
				t.Fatal("invalid write succeeded")
			}
			var details *SDKError
			if code != "" && (!errors.As(err, &details) || details.Code != code) {
				t.Fatalf("wrong error code: %v", err)
			}
			if backend.rpcCalls() != 0 {
				t.Fatalf("rejected write reached the RPC: %v", backend.calls)
			}
			if len(backend.sent) != 0 {
				t.Fatal("invalid transaction broadcast")
			}
		})
	}
}

func TestEthereumSignerCancellationBeforeSendSkipsBroadcast(t *testing.T) {
	backend := newTransactionBackend()
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	// The last RPC before signing leaves the caller gone by the time the send would start.
	backend.onNonce = cancel
	signer := transactionSigner(t, backend)
	if _, err := signer.WriteContract(ctx, transactionRequest(signer)); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled write: %v", err)
	}
	if len(backend.sent) != 0 {
		t.Fatal("cancelled write was broadcast")
	}
}

func TestEthereumSignerBroadcastIgnoresCallerCancellation(t *testing.T) {
	backend := newTransactionBackend()
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	backend.beforeSend = func(sendCtx context.Context) {
		cancel()
		select {
		case <-sendCtx.Done():
			backend.sendErr = sendCtx.Err()
		case <-time.After(20 * time.Millisecond):
		}
	}
	signer := transactionSigner(t, backend)
	hash, err := signer.WriteContract(ctx, transactionRequest(signer))
	if err != nil || hash != backend.sent[0].Hash() {
		t.Fatalf("accepted hash lost: %s %v", hash, err)
	}
}

func TestEthereumSignerFailedSendStaysUncertain(t *testing.T) {
	backend := newTransactionBackend()
	backend.sendErr = errors.New("connection lost after acceptance")
	signer := transactionSigner(t, backend)
	hash, err := signer.WriteContract(t.Context(), transactionRequest(signer))
	var uncertain *BroadcastUncertainError
	if hash != (common.Hash{}) || !errors.As(err, &uncertain) || uncertain.Hash != backend.sent[0].Hash() {
		t.Fatalf("submission uncertainty lost: %s %v", hash, err)
	}
	if wire := signingError(err); wire.Code != "TRANSACTION_OUTCOME_UNKNOWN" || wire.Retryable {
		t.Fatalf("unsafe broadcast error: %v", wire)
	}
}

func TestEthereumSignerBroadcastTimeoutStaysUncertain(t *testing.T) {
	backend := newTransactionBackend()
	backend.beforeSend = func(sendCtx context.Context) {
		deadline, bounded := sendCtx.Deadline()
		if !bounded || time.Until(deadline) > time.Millisecond {
			t.Error("broadcast is not bounded by the configured timeout")
		}
		<-sendCtx.Done()
		backend.sendErr = sendCtx.Err()
	}
	signer := transactionSigner(t, backend, EthereumSignerOptions{BroadcastTimeout: time.Millisecond})
	_, err := signer.WriteContract(t.Context(), transactionRequest(signer))
	var uncertain *BroadcastUncertainError
	if !errors.As(err, &uncertain) || uncertain.Hash != backend.sent[0].Hash() || !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("timed out broadcast misreported: %v", err)
	}
}

func TestEthereumSignerConcurrentWritesAreNotSerialized(t *testing.T) {
	backend := newTransactionBackend()
	inSend := make(chan struct{}, 2)
	release := make(chan struct{})
	// Both sends must be in flight at once for the release to unblock them.
	backend.beforeSend = func(context.Context) { inSend <- struct{}{}; <-release }
	signer := transactionSigner(t, backend)
	request := transactionRequest(signer)
	var group sync.WaitGroup
	for range 2 {
		group.Go(func() {
			if _, err := signer.WriteContract(t.Context(), request); err != nil {
				t.Error(err)
			}
		})
	}
	for range 2 {
		select {
		case <-inSend:
		case <-time.After(5 * time.Second):
			t.Fatal("writes were serialized")
		}
	}
	close(release)
	group.Wait()
	if len(backend.sent) != 2 || backend.count("PendingNonceAt") != 2 {
		t.Fatalf("both writes must query the node: %v", backend.calls)
	}
}

func TestEthereumSignerReportsExecutionRevertWithData(t *testing.T) {
	backend := newTransactionBackend()
	backend.estimateErr = &fakeDataError{msg: "execution reverted: AlreadyDelegatedOrRevokedInSameBlock()", code: 3, data: "0xdeadbeef"}
	signer := transactionSigner(t, backend)
	_, err := signer.WriteContract(t.Context(), transactionRequest(signer))
	var revert *ExecutionRevertError
	if !errors.As(err, &revert) {
		t.Fatalf("revert not reported: %v", err)
	}
	if want := []byte{0xde, 0xad, 0xbe, 0xef}; !bytes.Equal(revert.Data, want) {
		t.Fatalf("revert data lost: %x", revert.Data)
	}
	if len(backend.sent) != 0 {
		t.Fatal("reverting estimation still broadcast")
	}
}

func TestEthereumSignerReportsExecutionRevertWithDataOnNonDedicatedCode(t *testing.T) {
	backend := newTransactionBackend()
	backend.estimateErr = &fakeDataError{msg: "execution reverted: custom", code: -32000, data: "0x1234"}
	signer := transactionSigner(t, backend)
	_, err := signer.WriteContract(t.Context(), transactionRequest(signer))
	var revert *ExecutionRevertError
	if !errors.As(err, &revert) {
		t.Fatalf("revert not reported: %v", err)
	}
	if want := []byte{0x12, 0x34}; !bytes.Equal(revert.Data, want) {
		t.Fatalf("revert data lost: %x", revert.Data)
	}
	if len(backend.sent) != 0 {
		t.Fatal("reverting estimation still broadcast")
	}
}

func TestEthereumSignerReportsExecutionRevertWithoutData(t *testing.T) {
	for name, dataErr := range map[string]error{
		"nil data":     &fakeDataError{msg: "execution reverted", code: 3, data: nil},
		"non-hex data": &fakeDataError{msg: "execution reverted", code: 3, data: "not hex"},
		"message only": errors.New("execution reverted: foo"),
	} {
		t.Run(name, func(t *testing.T) {
			backend := newTransactionBackend()
			backend.estimateErr = dataErr
			signer := transactionSigner(t, backend)
			_, err := signer.WriteContract(t.Context(), transactionRequest(signer))
			var revert *ExecutionRevertError
			if !errors.As(err, &revert) {
				t.Fatalf("revert not reported: %v", err)
			}
			if len(revert.Data) != 0 {
				t.Fatalf("revert data invented: %x", revert.Data)
			}
			if len(backend.sent) != 0 {
				t.Fatal("reverting estimation still broadcast")
			}
		})
	}
}

func TestEthereumSignerDoesNotReportRevertForNonRevertRPCErrors(t *testing.T) {
	for name, dataErr := range map[string]error{
		"insufficient funds, code -32000, no data": &fakeDataError{
			msg: "insufficient funds for gas * price + value", code: -32000, data: nil,
		},
		"execution reverted mid-message, code -32000": &fakeDataError{
			msg: "header not found: execution reverted while fetching", code: -32000, data: nil,
		},
	} {
		t.Run(name, func(t *testing.T) {
			backend := newTransactionBackend()
			backend.estimateErr = dataErr
			signer := transactionSigner(t, backend)
			_, err := signer.WriteContract(t.Context(), transactionRequest(signer))
			var revert *ExecutionRevertError
			if errors.As(err, &revert) {
				t.Fatalf("non-revert RPC error misreported as revert: %v", err)
			}
			if len(backend.sent) != 0 {
				t.Fatal("failed estimation still broadcast")
			}
		})
	}
}

func TestEthereumSignerLeavesOtherEstimationErrorsUnwrapped(t *testing.T) {
	backend := newTransactionBackend()
	backend.estimateErr = errors.New("connection reset")
	signer := transactionSigner(t, backend)
	_, err := signer.WriteContract(t.Context(), transactionRequest(signer))
	var revert *ExecutionRevertError
	if errors.As(err, &revert) {
		t.Fatalf("unrelated error misreported as revert: %v", err)
	}
	if err == nil || err.Error() != "connection reset" {
		t.Fatalf("unrelated estimation error changed: %v", err)
	}
}

func TestSDKErrorDetailsSurviveWrapping(t *testing.T) {
	for name, err := range map[string]error{
		"broadcast": newBroadcastUncertainError(common.Hash{1}, ErrSigningRejected),
		"rpc":       &RPCError{SDKError: SDKError{Code: "TRANSACTION_OUTCOME_UNKNOWN"}, cause: ErrSigningRejected},
	} {
		t.Run(name, func(t *testing.T) {
			var details *SDKError
			if !errors.As(err, &details) || details.Code != "TRANSACTION_OUTCOME_UNKNOWN" {
				t.Fatalf("details lost: %v", err)
			}
			if !errors.Is(err, ErrSigningRejected) {
				t.Fatalf("cause lost: %v", err)
			}
		})
	}
}
