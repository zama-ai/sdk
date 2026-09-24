package main

import (
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
	sidecar "github.com/zama-ai/sdk/clients/go"
)

func showBalance(ctx context.Context, provider *ethclient.Client, sdk *sidecar.SDKContext, token, owner common.Address, output io.Writer) error {
	name, encrypted, err := readToken(ctx, provider, token, owner)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(output, "User Address: %s\nToken: %s (%s) https://eth-sepolia.blockscout.com/token/%s\nEncrypted balance: %s\n", owner.Hex(), name, token.Hex(), token.Hex(), encrypted.Hex()); err != nil {
		return err
	}
	values, err := sdk.DecryptValues(ctx, []sidecar.EncryptedInput{{EncryptedValue: encrypted, ContractAddress: token}}, sidecar.DecryptOptions{})
	if err != nil {
		return err
	}
	balance, ok := values[encrypted]
	if !ok || balance.Kind != sidecar.ClearBigInt {
		return errors.New("decryption returned no integer balance")
	}
	_, err = fmt.Fprintf(output, "Decrypted balance: %s\n", balance.Integer)
	return err
}
