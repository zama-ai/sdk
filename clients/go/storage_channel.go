package sidecar

import (
	"bytes"
	"context"
	"errors"

	pb "github.com/zama-ai/sdk/clients/go/gen/zama/sdk/v1alpha1"
	"google.golang.org/grpc"
)

func (s *SDKContext) AttachStorage(ctx context.Context) error {
	if len(s.stores) == 0 {
		return errors.New("no application storage configured")
	}
	return attachChannel(ctx, s, StorageChannel, &s.storage,
		func(ctx context.Context) (grpc.BidiStreamingClient[pb.StorageClientMessage, pb.StorageServerMessage], error) {
			return s.client.rpc.StorageChannel(ctx)
		},
		&pb.StorageClientMessage{Message: &pb.StorageClientMessage_Attach{Attach: &pb.ContextRequest{ContextId: s.id}}},
		func(message *pb.StorageServerMessage) bool { return message.GetAttached() != nil },
		func(ctx context.Context, message *pb.StorageServerMessage, send func(*pb.StorageClientMessage)) error {
			if rejected := message.GetReplyError(); rejected != nil {
				if rejected.Error == nil {
					return errors.New("missing storage reply error")
				}
				if rejected.Error.Code != "STORAGE_REQUEST_NOT_FOUND" {
					return sdkError(rejected.Error)
				}
			}
			if action := message.GetAction(); action != nil {
				go func() {
					reply := s.storageReply(ctx, action)
					if ctx.Err() == nil {
						send(&pb.StorageClientMessage{Message: &pb.StorageClientMessage_Reply{Reply: reply}})
					}
				}()
			}
			return nil
		})
}
func (s *SDKContext) storageReply(ctx context.Context, action *pb.StorageAction) *pb.StorageReply {
	reply := &pb.StorageReply{RequestId: action.RequestId}
	store, ok := s.stores[action.BackendId]
	var err error
	if !ok {
		err = errors.New("unknown application storage backend")
	} else {
		switch action.Method {
		case pb.StorageMethod_STORAGE_METHOD_GET:
			var value []byte
			var found bool
			value, found, err = store.Get(ctx, action.Key)
			if err == nil && found {
				// Present nil values must encode as empty bytes, not a cache miss.
				reply.Value = append([]byte{}, value...)
			}
		case pb.StorageMethod_STORAGE_METHOD_SET:
			err = store.Set(ctx, action.Key, bytes.Clone(action.Value))
		case pb.StorageMethod_STORAGE_METHOD_DELETE:
			err = store.Delete(ctx, action.Key)
		default:
			err = errors.New("unknown storage operation")
		}
	}
	if err != nil {
		reply.Error = callbackError(err, "STORAGE_FAILED")
	}
	return reply
}
