package sidecar

import (
	"fmt"

	pb "github.com/zama-ai/sdk/clients/go/gen/zama/sdk/v1alpha1"
)

type ModuleVersions interface{ wire() *pb.ModuleVersions }

type AutoModuleVersions struct{}

func (AutoModuleVersions) wire() *pb.ModuleVersions {
	return &pb.ModuleVersions{Selection: &pb.ModuleVersions_Auto{Auto: &pb.Empty{}}}
}

type TfheVersion string

type KmsVersion string

type CompatibilityCheck string

const (
	CompatibilityCheckThrow CompatibilityCheck = "throw"
	CompatibilityCheckWarn  CompatibilityCheck = "warn"
	CompatibilityCheckOff   CompatibilityCheck = "off"
)

type WasmAssetLoadMode string

const (
	WasmAssetLoadModeAuto              WasmAssetLoadMode = "auto"
	WasmAssetLoadModeEmbeddedBase64    WasmAssetLoadMode = "embedded-base64"
	WasmAssetLoadModeVerifiedBlob      WasmAssetLoadMode = "verified-blob"
	WasmAssetLoadModePrecheckDirectURL WasmAssetLoadMode = "precheck-direct-url"
	WasmAssetLoadModeTrustedDirectURL  WasmAssetLoadMode = "trusted-direct-url"
)

func optionalString[T ~string](value T) *string {
	if value == "" {
		return nil
	}
	sent := string(value)
	return &sent
}

type PinnedModuleVersions struct {
	TFHE               TfheVersion
	KMS                KmsVersion
	CheckCompatibility CompatibilityCheck
}

func (v PinnedModuleVersions) wire() *pb.ModuleVersions {
	return &pb.ModuleVersions{Selection: &pb.ModuleVersions_Pinned{Pinned: &pb.PinnedModuleVersions{
		Tfhe:               optionalString(v.TFHE),
		Kms:                optionalString(v.KMS),
		CheckCompatibility: optionalString(v.CheckCompatibility),
	}}}
}

// ProcessRuntime is applied once per sidecar process; the first SDK config wins.
type ProcessRuntime struct {
	WasmAssetLoadMode WasmAssetLoadMode
	ModuleVersions    ModuleVersions
	SingleThread      *bool
	NumberOfThreads   *uint32
	Auth              RelayerAuth
}

func (r ProcessRuntime) wire() *pb.ProcessRuntimeConfig {
	result := &pb.ProcessRuntimeConfig{
		WasmAssetLoadMode: optionalString(r.WasmAssetLoadMode),
		SingleThread:      r.SingleThread,
		NumberOfThreads:   r.NumberOfThreads,
	}
	if r.ModuleVersions != nil {
		result.ModuleVersions = r.ModuleVersions.wire()
	}
	if r.Auth != nil {
		result.Auth = r.Auth.wire()
	}
	return result
}

type ProviderBatch interface{ wire() *pb.ProviderBatch }

type ProviderBatchEnabled bool

func (enabled ProviderBatchEnabled) wire() *pb.ProviderBatch {
	return &pb.ProviderBatch{Selection: &pb.ProviderBatch_Enabled{Enabled: bool(enabled)}}
}

type ProviderBatchOptions struct {
	BatchSize *uint32
	Wait      *uint32
}

func (options ProviderBatchOptions) wire() *pb.ProviderBatch {
	return &pb.ProviderBatch{Selection: &pb.ProviderBatch_Options{Options: &pb.ProviderBatchOptions{
		BatchSize: options.BatchSize,
		Wait:      options.Wait,
	}}}
}

type ProviderOptions struct {
	Headers         map[string]string
	Timeout         *uint32
	RetryCount      *uint32
	RetryDelay      *uint32
	Batch           ProviderBatch
	PollingInterval *uint32
}

func (options ProviderOptions) wire() *pb.HttpProviderConfig {
	result := &pb.HttpProviderConfig{
		Timeout:         options.Timeout,
		RetryCount:      options.RetryCount,
		RetryDelay:      options.RetryDelay,
		PollingInterval: options.PollingInterval,
	}
	if options.Headers != nil {
		result.Headers = &pb.HttpHeaders{Entries: options.Headers}
	}
	if options.Batch != nil {
		result.Batch = options.Batch.wire()
	}
	return result
}

type RelayerType string

const (
	RelayerNode      RelayerType = "node"
	RelayerCleartext RelayerType = "cleartext"
)

type RelayerConfig struct {
	Type    RelayerType
	Options *RelayerOptions
}

func (config RelayerConfig) wire() *pb.RelayerConfig {
	result := &pb.RelayerConfig{Type: string(config.Type)}
	if config.Options != nil {
		result.Options = config.Options.wire()
	}
	return result
}

type RelayerOptions struct {
	Timeout          *uint32
	Debug            *bool
	BatchRPCCalls    *bool
	ModuleVersions   ModuleVersions
	FHEEncryptionKey *FHEEncryptionKey
}

func (options RelayerOptions) wire() *pb.RelayerOptions {
	result := &pb.RelayerOptions{
		Timeout:       options.Timeout,
		Debug:         options.Debug,
		BatchRpcCalls: options.BatchRPCCalls,
	}
	if options.ModuleVersions != nil {
		result.ModuleVersions = options.ModuleVersions.wire()
	}
	if options.FHEEncryptionKey != nil {
		result.FheEncryptionKey = options.FHEEncryptionKey.wire()
	}
	return result
}

type FHEPublicKeyBytes struct {
	ID    string
	Bytes []byte
}

type FHECRSBytes struct {
	ID       string
	Capacity uint32
	Bytes    []byte
}

type FHEEncryptionKeyMetadata struct {
	RelayerURL string
	ChainID    uint64
}

type FHEEncryptionKey struct {
	PublicKeyBytes FHEPublicKeyBytes
	CRSBytes       FHECRSBytes
	Metadata       FHEEncryptionKeyMetadata
}

func (key FHEEncryptionKey) wire() *pb.FheEncryptionKey {
	return &pb.FheEncryptionKey{
		PublicKeyBytes: &pb.FhePublicKeyBytes{Id: key.PublicKeyBytes.ID, Bytes: key.PublicKeyBytes.Bytes},
		CrsBytes:       &pb.FheCrsBytes{Id: key.CRSBytes.ID, Capacity: key.CRSBytes.Capacity, Bytes: key.CRSBytes.Bytes},
		Metadata:       &pb.FheEncryptionKeyMetadata{RelayerUrl: key.Metadata.RelayerURL, ChainId: key.Metadata.ChainID},
	}
}

type DerivationSecret interface {
	wire() *pb.DerivationSecret
}

func wireDerivationSecret(secret DerivationSecret) *pb.DerivationSecret {
	if secret == nil {
		return nil
	}
	return secret.wire()
}

type redactedDerivationSecret struct{}

func (redactedDerivationSecret) String() string   { return "[REDACTED]" }
func (redactedDerivationSecret) GoString() string { return "[REDACTED]" }
func (redactedDerivationSecret) Format(state fmt.State, verb rune) {
	_, _ = state.Write([]byte("[REDACTED]"))
}

type missingDerivationSecret struct{ redactedDerivationSecret }
type textDerivationSecret struct {
	redactedDerivationSecret
	value string
}
type bytesDerivationSecret struct {
	redactedDerivationSecret
	value []byte
}

// MissingDerivationSecret sends protection enabled with no derivation secret value.
func MissingDerivationSecret() DerivationSecret { return missingDerivationSecret{} }
func TextDerivationSecret(value string) DerivationSecret {
	return textDerivationSecret{value: value}
}
func BytesDerivationSecret(value []byte) DerivationSecret {
	return bytesDerivationSecret{value: append([]byte{}, value...)}
}
func (missingDerivationSecret) wire() *pb.DerivationSecret { return &pb.DerivationSecret{} }
func (s textDerivationSecret) wire() *pb.DerivationSecret {
	return &pb.DerivationSecret{Value: &pb.DerivationSecret_Text{Text: s.value}}
}
func (s bytesDerivationSecret) wire() *pb.DerivationSecret {
	return &pb.DerivationSecret{Value: &pb.DerivationSecret_Bytes{Bytes: append([]byte{}, s.value...)}}
}
