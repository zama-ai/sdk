package main

import (
	"context"
	"errors"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/zama-ai/sdk/clients/go/v3"
	"github.com/zama-ai/sdk/clients/go/v3/examples/balance/contracts"
)

const sepoliaChainID = 11155111

func connectEthereum(ctx context.Context, config exampleConfig) (*ethclient.Client, zama.SignerConfig, error) {
	rpc, err := ethclient.DialContext(ctx, config.rpcURL)
	if err != nil {
		return nil, zama.SignerConfig{}, err
	}
	fail := func(err error) (*ethclient.Client, zama.SignerConfig, error) {
		rpc.Close()
		return nil, zama.SignerConfig{}, err
	}
	chain, err := rpc.ChainID(ctx)
	if err != nil {
		return fail(err)
	}
	if !chain.IsUint64() || chain.Uint64() != sepoliaChainID {
		return fail(errors.New("RPC must use Sepolia"))
	}
	signer, err := zama.NewEthereumSigner(config.privateKey, sepoliaChainID, rpc)
	if err != nil {
		return fail(err)
	}
	if signer.Account.Address != config.owner {
		return fail(errors.New("wallet does not match owner"))
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
