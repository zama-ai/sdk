package sidecar

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/signer/core/apitypes"
	pb "github.com/zama-ai/sdk/clients/go/gen/zama/sdk/v1alpha1"
	"google.golang.org/grpc"
)

func (s *SDKContext) AttachSigner(ctx context.Context, sign SignTypedDataFunc) error {
	if sign == nil {
		return errors.New("signer callback required")
	}
	return attachChannel(ctx, s, SignerChannel, &s.signer,
		func(ctx context.Context) (grpc.BidiStreamingClient[pb.SignerClientMessage, pb.SignerServerMessage], error) {
			return s.client.rpc.SignerChannel(ctx)
		},
		&pb.SignerClientMessage{Message: &pb.SignerClientMessage_Attach{Attach: &pb.ContextRequest{ContextId: s.id}}},
		func(message *pb.SignerServerMessage) bool { return message.GetAttached() != nil },
		func(_ context.Context, message *pb.SignerServerMessage, send func(*pb.SignerClientMessage)) error {
			if action := message.GetAction(); action != nil {
				s.dispatchSignature(action, sign, func(reply *pb.SignerReply) {
					send(&pb.SignerClientMessage{Message: &pb.SignerClientMessage_Reply{Reply: reply}})
				})
			}
			if rejected := message.GetReplyError(); rejected != nil && (rejected.Error == nil || rejected.Error.Code != "SIGNER_ACTION_NOT_FOUND") {
				if rejected.Error == nil {
					s.failOperation(rejected.OperationId, errors.New("missing signer reply error"))
				} else {
					s.failOperation(rejected.OperationId, sdkError(rejected.Error))
				}
			}
			if cancelled := message.GetCancelled(); cancelled != nil {
				s.mu.Lock()
				if op := s.operations[cancelled.OperationId]; op != nil {
					if cancel := op.actions[cancelled.ActionId]; cancel != nil {
						cancel()
					}
				}
				s.mu.Unlock()
			}
			return nil
		})
}
func (s *SDKContext) dispatchSignature(action *pb.SignerAction, sign SignTypedDataFunc, send func(*pb.SignerReply)) {
	s.mu.Lock()
	op := s.operations[action.OperationId]
	if op == nil {
		s.mu.Unlock()
		return
	}
	if _, seen := op.seenActions[action.ActionId]; seen {
		s.mu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(op.ctx)
	op.actions[action.ActionId] = cancel
	op.seenActions[action.ActionId] = struct{}{}
	s.mu.Unlock()
	go func() {
		defer cancel()
		defer func() { s.mu.Lock(); delete(op.actions, action.ActionId); s.mu.Unlock() }()
		reply := &pb.SignerReply{OperationId: action.OperationId, ActionId: action.ActionId}
		var typed apitypes.TypedData
		var err error
		if action.Account == nil || len(action.Account.Address) != common.AddressLength {
			err = errors.New("invalid signing account")
		} else {
			err = json.Unmarshal([]byte(action.TypedDataJson), &typed)
		}
		if err == nil {
			reply.Signature, err = sign(ctx, WalletAccount{Address: common.BytesToAddress(action.Account.Address), ChainID: action.Account.ChainId}, typed)
		}
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			reply.Error = signingError(err)
		}
		send(reply)
	}()
}
