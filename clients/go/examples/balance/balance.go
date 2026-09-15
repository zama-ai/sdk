package main

import (
	"context"
	"errors"
	"fmt"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
	sidecar "github.com/zama-ai/sdk/clients/go"
)

func showBalance(ctx context.Context, provider *ethclient.Client, sdk *sidecar.SDKContext, token, owner common.Address) error {
	name, encrypted, err := readToken(ctx, provider, token, owner)
	if err != nil {
		return err
	}
	fmt.Printf("User Address: %s\n", owner.Hex())
	fmt.Printf("Token: %s (%s) https://eth-sepolia.blockscout.com/token/%s\n", name, token.Hex(), token.Hex())
	fmt.Printf("Encrypted balance: %s\n", encrypted.Hex())
	values, err := sdk.DecryptValues(ctx, []sidecar.EncryptedInput{{EncryptedValue: encrypted, ContractAddress: token}}, sidecar.DecryptOptions{})
	if err != nil {
		return err
	}
	balance, ok := values[encrypted]
	if !ok || balance.Kind != sidecar.ClearBigInt {
		return errors.New("decryption returned no integer balance")
	}
	fmt.Printf("Decrypted balance: %s\n", balance.Integer)
	return nil
}
