package sidecar

import (
	"context"
	"encoding/json"
	"errors"
	"math/big"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type encryptionScenarios struct {
	RateLimited  uint32 `json:"rateLimited"`
	Cancelled    uint32 `json:"cancelled"`
	InvalidInput uint32 `json:"invalidInput"`
}

func loadEncryptionScenarios(t *testing.T) encryptionScenarios {
	t.Helper()
	contents, err := os.ReadFile("../../proto/fixtures/encryption-scenarios.json")
	if err != nil {
		t.Fatal(err)
	}
	var scenarios encryptionScenarios
	if err := json.Unmarshal(contents, &scenarios); err != nil {
		t.Fatal(err)
	}
	return scenarios
}

func TestEncryptionSDKIntegration(t *testing.T) {
	socket := os.Getenv("SIDECAR_ENCRYPT_TEST_SOCKET")
	if socket == "" {
		t.Skip("set SIDECAR_ENCRYPT_TEST_SOCKET with the SDK encryption fixture")
	}
	scenarios := loadEncryptionScenarios(t)
	client, err := Dial(socket)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	ctx := testContext(t)
	sdk, err := client.CreateContext(ctx, NewSDKConfig(31337, "http://localhost"), SignerConfig{})
	if err != nil {
		t.Fatal(err)
	}
	defer sdk.Close(ctx)
	user := common.HexToAddress("0x2222222222222222222222222222222222222222")
	contract := common.HexToAddress("0x1111111111111111111111111111111111111111")
	large := new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), 256), big.NewInt(1))
	values := []EncryptInput{IntegerInput{Type: EUint256, Value: large}, BoolInput{Value: false}, BoolBigIntInput{Value: big.NewInt(1)}, AddressInput{Value: user}, IntegerInput{Type: EUint8, Value: big.NewInt(-1)}}
	for _, typ := range []IntegerType{EUint8, EUint16, EUint32, EUint64, EUint128} {
		values = append(values, IntegerInput{Type: typ, Value: big.NewInt(42)})
	}
	params := EncryptParams{Values: values, UserAddress: user, ContractAddress: contract}
	for _, timeout := range []*uint32{nil, new(uint32)} {
		result, err := sdk.Encrypt(ctx, params, EncryptOptions{TimeoutMS: timeout})
		if err != nil {
			t.Fatal(err)
		}
		if len(result.EncryptedValues) != len(values) {
			t.Fatal("handle count changed")
		}
		var proof struct {
			Values []struct {
				Type  string `json:"type"`
				Value any    `json:"value"`
			} `json:"values"`
			ContractAddress string  `json:"contractAddress"`
			UserAddress     string  `json:"userAddress"`
			Timeout         *uint32 `json:"timeout"`
		}
		if err := json.Unmarshal(result.InputProof, &proof); err != nil {
			t.Fatal(err)
		}
		if len(proof.Values) != len(values) || proof.Values[0].Value != large.String() || proof.Values[1].Value != false || proof.Values[2].Value != "1" || !strings.EqualFold(proof.Values[3].Value.(string), user.Hex()) || proof.Values[4].Value != "-1" {
			t.Fatalf("SDK input semantics changed: %s", result.InputProof)
		}
		for i, typ := range []IntegerType{EUint8, EUint16, EUint32, EUint64, EUint128} {
			if proof.Values[i+5].Type != string(typ) || proof.Values[i+5].Value != "42" {
				t.Fatalf("numeric type changed: %s", result.InputProof)
			}
		}
		if !strings.EqualFold(proof.ContractAddress, contract.Hex()) || !strings.EqualFold(proof.UserAddress, user.Hex()) || (proof.Timeout == nil) != (timeout == nil) || (timeout != nil && *proof.Timeout != *timeout) {
			t.Fatalf("binding or options changed: %s", result.InputProof)
		}
	}
	empty, err := sdk.Encrypt(ctx, EncryptParams{ContractAddress: contract, UserAddress: user}, EncryptOptions{})
	if err != nil || len(empty.EncryptedValues) != 0 {
		t.Fatalf("empty inputs: %v", err)
	}
	timeout := scenarios.RateLimited
	_, err = sdk.Encrypt(ctx, params, EncryptOptions{TimeoutMS: &timeout})
	var details *SDKError
	if !errors.As(err, &details) || details.Code != "RELAYER_REQUEST_FAILED" {
		t.Fatalf("structured SDK failure: %v", err)
	}
	timeout = scenarios.InvalidInput
	for _, invalid := range []struct {
		name  string
		value EncryptInput
	}{
		{"negative integer", IntegerInput{Type: EUint8, Value: big.NewInt(-1)}},
		{"integer overflow", IntegerInput{Type: EUint8, Value: big.NewInt(256)}},
		{"invalid boolean integer", BoolBigIntInput{Value: big.NewInt(2)}},
	} {
		t.Run(invalid.name, func(t *testing.T) {
			_, err := sdk.Encrypt(ctx, EncryptParams{Values: []EncryptInput{invalid.value}, ContractAddress: contract, UserAddress: user}, EncryptOptions{TimeoutMS: &timeout})
			var details *SDKError
			if !errors.As(err, &details) || details.Code != "ENCRYPTION_FAILED" || details.Retryable {
				t.Fatalf("canonical SDK validation error changed: %v", err)
			}
		})
	}
	timeout = scenarios.Cancelled
	cancelCtx, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
	defer cancel()
	_, err = sdk.Encrypt(cancelCtx, params, EncryptOptions{TimeoutMS: &timeout})
	if status.Code(err) != codes.DeadlineExceeded {
		t.Fatalf("deadline: %v", err)
	}
}
