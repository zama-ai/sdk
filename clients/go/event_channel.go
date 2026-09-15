package sidecar

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"sync"
	"time"

	pb "github.com/zama-ai/sdk/clients/go/gen/zama/sdk/v1alpha1"
	"google.golang.org/grpc"
)

type EventSubscription struct {
	sdk     *SDKContext
	channel *callbackChannel
}

var errEventSubscriptionClosed = errors.New("event subscription closed")

// Close cancels queued and active callbacks; it does not wait for application handlers to return.
func (s *EventSubscription) Close() {
	s.sdk.channelFailed(s.channel, EventChannel, errEventSubscriptionClosed)
}

type eventWork struct {
	ctx      context.Context
	sequence uint64
	callback eventCallback
	send     func(*pb.EventClientMessage)
}
type eventDispatcher struct {
	handlers EventHandlers
	mu       sync.Mutex
	pending  map[uint64]context.CancelFunc
	queue    chan eventWork
	batch    chan struct{}
	once     sync.Once
	sequence uint64
}

func (s *SDKContext) SubscribeEvents(ctx context.Context, handlers EventHandlers) (*EventSubscription, error) {
	s.mu.Lock()
	replacingClosed := s.events != nil && errors.Is(s.events.err, errEventSubscriptionClosed)
	s.mu.Unlock()
	dispatcher := &eventDispatcher{handlers: handlers, pending: make(map[uint64]context.CancelFunc), queue: make(chan eventWork, 256), batch: make(chan struct{}, 256)}
	var channel *callbackChannel
	attach := func() error {
		return attachChannel(ctx, s, EventChannel, &s.events,
			func(ctx context.Context) (grpc.BidiStreamingClient[pb.EventClientMessage, pb.EventServerMessage], error) {
				s.mu.Lock()
				channel = s.events
				s.mu.Unlock()
				return s.client.rpc.EventChannel(ctx)
			},
			&pb.EventClientMessage{Message: &pb.EventClientMessage_Attach{Attach: &pb.ContextRequest{ContextId: s.id}}},
			func(message *pb.EventServerMessage) bool { return message.GetAttached() != nil },
			func(ctx context.Context, message *pb.EventServerMessage, send func(*pb.EventClientMessage)) error {
				dispatcher.once.Do(func() { go dispatcher.run(ctx) })
				if rejected := message.GetReplyError(); rejected != nil {
					if rejected.Error == nil {
						return errors.New("missing event reply error")
					}
					if rejected.Error.Code != "EVENT_DELIVERY_NOT_FOUND" {
						return sdkError(rejected.Error)
					}
					return nil
				}
				if cancelled := message.GetCancelled(); cancelled != nil {
					dispatcher.mu.Lock()
					if cancel := dispatcher.pending[cancelled.Sequence]; cancel != nil {
						cancel()
					}
					dispatcher.mu.Unlock()
					return nil
				}
				delivery := message.GetDelivery()
				if delivery == nil || delivery.ContextId != s.id || delivery.Sequence <= dispatcher.sequence {
					return errors.New("invalid event delivery correlation")
				}
				callback, err := dispatcher.decode(delivery)
				if err != nil {
					return err
				}
				dispatcher.sequence = delivery.Sequence
				handlerctx, cancel := context.WithCancel(ctx)
				dispatcher.mu.Lock()
				dispatcher.pending[delivery.Sequence] = cancel
				dispatcher.mu.Unlock()
				work := eventWork{handlerctx, delivery.Sequence, callback, send}
				if _, isBatch := delivery.Payload.(*pb.EventDelivery_BatchError); isBatch {
					select {
					case dispatcher.batch <- struct{}{}:
						go func() {
							defer func() { <-dispatcher.batch }()
							dispatcher.execute(work)
						}()
						return nil
					default:
						cancel()
						return errors.New("event callback window exceeded 256 entries")
					}
				}
				select {
				case dispatcher.queue <- work:
					return nil
				default:
					cancel()
					return errors.New("event delivery queue exceeded 256 entries")
				}
			})
	}
	var err error
	for attempt := 0; ; attempt++ {
		err = attach()
		var rpc *RPCError
		if err == nil || !replacingClosed || !errors.As(err, &rpc) || rpc.Code != "EVENT_ATTACHED" || attempt >= 39 {
			break
		}
		timer := time.NewTimer(25 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil, ctx.Err()
		case <-timer.C:
		}
	}
	if err != nil {
		return nil, err
	}
	return &EventSubscription{sdk: s, channel: channel}, nil
}

func (d *eventDispatcher) run(ctx context.Context) {
	defer func() {
		d.mu.Lock()
		defer d.mu.Unlock()
		for _, cancel := range d.pending {
			cancel()
		}
		clear(d.pending)
	}()
	for {
		select {
		case <-ctx.Done():
			return
		case work := <-d.queue:
			d.execute(work)
		}
	}
}

func (d *eventDispatcher) execute(work eventWork) {
	if work.ctx.Err() == nil {
		reply := eventReply(work.ctx, work.sequence, work.callback)
		if work.ctx.Err() == nil {
			work.send(&pb.EventClientMessage{Message: &pb.EventClientMessage_Reply{Reply: reply}})
		}
	}
	d.mu.Lock()
	if cancel := d.pending[work.sequence]; cancel != nil {
		cancel()
	}
	delete(d.pending, work.sequence)
	d.mu.Unlock()
}

type eventCallback func(context.Context) (*big.Int, error)

func eventReply(ctx context.Context, sequence uint64, callback eventCallback) (reply *pb.EventReply) {
	reply = &pb.EventReply{Sequence: sequence, Outcome: &pb.EventReply_Acknowledged{Acknowledged: &pb.Empty{}}}
	defer func() {
		if recovered := recover(); recovered != nil {
			reply.Outcome = &pb.EventReply_Error{Error: callbackError(fmt.Errorf("event handler panic: %v", recovered), "CALLBACK_FAILED")}
		}
	}()
	fallback, err := callback(ctx)
	if err != nil {
		reply.Outcome = &pb.EventReply_Error{Error: callbackError(err, "CALLBACK_FAILED")}
	} else if fallback != nil {
		reply.Outcome = &pb.EventReply_FallbackBigint{FallbackBigint: fallback.String()}
	}
	return reply
}

func (d *eventDispatcher) decode(delivery *pb.EventDelivery) (eventCallback, error) {
	correlation := EventCorrelation{ContextID: delivery.ContextId, OperationID: delivery.OperationId, Sequence: delivery.Sequence}
	switch payload := delivery.Payload.(type) {
	case *pb.EventDelivery_Event:
		event, err := sdkEvent(payload.Event)
		if err != nil {
			return nil, err
		}
		return notificationCallback(correlation, event, d.handlers.OnEvent), nil
	case *pb.EventDelivery_WalletAccount:
		if payload.WalletAccount == nil {
			return nil, errors.New("missing wallet notification")
		}
		previous, err := eventAccount(payload.WalletAccount.Previous)
		if err != nil {
			return nil, err
		}
		next, err := eventAccount(payload.WalletAccount.Next)
		if err != nil {
			return nil, err
		}
		return notificationCallback(correlation, WalletAccountChanged{Previous: previous, Next: next}, d.handlers.OnWalletAccountChanged), nil
	case *pb.EventDelivery_Progress:
		progress, err := operationProgress(payload.Progress)
		if err != nil {
			return nil, err
		}
		return notificationCallback(correlation, progress, d.handlers.OnProgress), nil
	case *pb.EventDelivery_BatchError:
		if payload.BatchError == nil {
			return nil, errors.New("missing batch callback")
		}
		address, err := eventAddress(payload.BatchError.TokenAddress)
		if err != nil {
			return nil, err
		}
		if address == nil || payload.BatchError.Error == nil {
			return nil, errors.New("missing batch callback fields")
		}
		callback := BatchErrorCallback{TokenAddress: *address, Error: sdkError(payload.BatchError.Error)}
		return func(ctx context.Context) (*big.Int, error) {
			if d.handlers.OnBatchError == nil {
				return nil, errors.New("batch error handler not configured")
			}
			fallback, err := d.handlers.OnBatchError(ctx, correlation, callback)
			if err == nil && fallback == nil {
				return nil, errors.New("batch error handler returned nil fallback")
			}
			return fallback, err
		}, nil
	default:
		return nil, errors.New("missing event payload")
	}
}

func notificationCallback[T any](correlation EventCorrelation, value T, handler func(context.Context, EventCorrelation, T) error) eventCallback {
	return func(ctx context.Context) (*big.Int, error) {
		if handler == nil {
			return nil, nil
		}
		return nil, handler(ctx, correlation, value)
	}
}

func operationProgress(value *pb.OperationProgress) (OperationProgress, error) {
	if value == nil {
		return OperationProgress{}, errors.New("missing progress notification")
	}
	progress := OperationProgress{Kind: ProgressKind(value.Kind)}
	if progress.Kind < EncryptComplete || progress.Kind > ProgressFinalizeSubmitted {
		return progress, errors.New("unknown progress kind")
	}
	var err error
	progress.TxHash, err = eventHash(value.TxHash)
	if err != nil {
		return progress, err
	}
	if progress.Kind != EncryptComplete && progress.Kind != Finalizing && progress.TxHash == nil {
		return progress, errors.New("missing progress transaction hash")
	}
	return progress, nil
}
