package main

import (
	"bytes"
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/rlp"
	"github.com/zama-ai/sdk/clients/go/v3"
)

func TestSignPreparedTransaction(t *testing.T) {
	keyHex := "0000000000000000000000000000000000000000000000000000000000000001"
	key, err := crypto.HexToECDSA(keyHex)
	if err != nil {
		t.Fatal(err)
	}
	from := crypto.PubkeyToAddress(key.PublicKey)
	to := common.Address{9}
	data := []byte{1, 2, 3, 255}
	encoded, err := rlp.EncodeToBytes([]any{big.NewInt(sepoliaChainID), uint64(7), big.NewInt(2), big.NewInt(10), uint64(65000), to, big.NewInt(0), data, types.AccessList{}})
	if err != nil {
		t.Fatal(err)
	}
	prepared := zama.PreparedTransaction{Kind: zama.TransactionSetOperator, From: from, UnsignedTx: append([]byte{2}, encoded...)}
	tx, err := signPreparedTransaction(prepared, keyHex)
	if err != nil {
		t.Fatal(err)
	}
	sender, err := types.Sender(types.LatestSignerForChainID(big.NewInt(sepoliaChainID)), tx)
	if err != nil || sender != from {
		t.Fatalf("signature sender: %s %v", sender, err)
	}
	if tx.Nonce() != 7 || tx.Gas() != 65000 || tx.GasFeeCap().Cmp(big.NewInt(10)) != 0 || tx.GasTipCap().Cmp(big.NewInt(2)) != 0 || *tx.To() != to || !bytes.Equal(tx.Data(), data) || tx.Value().Sign() != 0 {
		t.Fatal("unsigned transaction fields changed")
	}
	raw, err := tx.MarshalBinary()
	if err != nil {
		t.Fatal(err)
	}
	var decoded types.Transaction
	if err := decoded.UnmarshalBinary(raw); err != nil || decoded.Hash() != tx.Hash() {
		t.Fatalf("signed handoff malformed: %v", err)
	}
	prepared.From = common.Address{8}
	if _, err := signPreparedTransaction(prepared, keyHex); err == nil {
		t.Fatal("wrong signer accepted")
	}
	prepared.From = from
	prepared.UnsignedTx = []byte{2, 0xff}
	if _, err := signPreparedTransaction(prepared, keyHex); err == nil {
		t.Fatal("malformed RLP accepted")
	}
	prepared.UnsignedTx = []byte{1, 0xff}
	if _, err := signPreparedTransaction(prepared, keyHex); err == nil {
		t.Fatal("wrong transaction type accepted")
	}
}
