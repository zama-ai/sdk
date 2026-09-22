package sidecar

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/ethereum/go-ethereum/signer/core/apitypes"
	pb "github.com/zama-ai/sdk/clients/go/gen/zama/sdk/v1alpha1"
	"google.golang.org/grpc"
)

func (s *SDKContext) AttachSigner(ctx context.Context, sign SignTypedDataFunc) error {
	return s.AttachWallet(ctx, SignerConfig{SignTypedData: sign})
}

// AttachWallet serves typed-data signing and contract writes on one signer channel.
func (s *SDKContext) AttachWallet(ctx context.Context, signer SignerConfig) error {
	if !signer.enabled() {
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
				s.dispatchSignerAction(action, signer, func(reply *pb.SignerReply) {
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
func (s *SDKContext) dispatchSignerAction(action *pb.SignerAction, signer SignerConfig, send func(*pb.SignerReply)) {
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
		err := invokeSigner(ctx, action, signer, reply)
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			var revert *ExecutionRevertError
			// A revert reply only ever means the contract write itself was rejected pre-broadcast.
			if action.GetContractWrite() != nil && errors.As(err, &revert) {
				reply.Result = &pb.SignerReply_ExecutionRevert{ExecutionRevert: &pb.ExecutionRevert{Data: revert.Data, Message: revert.Error()}}
			} else {
				reply.Result = &pb.SignerReply_Error{Error: signingError(err)}
			}
		}
		send(reply)
	}()
}

// Decoding failures stay scoped to this action; the channel keeps serving others.
func invokeSigner(ctx context.Context, action *pb.SignerAction, signer SignerConfig, reply *pb.SignerReply) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if action.Account == nil {
		return errors.New("invalid signing account")
	}
	address, err := addressFromWire(action.Account.Address, "invalid signing account")
	if err != nil {
		return err
	}
	account := WalletAccount{Address: address, ChainID: action.Account.ChainId}
	switch request := action.Request.(type) {
	case *pb.SignerAction_ContractWrite:
		if signer.WriteContract == nil {
			return &SDKError{Code: "SIGNER_NOT_CONFIGURED", Message: "contract write callback required"}
		}
		write, err := contractWriteRequest(action.OperationId, action.ActionId, account, request.ContractWrite)
		if err != nil {
			return err
		}
		hash, err := signer.WriteContract(ctx, write)
		if err == nil {
			reply.Result = &pb.SignerReply_TransactionHash{TransactionHash: hash.Bytes()}
		}
		return err
	case *pb.SignerAction_TypedDataJson:
		if signer.SignTypedData == nil {
			return &SDKError{Code: "SIGNER_NOT_CONFIGURED", Message: "typed data signer callback required"}
		}
		var typed apitypes.TypedData
		if err := json.Unmarshal([]byte(request.TypedDataJson), &typed); err != nil {
			return err
		}
		signature, err := signer.SignTypedData(ctx, account, typed)
		if err == nil {
			reply.Result = &pb.SignerReply_Signature{Signature: signature}
		}
		return err
	default:
		return errors.New("signer action has no request")
	}
}
