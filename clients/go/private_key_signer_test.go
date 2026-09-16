package sidecar

import (
	"encoding/json"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/signer/core/apitypes"
	"testing"
)

func TestPrivateKeySignerUsesUpdatedChainAndEthereumSignature(t *testing.T) {
	signer, err := NewPrivateKeySigner("0000000000000000000000000000000000000000000000000000000000000001", 1)
	if err != nil {
		t.Fatal(err)
	}
	account := *signer.Account
	account.ChainID = 11155111
	var typed apitypes.TypedData
	if err := json.Unmarshal([]byte(`{"types":{"EIP712Domain":[{"name":"chainId","type":"uint256"}],"Request":[{"name":"value","type":"uint256"}]},"primaryType":"Request","domain":{"chainId":"11155111"},"message":{"value":"1"}}`), &typed); err != nil {
		t.Fatal(err)
	}
	signature, err := signer.SignTypedData(testContext(t), account, typed)
	if err != nil {
		t.Fatal(err)
	}
	if len(signature) != 65 {
		t.Fatal("invalid signature length")
	}
	hash, _, err := apitypes.TypedDataAndHash(typed)
	if err != nil {
		t.Fatal(err)
	}
	signature[64] -= 27
	public, err := crypto.SigToPub(hash, signature)
	if err != nil {
		t.Fatal(err)
	}
	if crypto.PubkeyToAddress(*public) != account.Address {
		t.Fatal("signature does not recover wallet")
	}
	account.Address = common.Address{}
	if _, err := signer.SignTypedData(testContext(t), account, typed); err == nil {
		t.Fatal("different wallet accepted")
	}
}
