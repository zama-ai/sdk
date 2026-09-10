package sidecar

import "encoding/json"

type ChainAuth interface{ chainAuth() }
type BearerToken struct{ Token string }

func (BearerToken) chainAuth() {}
func (a BearerToken) MarshalJSON() ([]byte, error) {
	return json.Marshal(struct {
		Type  string `json:"__type"`
		Token string `json:"token"`
	}{"BearerToken", a.Token})
}

type APIKeyHeader struct {
	Value  string
	Header *string
}

func (APIKeyHeader) chainAuth() {}
func (a APIKeyHeader) MarshalJSON() ([]byte, error) {
	return json.Marshal(struct {
		Type   string  `json:"__type"`
		Value  string  `json:"value"`
		Header *string `json:"header,omitempty"`
	}{"ApiKeyHeader", a.Value, a.Header})
}

type APIKeyCookie struct {
	Value  string
	Cookie *string
}

func (APIKeyCookie) chainAuth() {}
func (a APIKeyCookie) MarshalJSON() ([]byte, error) {
	return json.Marshal(struct {
		Type   string  `json:"__type"`
		Value  string  `json:"value"`
		Cookie *string `json:"cookie,omitempty"`
	}{"ApiKeyCookie", a.Value, a.Cookie})
}

type ChainConfig struct {
	ID                                        uint64    `json:"id"`
	Network                                   string    `json:"network,omitempty"`
	GatewayChainID                            *uint64   `json:"gatewayChainId,omitempty"`
	RelayerURL                                string    `json:"relayerUrl,omitempty"`
	ACLContractAddress                        string    `json:"aclContractAddress,omitempty"`
	KMSContractAddress                        string    `json:"kmsContractAddress,omitempty"`
	InputVerifierContractAddress              string    `json:"inputVerifierContractAddress,omitempty"`
	VerifyingContractAddressDecryption        string    `json:"verifyingContractAddressDecryption,omitempty"`
	VerifyingContractAddressInputVerification string    `json:"verifyingContractAddressInputVerification,omitempty"`
	RegistryAddress                           string    `json:"registryAddress,omitempty"`
	ExecutorAddress                           string    `json:"executorAddress,omitempty"`
	Auth                                      ChainAuth `json:"auth,omitempty"`
}

type SDKConfig struct {
	ChainID               *uint64        `json:"chainId,omitempty"`
	RPCURL                *string        `json:"rpcUrl,omitempty"`
	Chains                []ChainConfig  `json:"chains,omitempty"`
	Auth                  ChainAuth      `json:"auth,omitempty"`
	PermitTTL             *float64       `json:"permitTTL,omitempty"`
	TransportKeyPairTTL   *float64       `json:"transportKeyPairTTL,omitempty"`
	TransportKeyPairScope *string        `json:"transportKeyPairScope,omitempty"`
	RegistryTTL           *float64       `json:"registryTTL,omitempty"`
	Storage               StorageConfig  `json:"-"`
	PermitStorage         *StorageConfig `json:"-"`
}

func NewSDKConfig(chainID uint64, rpcURL string) SDKConfig {
	return SDKConfig{ChainID: &chainID, RPCURL: &rpcURL}
}

type SignerConfig struct {
	Account       *WalletAccount
	SignTypedData SignTypedDataFunc
}
