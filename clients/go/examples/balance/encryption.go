package main

import (
	"context"
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/common"
	"github.com/zama-ai/sdk/clients/go/v3"
)

func encryptInputs(ctx context.Context, sdk *zama.SDKContext, contract, user common.Address) error {
	result, err := sdk.Encrypt(ctx, zama.EncryptParams{
		Values: []zama.EncryptInput{
			zama.Euint64(big.NewInt(1000)),
			zama.Ebool(true),
			zama.Eaddress(user),
		},
		ContractAddress: contract,
		UserAddress:     user,
	}, zama.EncryptOptions{})
	if err != nil {
		return err
	}
	for i, value := range result.EncryptedValues {
		fmt.Printf("Encrypted input %d: %s\n", i, value.Hex())
	}
	fmt.Printf("Input proof: 0x%x\n", result.InputProof)
	return nil
}
