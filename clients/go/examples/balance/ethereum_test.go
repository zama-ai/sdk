package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ethereum/go-ethereum/common"
)

func TestConnectEthereumInstallsTransactionAdapter(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			ID     json.RawMessage `json:"id"`
			Method string          `json:"method"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Error(err)
			return
		}
		if request.Method != "eth_chainId" {
			t.Errorf("unexpected setup method: %s", request.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": request.ID, "result": "0xaa36a7"})
	}))
	defer server.Close()
	rpc, signer, err := connectEthereum(t.Context(), exampleConfig{
		rpcURL:     server.URL,
		privateKey: "0000000000000000000000000000000000000000000000000000000000000001",
		owner:      common.HexToAddress("0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf"),
	})
	if err != nil {
		t.Fatal(err)
	}
	defer rpc.Close()
	if signer.SignTypedData == nil || signer.WriteContract == nil || signer.Account.ChainID != sepoliaChainID {
		t.Fatal("example wallet is missing SDK signer capabilities")
	}
}
