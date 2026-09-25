package main

import (
	"errors"
	"fmt"
	"strconv"

	"github.com/zama-ai/sdk/clients/go/v3"

	"github.com/ethereum/go-ethereum/common"
	"github.com/joho/godotenv"
)

type exampleConfig struct {
	socket        string
	rpcURL        string
	token         common.Address
	owner         common.Address
	delegate      common.Address
	privateKey    string
	relayerAPIKey string
	values        map[string]string
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
	owner := common.HexToAddress(config["OWNER_ADDRESS"])
	delegate := common.HexToAddress("0x2222222222222222222222222222222222222222")
	if value := config["DELEGATE_ADDRESS"]; value != "" {
		if !common.IsHexAddress(value) {
			return exampleConfig{}, errors.New("invalid DELEGATE_ADDRESS")
		}
		delegate = common.HexToAddress(value)
	}
	if delegate == owner {
		return exampleConfig{}, errors.New("DELEGATE_ADDRESS must not equal OWNER_ADDRESS")
	}
	return exampleConfig{socket: args[0], rpcURL: config["SEPOLIA_RPC_URL"], token: common.HexToAddress(config["CONFIDENTIAL_TOKEN_ADDRESS"]), owner: owner, delegate: delegate, privateKey: config["TEST_WALLET_PRIVATE_KEY"], relayerAPIKey: config["RELAYER_API_KEY"], values: config}, nil
}

func (config exampleConfig) sdkConfig() (zama.SDKConfig, error) {
	chain := zama.ChainConfig{ID: sepoliaChainID, Network: &config.rpcURL}
	if config.relayerAPIKey != "" {
		chain.Auth = zama.APIKeyHeader{Value: config.relayerAPIKey}
	}
	if value := config.values["SDK_RPC_TIMEOUT_MS"]; value != "" {
		timeout, err := strconv.ParseUint(value, 10, 32)
		if err != nil {
			return zama.SDKConfig{}, errors.New("invalid SDK_RPC_TIMEOUT_MS")
		}
		timeoutValue := uint32(timeout)
		chain.Provider = &zama.ProviderOptions{Timeout: &timeoutValue}
	}
	sdkConfig := zama.SDKConfig{Chains: []zama.ChainConfig{chain}}
	switch config.values["CREDENTIAL_STORAGE"] {
	case "", "application-memory":
		sdkConfig.Storage = zama.ApplicationStorage(zama.NewMemoryStorage())
	case "daemon-memory":
		sdkConfig.Storage = zama.DaemonMemoryStorage()
	case "persistent":
		name, present := config.values["CREDENTIAL_STORE_NAME"]
		if !present {
			return zama.SDKConfig{}, errors.New("missing CREDENTIAL_STORE_NAME")
		}
		sdkConfig.Storage = zama.DaemonPersistentStorage(name)
	default:
		return zama.SDKConfig{}, errors.New("invalid CREDENTIAL_STORAGE")
	}
	if value, present := config.values["TRANSPORT_KEY_PAIR_DERIVATION_SECRET"]; present {
		sdkConfig.TransportKeyPairDerivationSecret = zama.TextDerivationSecret(value)
	}
	if value := config.values["SDK_SINGLE_THREAD"]; value != "" {
		enabled, err := strconv.ParseBool(value)
		if err != nil {
			return zama.SDKConfig{}, errors.New("invalid SDK_SINGLE_THREAD")
		}
		sdkConfig.ProcessRuntime = &zama.ProcessRuntime{SingleThread: &enabled}
	}
	if value := config.values["SDK_BATCH_RPC_CALLS"]; value != "" {
		enabled, err := strconv.ParseBool(value)
		if err != nil {
			return zama.SDKConfig{}, errors.New("invalid SDK_BATCH_RPC_CALLS")
		}
		sdkConfig.Relayers = map[uint64]zama.RelayerConfig{
			sepoliaChainID: {Transport: zama.RelayerNode, Options: &zama.RelayerOptions{BatchRPCCalls: &enabled}},
		}
	}
	return sdkConfig, nil
}
