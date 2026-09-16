package main

import (
	"context"
	"errors"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
	sidecar "github.com/zama-ai/sdk/clients/go"
	"github.com/zama-ai/sdk/clients/go/examples/balance/contracts"
)

const sepoliaChainID = 11155111

func connectEthereum(ctx context.Context, config exampleConfig) (*ethclient.Client, sidecar.SignerConfig, error) {
	signer, err := sidecar.NewPrivateKeySigner(config.privateKey, sepoliaChainID)
	if err != nil {
		return nil, sidecar.SignerConfig{}, err
	}
	if signer.Account.Address != config.owner {
		return nil, sidecar.SignerConfig{}, errors.New("wallet does not match owner")
	}
	rpc, err := ethclient.DialContext(ctx, config.rpcURL)
	if err != nil {
		return nil, sidecar.SignerConfig{}, err
	}
	chain, err := rpc.ChainID(ctx)
	if err != nil {
		rpc.Close()
		return nil, sidecar.SignerConfig{}, err
	}
	if !chain.IsUint64() || chain.Uint64() != sepoliaChainID {
		rpc.Close()
		return nil, sidecar.SignerConfig{}, errors.New("RPC must use Sepolia")
	}
	return rpc, signer, nil
}

func readToken(ctx context.Context, rpc *ethclient.Client, token, owner common.Address) (string, common.Hash, error) {
	ctoken, err := contracts.NewConfidentialTokenCaller(token, rpc)
	if err != nil {
		return "", common.Hash{}, err
	}
	opts := &bind.CallOpts{Context: ctx}
	name, err := ctoken.Name(opts)
	if err != nil {
		return "", common.Hash{}, err
	}
	handle, err := ctoken.ConfidentialBalanceOf(opts, owner)
	if err != nil {
		return "", common.Hash{}, err
	}
	return name, common.Hash(handle), nil
}
