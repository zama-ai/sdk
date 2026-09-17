package sidecar

import (
	"context"
	"errors"
	"math/big"
	"os"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func encryptionContext(ctx context.Context, t *testing.T, client *Client, scenario string) *SDKContext {
	t.Helper()
	relayer := "http://fixture.invalid/" + scenario
	sdk, err := client.CreateContext(ctx, SDKConfig{Chains: []ChainConfig{{ID: 31337, RelayerURL: &relayer}}}, SignerConfig{})
	if err != nil {
		t.Fatal(err)
	}
	return sdk
}

func TestEncryptionSDKIntegration(t *testing.T) {
	socket := os.Getenv("SIDECAR_ENCRYPT_TEST_SOCKET")
	if socket == "" {
		t.Skip("set SIDECAR_ENCRYPT_TEST_SOCKET with the SDK encryption fixture")
	}
	client, err := Dial(socket)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	ctx := testContext(t)
	user := common.HexToAddress("0x2222222222222222222222222222222222222222")
	contract := common.HexToAddress("0x1111111111111111111111111111111111111111")
	large := new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), 256), big.NewInt(1))
	forty2 := big.NewInt(42)
	params := EncryptParams{
		Values: []EncryptInput{
			Euint256(large),
			Ebool(false),
			EboolBigInt(big.NewInt(1)),
			Eaddress(user),
			Euint8(big.NewInt(-1)),
			Euint8(forty2),
			Euint16(forty2),
			Euint32(forty2),
			Euint64(forty2),
			Euint128(forty2),
		},
		ContractAddress: contract,
		UserAddress:     user,
	}
	success := encryptionContext(ctx, t, client, "")
	zero, half := uint32(0), uint32(500)
	var first []common.Hash
	for _, timeout := range []*uint32{nil, nil, &zero, &half} {
		result, err := success.Encrypt(ctx, params, EncryptOptions{TimeoutMS: timeout})
		if err != nil {
			t.Fatal(err)
		}
		if len(result.EncryptedValues) != len(params.Values) || len(result.InputProof) == 0 {
			t.Fatalf("handle count or proof changed: %d handles, %d proof bytes", len(result.EncryptedValues), len(result.InputProof))
		}
		for i, handle := range result.EncryptedValues {
			if handle == (common.Hash{}) {
				t.Fatalf("empty handle at %d", i)
			}
		}
		if first == nil {
			first = result.EncryptedValues
			continue
		}
		if len(first) == len(result.EncryptedValues) && first[0] == result.EncryptedValues[0] {
			t.Fatal("handles repeated across encryptions")
		}
	}
	rateLimited := encryptionContext(ctx, t, client, "rate-limited")
	_, err = rateLimited.Encrypt(ctx, params, EncryptOptions{})
	var details *SDKError
	if !errors.As(err, &details) || details.Code != "RELAYER_REQUEST_FAILED" || !details.Retryable || details.RetryAfterSeconds == nil || *details.RetryAfterSeconds != 7 || status.Code(err) != codes.FailedPrecondition {
		t.Fatalf("structured SDK failure changed: %v", err)
	}
	invalid := EncryptParams{Values: []EncryptInput{Euint8(big.NewInt(-1))}, ContractAddress: contract, UserAddress: user}
	invalidInput := encryptionContext(ctx, t, client, "invalid-input")
	_, err = invalidInput.Encrypt(ctx, invalid, EncryptOptions{})
	if !errors.As(err, &details) || details.Code != "ENCRYPTION_FAILED" || details.Retryable {
		t.Fatalf("canonical SDK validation error changed: %v", err)
	}
	cancelled := encryptionContext(ctx, t, client, "cancelled")
	cancelCtx, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
	defer cancel()
	if _, err := cancelled.Encrypt(cancelCtx, params, EncryptOptions{}); status.Code(err) != codes.DeadlineExceeded {
		t.Fatalf("deadline: %v", err)
	}
	// Left open so the driver observes the RPC abort rather than the context close.
	if err := success.Close(ctx); err != nil {
		t.Fatal(err)
	}
	if err := rateLimited.Close(ctx); err != nil {
		t.Fatal(err)
	}
	if err := invalidInput.Close(ctx); err != nil {
		t.Fatal(err)
	}
}
