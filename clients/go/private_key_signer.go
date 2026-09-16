package sidecar

import (
	"context"
	"errors"
	"strings"

	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/signer/core/apitypes"
)

func NewPrivateKeySigner(privateKey string, chainID uint64) (SignerConfig, error) {
	key, err := crypto.HexToECDSA(strings.TrimPrefix(privateKey, "0x"))
	if err != nil {
		return SignerConfig{}, errors.New("invalid wallet private key")
	}
	account := WalletAccount{Address: crypto.PubkeyToAddress(key.PublicKey), ChainID: chainID}
	return SignerConfig{Account: &account, SignTypedData: func(ctx context.Context, requested WalletAccount, typed apitypes.TypedData) ([]byte, error) {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if requested.Address != account.Address {
			return nil, errors.New("signing account does not match wallet")
		}
		hash, _, err := apitypes.TypedDataAndHash(typed)
		if err != nil {
			return nil, err
		}
		signature, err := crypto.Sign(hash, key)
		if err != nil {
			return nil, err
		}
		signature[64] += 27
		return signature, nil
	}}, nil
}
