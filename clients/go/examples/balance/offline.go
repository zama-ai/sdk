package main

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/rlp"
	sidecar "github.com/zama-ai/sdk/clients/go"
)

func prepareOffline(ctx context.Context, sdk *sidecar.SDKContext, token, owner common.Address, privateKey string) error {
	// A positive expiry in the past revokes the operator; the SDK never defaults this value.
	until := uint64(1)
	prepared, err := sdk.PrepareTransaction(ctx, sidecar.SetOperatorRequest{
		From: owner, Token: token, Operator: common.HexToAddress("0x1111111111111111111111111111111111111111"), Until: &until,
	}, nil)
	if err != nil {
		return err
	}
	if prepared.Kind != sidecar.TransactionSetOperator {
		return errors.New("expected prepared SetOperator transaction")
	}
	signed, err := signPreparedTransaction(prepared, privateKey)
	if err != nil {
		return err
	}
	encoded, err := signed.MarshalBinary()
	if err != nil {
		return err
	}
	fmt.Printf("Offline %s: locally signed transaction %s\nSigned bytes: 0x%x\nCaller owns broadcasting; this demo does not broadcast.\n", prepared.Kind, signed.Hash(), encoded)
	return nil
}

func signPreparedTransaction(prepared sidecar.PreparedTransaction, privateKey string) (*types.Transaction, error) {
	key, err := crypto.HexToECDSA(strings.TrimPrefix(privateKey, "0x"))
	if err != nil {
		return nil, errors.New("invalid signing key")
	}
	if crypto.PubkeyToAddress(key.PublicKey) != prepared.From {
		return nil, errors.New("prepared sender does not match signing key")
	}
	if len(prepared.UnsignedTx) == 0 || prepared.UnsignedTx[0] != types.DynamicFeeTxType {
		return nil, errors.New("expected unsigned EIP-1559 transaction")
	}
	// Unsigned EIP-1559 RLP omits the three signature fields required by geth's transaction decoder.
	var payload struct {
		ChainID    *big.Int
		Nonce      uint64
		GasTipCap  *big.Int
		GasFeeCap  *big.Int
		Gas        uint64
		To         *common.Address `rlp:"nil"`
		Value      *big.Int
		Data       []byte
		AccessList types.AccessList
	}
	if err := rlp.DecodeBytes(prepared.UnsignedTx[1:], &payload); err != nil {
		return nil, err
	}
	if !payload.ChainID.IsUint64() || payload.ChainID.Uint64() != sepoliaChainID {
		return nil, errors.New("prepared transaction must use Sepolia")
	}
	tx := types.NewTx(&types.DynamicFeeTx{ChainID: payload.ChainID, Nonce: payload.Nonce, GasTipCap: payload.GasTipCap, GasFeeCap: payload.GasFeeCap, Gas: payload.Gas, To: payload.To, Value: payload.Value, Data: payload.Data, AccessList: payload.AccessList})
	return types.SignTx(tx, types.LatestSignerForChainID(payload.ChainID), key)
}
