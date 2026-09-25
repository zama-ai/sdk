package sidecar

import (
	"bytes"
	"context"
	"errors"
	"math/big"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	pb "github.com/zama-ai/sdk/clients/go/internal/gen/zama/sdk/v1alpha1"
)

func transactionWire() *pb.ContractWriteRequest {
	return &pb.ContractWriteRequest{Address: common.Address{4}.Bytes(), Data: []byte{1, 2, 3, 4}, AbiJson: `[{"type":"function","name":"transfer"}]`, FunctionName: "transfer", ArgsJson: `["9007199254740993"]`}
}

func TestContractWritePreservesPresenceAndRejectsMalformedPayload(t *testing.T) {
	zero, large := "0", "9007199254740993"
	wire := transactionWire()
	wire.Value, wire.Gas = &large, &zero
	action := &pb.SignerAction{OperationId: "operation", ActionId: "action", Account: &pb.WalletAccount{Address: common.Address{1}.Bytes(), ChainId: 1}, Request: &pb.SignerAction_ContractWrite{ContractWrite: wire}}
	calls := 0
	config := SignerConfig{WriteContract: func(_ context.Context, r ContractWriteRequest) (common.Hash, error) {
		calls++
		if r.OperationID != "operation" || r.ActionID != "action" || r.Account.ChainID != 1 || r.Value.String() != large || r.Gas.Cmp(big.NewInt(0)) != 0 || string(r.Args) != `["9007199254740993"]` {
			t.Fatal("transaction payload changed")
		}
		return common.Hash{9}, nil
	}}
	reply := new(pb.SignerReply)
	if err := invokeSigner(t.Context(), action, config, reply); err != nil || common.BytesToHash(reply.GetTransactionHash()) != (common.Hash{9}) {
		t.Fatalf("transaction failed: %v", err)
	}
	wire.Value, wire.Gas = nil, nil
	request, err := contractWriteRequest("operation", "action", WalletAccount{}, wire)
	if err != nil || request.Value != nil || request.Gas != nil {
		t.Fatal("omission lost")
	}
	bad := "01"
	wire.Gas = &bad
	if invokeSigner(t.Context(), action, config, new(pb.SignerReply)) == nil || calls != 1 {
		t.Fatal("malformed amount reached wallet")
	}
	wire.Gas = nil
	if invokeSigner(t.Context(), action, SignerConfig{SignTypedData: config.SignTypedData}, new(pb.SignerReply)) == nil || calls != 1 {
		t.Fatal("write reached a typed-data-only signer")
	}
	action.Request = nil
	if invokeSigner(t.Context(), action, config, new(pb.SignerReply)) == nil || calls != 1 {
		t.Fatal("empty action reached wallet")
	}
}

func TestTransactionChannelCorrelationRejectionAndDuplicates(t *testing.T) {
	server := newSigningServer()
	server.contractWrite = transactionWire()
	server.duplicateActions = true
	server.staleReply = true
	client := testClient(t, server, nil)
	var calls atomic.Int32
	sdk, err := client.CreateContext(testContext(t), SDKConfig{}, SignerConfig{Account: &WalletAccount{Address: common.Address{1}, ChainID: 1}, WriteContract: func(_ context.Context, r ContractWriteRequest) (common.Hash, error) {
		calls.Add(1)
		if r.OperationID == "1" {
			return common.Hash{}, ErrSigningRejected
		}
		return common.Hash{42}, nil
	}})
	if err != nil {
		t.Fatal(err)
	}
	defer sdk.Close(testContext(t))
	_, err = decrypt(sdk, testContext(t))
	var details *RPCError
	if !errors.As(err, &details) || details.Code != "SIGNING_REJECTED" {
		t.Fatalf("rejection lost: %v", err)
	}
	result, err := decrypt(sdk, testContext(t))
	if err != nil || result[common.Hash{}].Integer.Int64() != 42 || calls.Load() != 2 {
		t.Fatalf("misrouted/replayed write: %v calls=%d", err, calls.Load())
	}
}

func TestTransactionChannelCancellationAndLossAfterSubmission(t *testing.T) {
	for _, disconnect := range []bool{false, true} {
		t.Run(map[bool]string{false: "cancel", true: "disconnect"}[disconnect], func(t *testing.T) {
			server := newSigningServer()
			server.contractWrite = transactionWire()
			client := testClient(t, server, nil)
			started, stopped := make(chan struct{}), make(chan struct{})
			var broadcasts atomic.Int32
			sdk, err := client.CreateContext(testContext(t), SDKConfig{}, SignerConfig{Account: &WalletAccount{Address: common.Address{1}, ChainID: 1}, WriteContract: func(ctx context.Context, _ ContractWriteRequest) (common.Hash, error) {
				broadcasts.Add(1)
				close(started)
				<-ctx.Done()
				close(stopped)
				return common.Hash{42}, nil
			}})
			if err != nil {
				t.Fatal(err)
			}
			defer sdk.Close(testContext(t))
			ctx, cancel := context.WithCancel(testContext(t))
			defer cancel()
			done := make(chan error, 1)
			go func() { _, err := decrypt(sdk, ctx); done <- err }()
			select {
			case <-started:
			case <-time.After(time.Second):
				t.Fatal("write not started")
			}
			if disconnect {
				server.disconnect(sdk.id)
			} else {
				cancel()
			}
			select {
			case err := <-done:
				if err == nil {
					t.Fatal("lost callback succeeded")
				}
			case <-time.After(time.Second):
				t.Fatal("operation hung")
			}
			select {
			case <-stopped:
			case <-time.After(time.Second):
				t.Fatal("callback was not cancelled")
			}
			if broadcasts.Load() != 1 {
				t.Fatal("transaction replayed")
			}
		})
	}
}

func TestConcurrentTransactionCallbacksRemainCorrelated(t *testing.T) {
	server := newSigningServer()
	server.contractWrite = transactionWire()
	client := testClient(t, server, nil)
	started, release := make(chan struct{}), make(chan struct{})
	sdk, err := client.CreateContext(testContext(t), SDKConfig{}, SignerConfig{Account: &WalletAccount{Address: common.Address{1}, ChainID: 1}, WriteContract: func(ctx context.Context, request ContractWriteRequest) (common.Hash, error) {
		if request.OperationID == "1" {
			close(started)
			select {
			case <-release:
				return common.Hash{11}, nil
			case <-ctx.Done():
				return common.Hash{}, ctx.Err()
			}
		}
		return common.Hash{22}, nil
	}})
	if err != nil {
		t.Fatal(err)
	}
	defer sdk.Close(testContext(t))
	done := make(chan error, 1)
	go func() {
		result, err := decrypt(sdk, testContext(t))
		if err == nil && result[common.Hash{}].Integer.Int64() != 11 {
			err = errors.New("first transaction hash misrouted")
		}
		done <- err
	}()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("first transaction not started")
	}
	result, err := decrypt(sdk, testContext(t))
	if err != nil || result[common.Hash{}].Integer.Int64() != 22 {
		t.Fatalf("second transaction blocked/misrouted: %v", err)
	}
	close(release)
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("first transaction did not finish")
	}
}

func TestTransactionChannelReportsExecutionRevert(t *testing.T) {
	server := newSigningServer()
	server.contractWrite = transactionWire()
	client := testClient(t, server, nil)
	revertErr := &ExecutionRevertError{Data: []byte{0xde, 0xad}, Cause: errors.New("execution reverted: AlreadyDelegatedOrRevokedInSameBlock()")}
	sdk, err := client.CreateContext(testContext(t), SDKConfig{}, SignerConfig{Account: &WalletAccount{Address: common.Address{1}, ChainID: 1}, WriteContract: func(context.Context, ContractWriteRequest) (common.Hash, error) {
		return common.Hash{}, revertErr
	}})
	if err != nil {
		t.Fatal(err)
	}
	defer sdk.Close(testContext(t))
	if _, err := decrypt(sdk, testContext(t)); err == nil {
		t.Fatal("reverted write succeeded")
	}
	server.mu.Lock()
	revert := server.capturedRevert
	server.mu.Unlock()
	if revert == nil {
		t.Fatal("execution_revert reply not sent")
	}
	if !bytes.Equal(revert.Data, revertErr.Data) {
		t.Fatalf("revert data lost over the wire: %x", revert.Data)
	}
	if revert.Message != revertErr.Error() {
		t.Fatalf("revert message lost: %q", revert.Message)
	}
}

func TestTransactionChannelStillReportsSigningFailedForPlainErrors(t *testing.T) {
	server := newSigningServer()
	server.contractWrite = transactionWire()
	client := testClient(t, server, nil)
	sdk, err := client.CreateContext(testContext(t), SDKConfig{}, SignerConfig{Account: &WalletAccount{Address: common.Address{1}, ChainID: 1}, WriteContract: func(context.Context, ContractWriteRequest) (common.Hash, error) {
		return common.Hash{}, errors.New("wallet locked")
	}})
	if err != nil {
		t.Fatal(err)
	}
	defer sdk.Close(testContext(t))
	_, err = decrypt(sdk, testContext(t))
	var details *RPCError
	if !errors.As(err, &details) || details.Code != "SIGNING_FAILED" {
		t.Fatalf("plain callback error misreported: %v", err)
	}
	server.mu.Lock()
	revert := server.capturedRevert
	server.mu.Unlock()
	if revert != nil {
		t.Fatal("plain error misreported as execution revert")
	}
}

func TestContractWriteRejectsNonCanonicalAmounts(t *testing.T) {
	for _, encoded := range []string{"-1", "-0", "01", "", " 1", "+1", "1.0", "0x1"} {
		t.Run(encoded, func(t *testing.T) {
			wire := transactionWire()
			wire.Value = &encoded
			if _, err := contractWriteRequest("operation", "action", WalletAccount{}, wire); err == nil {
				t.Fatal("malformed amount decoded")
			}
		})
	}
}
