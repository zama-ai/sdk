package zama

import (
	"context"
	"fmt"
	"strings"
	"testing"

	pb "github.com/zama-ai/sdk/clients/go/v3/internal/gen/zama/sdk/v1beta1"
	"google.golang.org/grpc"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/descriptorpb"
)

func TestConfigOptionsAreSentAsTypedProtobuf(t *testing.T) {
	no := false
	zero := uint32(0)
	chainID := uint64(11155111)
	network := "http://localhost"
	config := SDKConfig{
		ChainID: &chainID,
		Chains: []ChainConfig{{
			ID: chainID, Network: &network,
			Provider: &ProviderOptions{
				Headers: map[string]string{}, Timeout: &zero, RetryCount: &zero,
				Batch: ProviderBatchEnabled(false),
			},
		}},
		ProcessRuntime: &ProcessRuntime{
			WasmAssetLoadMode: WasmAssetLoadModeVerifiedBlob,
			SingleThread:      &no, NumberOfThreads: &zero, ModuleVersions: AutoModuleVersions{},
			Auth: APIKeyHeader{Value: "runtime-secret"},
		},
		Relayers: map[uint64]RelayerConfig{chainID: {
			Transport: RelayerNode,
			Options: &RelayerOptions{
				Debug: &no, BatchRPCCalls: &no,
				ModuleVersions: PinnedModuleVersions{
					TFHE: "1.6.2", KMS: "0.13.20-0", CheckCompatibility: CompatibilityCheckWarn,
				},
				FHEEncryptionKey: &FHEEncryptionKey{
					PublicKeyBytes: FHEPublicKeyBytes{ID: "key", Bytes: []byte{0, 255}},
					CRSBytes:       FHECRSBytes{ID: "crs", Capacity: 2048, Bytes: []byte{128}},
					Metadata:       FHEEncryptionKeyMetadata{ChainID: chainID, RelayerURL: "https://relayer.invalid"},
				},
			},
		}},
	}
	expected, err := config.wire()
	if err != nil {
		t.Fatal(err)
	}
	client := testClient(t, &pb.UnimplementedDaemonServiceServer{}, func(_ context.Context, request any, _ *grpc.UnaryServerInfo, _ grpc.UnaryHandler) (any, error) {
		r := request.(*pb.CreateContextRequest)
		if !proto.Equal(r.Config, expected) {
			t.Fatalf("typed config changed in transit: got %v want %v", r.Config, expected)
		}
		return &pb.CreateContextResponse{ContextId: "config"}, nil
	})
	if _, err := client.CreateContext(testContext(t), config, SignerConfig{}); err != nil {
		t.Fatal(err)
	}

	wire := expected
	if wire.ProcessRuntime == nil || wire.ProcessRuntime.SingleThread == nil || *wire.ProcessRuntime.SingleThread || wire.ProcessRuntime.NumberOfThreads == nil || *wire.ProcessRuntime.NumberOfThreads != 0 {
		t.Fatal("runtime zero and false presence changed")
	}
	runtimeCredential := wire.ProcessRuntime.Auth.GetApiKeyHeader()
	if runtimeCredential == nil || runtimeCredential.Name != nil || runtimeCredential.Value != "runtime-secret" {
		t.Fatal("runtime auth default header name changed")
	}
	provider := wire.Chains[0].Provider
	if provider == nil || provider.Headers == nil || len(provider.Headers.Entries) != 0 || provider.Timeout == nil || *provider.Timeout != 0 {
		t.Fatal("provider empty headers or zero values changed")
	}
	if enabled, ok := provider.Batch.Selection.(*pb.ProviderBatch_Enabled); !ok || enabled.Enabled {
		t.Fatal("provider batch false changed")
	}
	relayer := wire.Relayers.Entries[chainID]
	if relayer == nil || relayer.Transport != pb.RelayerTransport_RELAYER_TRANSPORT_NODE || relayer.Options == nil || relayer.Options.BatchRpcCalls == nil || *relayer.Options.BatchRpcCalls {
		t.Fatal("relayer configuration changed")
	}
	key := relayer.Options.FheEncryptionKey
	if key == nil || !proto.Equal(key.PublicKeyBytes, &pb.FhePublicKeyBytes{Id: "key", Bytes: []byte{0, 255}}) || !proto.Equal(key.CrsBytes, &pb.FheCrsBytes{Id: "crs", Capacity: 2048, Bytes: []byte{128}}) {
		t.Fatal("prefetched encryption key bytes changed")
	}
	if (&ProviderOptions{}).wire().Headers != nil {
		t.Fatal("omitted provider headers became present")
	}
	if wire.ProcessRuntime.GetWasmAssetLoadMode() != "verified-blob" {
		t.Fatal("wasm asset load mode constant changed on the wire")
	}
	pinned := relayer.Options.ModuleVersions.GetPinned()
	if pinned.GetTfhe() != "1.6.2" || pinned.GetKms() != "0.13.20-0" || pinned.GetCheckCompatibility() != "warn" {
		t.Fatal("pinned module version constants changed on the wire")
	}
	custom := PinnedModuleVersions{TFHE: TfheVersion("9.9.9-custom")}.wire().GetPinned()
	if custom.GetTfhe() != "9.9.9-custom" {
		t.Fatal("custom version string changed on the wire")
	}
	if custom.Kms != nil || custom.CheckCompatibility != nil {
		t.Fatal("omitted pinned module versions became present")
	}
	if (ProcessRuntime{}).wire().WasmAssetLoadMode != nil {
		t.Fatal("omitted wasm asset load mode became present")
	}
}

func TestDerivationSecretWirePresenceAndRedaction(t *testing.T) {
	for _, secret := range []DerivationSecret{nil, MissingDerivationSecret(), TextDerivationSecret(""), TextDerivationSecret("synthetic-secret"), BytesDerivationSecret(nil), BytesDerivationSecret([]byte{0, 255, 128})} {
		t.Run(fmt.Sprintf("%T-%v", secret, wireDerivationSecret(secret) != nil), func(t *testing.T) {
			config := NewSDKConfig(11155111, "http://localhost")
			config.TransportKeyPairDerivationSecret = secret
			client := testClient(t, &pb.UnimplementedDaemonServiceServer{}, func(_ context.Context, request any, _ *grpc.UnaryServerInfo, _ grpc.UnaryHandler) (any, error) {
				r := request.(*pb.CreateContextRequest)
				if !proto.Equal(r.TransportKeyPairDerivationSecret, wireDerivationSecret(secret)) {
					t.Fatal("secret wire presence changed")
				}
				return &pb.CreateContextResponse{ContextId: "config"}, nil
			})
			if _, err := client.CreateContext(testContext(t), config, SignerConfig{}); err != nil {
				t.Fatal(err)
			}
			for _, format := range []string{"%v", "%+v", "%#v", "%s", "%q"} {
				if strings.Contains(fmt.Sprintf(format, config), "synthetic-secret") {
					t.Fatal("secret leaked in formatted config")
				}
			}
		})
	}
	message := pb.File_zama_sdk_v1beta1_daemon_proto.Messages().ByName("DerivationSecret")
	for _, name := range []string{"text", "bytes"} {
		options, ok := message.Fields().ByName(protoreflect.Name(name)).Options().(*descriptorpb.FieldOptions)
		if !ok || !options.GetDebugRedact() {
			t.Fatalf("generated %s field lost debug_redact", name)
		}
	}
}

func TestRelayerAuthFormattingRedactsCredentials(t *testing.T) {
	for _, auth := range []RelayerAuth{
		BearerToken{Token: "bearer-secret"},
		APIKeyHeader{Value: "header-secret"},
		APIKeyCookie{Value: "cookie-secret"},
	} {
		for _, format := range []string{"%v", "%+v", "%#v", "%s", "%q"} {
			assertNoRelayerCredential(t, format, fmt.Sprintf(format, auth))
		}
		for _, value := range []any{
			SDKConfig{Auth: auth, ProcessRuntime: &ProcessRuntime{Auth: auth}},
			ProcessRuntime{Auth: auth},
		} {
			for _, format := range []string{"%v", "%+v", "%#v"} {
				assertNoRelayerCredential(t, format, fmt.Sprintf(format, value))
			}
		}
	}
}

func assertNoRelayerCredential(t *testing.T, format string, formatted string) {
	t.Helper()
	for _, secret := range []string{"bearer-secret", "header-secret", "cookie-secret"} {
		if strings.Contains(formatted, secret) {
			t.Fatalf("relayer credential leaked with %s", format)
		}
	}
}

func TestRelayerMapOmittedAndExplicitEmpty(t *testing.T) {
	config := NewSDKConfig(11155111, "http://localhost")
	wire, err := config.wire()
	if err != nil {
		t.Fatal(err)
	}
	if wire.Relayers != nil {
		t.Fatal("default relayers must be omitted")
	}
	config.Relayers = map[uint64]RelayerConfig{}
	wire, err = config.wire()
	if err != nil {
		t.Fatal(err)
	}
	if wire.Relayers == nil || len(wire.Relayers.Entries) != 0 {
		t.Fatal("explicit empty relayers lost")
	}
}
