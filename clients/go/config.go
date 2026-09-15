package sidecar

import (
	"fmt"

	"github.com/ethereum/go-ethereum/common"
	pb "github.com/zama-ai/sdk/clients/go/gen/zama/sdk/v1alpha1"
)

type ChainAuth interface{ wire() *pb.ChainAuth }

type BearerToken struct{ Token string }

func (a BearerToken) wire() *pb.ChainAuth {
	return &pb.ChainAuth{Credential: &pb.ChainAuth_BearerToken{BearerToken: a.Token}}
}

type APIKeyHeader struct {
	Value  string
	Header *string
}

func (a APIKeyHeader) wire() *pb.ChainAuth {
	return &pb.ChainAuth{Credential: &pb.ChainAuth_ApiKeyHeader{ApiKeyHeader: &pb.NamedCredential{Name: a.Header, Value: a.Value}}}
}

type APIKeyCookie struct {
	Value  string
	Cookie *string
}

func (a APIKeyCookie) wire() *pb.ChainAuth {
	return &pb.ChainAuth{Credential: &pb.ChainAuth_ApiKeyCookie{ApiKeyCookie: &pb.NamedCredential{Name: a.Cookie, Value: a.Value}}}
}

type ChainConfig struct {
	ID                                        uint64
	Network                                   *string
	GatewayChainID                            *uint64
	RelayerURL                                *string
	ACLContractAddress                        *string
	KMSContractAddress                        *string
	InputVerifierContractAddress              *string
	VerifyingContractAddressDecryption        *string
	VerifyingContractAddressInputVerification *string
	RegistryAddress                           *string
	ExecutorAddress                           *string
	Auth                                      ChainAuth
	Provider                                  *ProviderOptions
}

type SDKConfig struct {
	ProcessRuntime                   *ProcessRuntime
	Relayers                         map[uint64]RelayerConfig
	TransportKeyPairDerivationSecret *DerivationSecret
	ChainID                          *uint64
	RPCURL                           *string
	Chains                           []ChainConfig
	Auth                             ChainAuth
	PermitTTL                        *uint32
	TransportKeyPairTTL              *uint32
	TransportKeyPairScope            *string
	RegistryTTL                      *uint32
	Storage                          StorageConfig
	PermitStorage                    *StorageConfig
}

func NewSDKConfig(chainID uint64, rpcURL string) SDKConfig {
	return SDKConfig{ChainID: &chainID, RPCURL: &rpcURL}
}

func (c SDKConfig) wire() (*pb.ContextConfig, error) {
	chains := c.Chains
	if chains != nil && (len(chains) == 0 || c.RPCURL != nil || c.Auth != nil) {
		return nil, fmt.Errorf("chains must be nonempty and cannot be combined with RPCURL or Auth")
	}
	if chains == nil && c.ChainID != nil {
		chains = []ChainConfig{{ID: *c.ChainID, Network: c.RPCURL, Auth: c.Auth}}
	}
	result := &pb.ContextConfig{
		ChainId:               c.ChainID,
		PermitTtl:             c.PermitTTL,
		TransportKeyPairTtl:   c.TransportKeyPairTTL,
		TransportKeyPairScope: c.TransportKeyPairScope,
		RegistryTtl:           c.RegistryTTL,
	}
	if c.ProcessRuntime != nil {
		result.ProcessRuntime = c.ProcessRuntime.wire()
	}
	if c.Relayers != nil {
		result.Relayers = &pb.RelayerMap{Entries: make(map[uint64]*pb.RelayerConfig, len(c.Relayers))}
		for chainID, relayer := range c.Relayers {
			result.Relayers.Entries[chainID] = relayer.wire()
		}
	}
	for _, chain := range chains {
		value, err := chain.wire()
		if err != nil {
			return nil, err
		}
		result.Chains = append(result.Chains, value)
	}
	return result, nil
}

func (c ChainConfig) wire() (*pb.ChainConfig, error) {
	result := &pb.ChainConfig{Id: c.ID, Network: c.Network, GatewayChainId: c.GatewayChainID, RelayerUrl: c.RelayerURL}
	if c.Auth != nil {
		result.Auth = c.Auth.wire()
	}
	if c.Provider != nil {
		result.Provider = c.Provider.wire()
	}
	for _, field := range []struct {
		name      string
		value     *string
		target    *[]byte
		clearable bool
	}{
		{"ACLContractAddress", c.ACLContractAddress, &result.AclContractAddress, false},
		{"KMSContractAddress", c.KMSContractAddress, &result.KmsContractAddress, false},
		{"InputVerifierContractAddress", c.InputVerifierContractAddress, &result.InputVerifierContractAddress, false},
		{"VerifyingContractAddressDecryption", c.VerifyingContractAddressDecryption, &result.VerifyingContractAddressDecryption, false},
		{"VerifyingContractAddressInputVerification", c.VerifyingContractAddressInputVerification, &result.VerifyingContractAddressInputVerification, false},
		{"RegistryAddress", c.RegistryAddress, &result.RegistryAddress, true},
		{"ExecutorAddress", c.ExecutorAddress, &result.ExecutorAddress, true},
	} {
		if field.value == nil {
			continue
		}
		if field.clearable && *field.value == "" {
			*field.target = []byte{}
			continue
		}
		if !common.IsHexAddress(*field.value) {
			return nil, fmt.Errorf("%s must be a 20-byte hex address", field.name)
		}
		*field.target = common.HexToAddress(*field.value).Bytes()
	}
	return result, nil
}

type SignerConfig struct {
	Account       *WalletAccount
	SignTypedData SignTypedDataFunc
}
