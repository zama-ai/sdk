package main

import (
	"errors"
	"fmt"

	"github.com/ethereum/go-ethereum/common"
	"github.com/joho/godotenv"
)

type exampleConfig struct {
	socket        string
	rpcURL        string
	token         common.Address
	owner         common.Address
	privateKey    string
	relayerAPIKey string
}

func loadConfig(args []string) (exampleConfig, error) {
	if len(args) != 2 {
		return exampleConfig{}, errors.New("usage: balance SOCKET ENV_FILE")
	}
	config, err := godotenv.Read(args[1])
	if err != nil {
		return exampleConfig{}, errors.New("cannot read example config")
	}
	for _, field := range []string{"OWNER_ADDRESS", "CONFIDENTIAL_TOKEN_ADDRESS"} {
		if !common.IsHexAddress(config[field]) {
			return exampleConfig{}, fmt.Errorf("invalid %s", field)
		}
	}
	return exampleConfig{socket: args[0], rpcURL: config["SEPOLIA_RPC_URL"], token: common.HexToAddress(config["CONFIDENTIAL_TOKEN_ADDRESS"]), owner: common.HexToAddress(config["OWNER_ADDRESS"]), privateKey: config["TEST_WALLET_PRIVATE_KEY"], relayerAPIKey: config["RELAYER_API_KEY"]}, nil
}
