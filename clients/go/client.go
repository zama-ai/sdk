package sidecar

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"

	pb "github.com/zama-ai/sdk/clients/go/gen/zama/sdk/v1alpha1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

type Client struct {
	conn *grpc.ClientConn
	rpc  pb.SidecarServiceClient
}

type DialOptions struct{ MaxMessageBytes int }

func Dial(socket string) (*Client, error) { return DialWithOptions(socket, DialOptions{}) }
func DialWithOptions(socket string, options DialOptions) (*Client, error) {
	if !filepath.IsAbs(socket) {
		return nil, errors.New("socket path must be absolute")
	}
	limit := options.MaxMessageBytes
	if limit == 0 {
		limit = 4 * 1024 * 1024
	}
	if limit < 0 {
		return nil, errors.New("message limit must be positive")
	}
	conn, err := grpc.NewClient("unix://"+socket, grpc.WithTransportCredentials(insecure.NewCredentials()), grpc.WithDefaultCallOptions(grpc.MaxCallRecvMsgSize(limit), grpc.MaxCallSendMsgSize(limit)))
	if err != nil {
		return nil, err
	}
	return &Client{conn: conn, rpc: pb.NewSidecarServiceClient(conn)}, nil
}
func (c *Client) Close() error { return c.conn.Close() }

type Info struct{ SDKVersion string }

func (c *Client) Info(ctx context.Context) (*Info, error) {
	var trailers metadata.MD
	response, err := c.rpc.GetInfo(ctx, &pb.GetInfoRequest{}, grpc.Trailer(&trailers))
	if err != nil {
		return nil, rpcError(err, trailers)
	}
	return &Info{SDKVersion: response.SdkVersion}, nil
}

func (c *Client) CreateContext(ctx context.Context, config SDKConfig, signer SignerConfig) (*SDKContext, error) {
	serialized, err := json.Marshal(config)
	if err != nil {
		return nil, err
	}
	stores := make(map[string]*storageBackend)
	storage, err := storageBinding(config.Storage, stores)
	if err != nil {
		return nil, err
	}
	var permits *pb.StorageBinding
	if config.PermitStorage != nil {
		permits, err = storageBinding(*config.PermitStorage, stores)
		if err != nil {
			return nil, err
		}
	}
	var trailers metadata.MD
	response, err := c.rpc.CreateContext(ctx, &pb.CreateContextRequest{ConfigJson: string(serialized), SignerEnabled: signer.SignTypedData != nil, Account: accountWire(signer.Account), Storage: storage, PermitStorage: permits}, grpc.Trailer(&trailers))
	if err != nil {
		return nil, rpcError(err, trailers)
	}
	if response.ContextId == "" {
		return nil, errors.New("missing SDK context ID")
	}
	sdk := &SDKContext{client: c, id: response.ContextId, operations: make(map[string]*operationState), stores: stores}
	initialized := false
	defer func() {
		if !initialized {
			cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), cleanupTimeout)
			defer cancel()
			sdk.Close(cleanup)
		}
	}()
	if len(stores) > 0 {
		if err := sdk.AttachStorage(ctx); err != nil {
			return nil, err
		}
	}
	if signer.SignTypedData != nil {
		if err := sdk.AttachSigner(ctx, signer.SignTypedData); err != nil {
			return nil, err
		}
	}
	initialized = true
	return sdk, nil
}
func storageBinding(config StorageConfig, stores map[string]*storageBackend) (*pb.StorageBinding, error) {
	switch config.kind {
	case "", "memory":
		return &pb.StorageBinding{Backend: &pb.StorageBinding_Memory{Memory: &pb.Empty{}}}, nil
	case "persistent":
		if config.name == "" {
			return nil, errors.New("persistent storage name required")
		}
		return &pb.StorageBinding{Backend: &pb.StorageBinding_Persistent{Persistent: config.name}}, nil
	case "application":
		if config.name == "" || config.backend == nil || config.backend.Storage == nil {
			return nil, errors.New("application storage requires a backend and identity")
		}
		if previous, exists := stores[config.name]; exists && previous != config.backend {
			return nil, errors.New("reuse one application storage binding for the same backend ID")
		}
		stores[config.name] = config.backend
		return &pb.StorageBinding{Backend: &pb.StorageBinding_Application{Application: config.name}}, nil
	default:
		return nil, errors.New("invalid storage configuration")
	}
}
