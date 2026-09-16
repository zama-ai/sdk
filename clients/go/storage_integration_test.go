package sidecar

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"os"
	"reflect"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/signer/core/apitypes"
)

func TestExternalStorageAcrossSidecarRestart(t *testing.T) {
	socket := os.Getenv("SIDECAR_STORAGE_TEST_SOCKET")
	if socket == "" {
		t.Skip("set SIDECAR_STORAGE_TEST_SOCKET with the SDK fixture restart harness")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	config := NewSDKConfig(31337, "http://localhost")
	config.Storage = ApplicationStorage(NewMemoryStorage())
	var signatures atomic.Int32
	signer := SignerConfig{Account: &WalletAccount{Address: common.BytesToAddress(bytes.Repeat([]byte{0x2b}, 20)), ChainID: 31337}, SignTypedData: func(context.Context, WalletAccount, apitypes.TypedData) ([]byte, error) {
		signatures.Add(1)
		return bytes.Repeat([]byte{0x33}, 65), nil
	}}
	input := EncryptedInput{EncryptedValue: common.BytesToHash(bytes.Repeat([]byte{0xab}, 32)), ContractAddress: common.BytesToAddress(bytes.Repeat([]byte{0x1a}, 20))}
	decryptOnce := func(handle common.Hash) ClearValue {
		t.Helper()
		client, err := Dial(socket)
		if err != nil {
			t.Fatal(err)
		}
		defer client.Close()
		sdk, err := client.CreateContext(ctx, config, signer)
		if err != nil {
			t.Fatal(err)
		}
		input.EncryptedValue = handle
		values, err := sdk.DecryptValues(ctx, []EncryptedInput{input}, DecryptOptions{})
		if err != nil {
			t.Fatal(err)
		}
		value, found := values[input.EncryptedValue]
		if !found {
			t.Fatal("fixture decryption value missing")
		}
		if err := sdk.Close(ctx); err != nil {
			t.Fatal(err)
		}
		return value
	}
	first := decryptOnce(input.EncryptedValue)
	if signatures.Load() != 1 {
		t.Fatalf("initial signatures=%d, want1", signatures.Load())
	}
	fmt.Println("STORAGE_READY")
	resumed := make(chan error, 1)
	go func() { _, err := bufio.NewReader(os.Stdin).ReadString('\n'); resumed <- err }()
	select {
	case err := <-resumed:
		if err != nil {
			t.Fatal(err)
		}
	case <-ctx.Done():
		t.Fatal("sidecar restart harness did not resume")
	}
	second := decryptOnce(common.BytesToHash(bytes.Repeat([]byte{0xcd}, 32)))
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("decryption changed after restart: %#v %#v", first, second)
	}
	if signatures.Load() != 1 {
		t.Fatalf("native persisted permit was not reused: signatures=%d", signatures.Load())
	}
	fmt.Println("STORAGE_REUSED")
}
