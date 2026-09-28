package zama

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	pb "github.com/zama-ai/sdk/clients/go/v3/internal/gen/zama/sdk/v1beta1"
	"google.golang.org/grpc"
)

type EventSubscription struct {
	sdk     *SDKContext
	channel *callbackChannel
}

var errEventSubscriptionClosed = errors.New("event subscription closed")

const eventDeliveryWindow = 256

// Close cancels queued and active callbacks; it does not wait for application handlers to return.
func (s *EventSubscription) Close() {
	s.sdk.channelFailed(s.channel, EventChannel, errEventSubscriptionClosed)
}

// StopEvents cancels the active event subscription and its queued and running handlers.
// It is safe to call when no subscription exists or after one has stopped.
func (s *SDKContext) StopEvents() {
	s.mu.Lock()
	channel := s.events
	s.mu.Unlock()
	if channel != nil {
		s.channelFailed(channel, EventChannel, errEventSubscriptionClosed)
	}
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
	once     sync.Once
	sequence uint64
}

func (s *SDKContext) SubscribeEvents(ctx context.Context, handlers EventHandlers) (*EventSubscription, error) {
	s.mu.Lock()
	replacingFailed := s.events != nil && s.events.err != nil
	s.mu.Unlock()
	dispatcher := &eventDispatcher{handlers: handlers, pending: make(map[uint64]context.CancelFunc), queue: make(chan eventWork, eventDeliveryWindow)}
	var channel *callbackChannel
	attach := func() (*callbackChannel, error) {
		return attachChannel(ctx, s, EventChannel, &s.events,
			func(ctx context.Context) (grpc.BidiStreamingClient[pb.EventClientMessage, pb.EventServerMessage], error) {
				return s.client.rpc.EventChannel(ctx)
			},
			&pb.EventClientMessage{Message: &pb.EventClientMessage_Attach{Attach: &pb.ContextRequest{ContextId: s.id}}},
			func(message *pb.EventServerMessage) bool { return message.GetAttached() != nil },
			func(ctx context.Context, message *pb.EventServerMessage, send func(*pb.EventClientMessage)) error {
				dispatcher.once.Do(func() { go dispatcher.run(ctx) })
				if message.Message == nil && len(message.ProtoReflect().GetUnknown()) != 0 {
					return nil
				}
				if rejected := message.GetReplyError(); rejected != nil {
					if rejected.Error == nil {
						return errors.New("missing event reply error")
					}
					if rejected.Error.Code != "EVENT_DELIVERY_NOT_FOUND" {
						return sdkError(rejected.Error)
					}
					return nil
				}
				delivery := message.GetDelivery()
				if err := validateEventDelivery(delivery, s.id, dispatcher.sequence); err != nil {
					return err
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
				select {
				case dispatcher.queue <- work:
					return nil
				default:
					cancel()
					return fmt.Errorf("event delivery queue exceeded %d entries", eventDeliveryWindow)
				}
			})
	}
	var err error
	for attempt := 0; ; attempt++ {
		channel, err = attach()
		var rpc *RPCError
		if err == nil || !replacingFailed || !errors.As(err, &rpc) || rpc.Code != "EVENT_ATTACHED" || attempt >= 39 {
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

func validateEventDelivery(delivery *pb.EventDelivery, contextID string, previous uint64) error {
	if delivery == nil {
		return errors.New("missing event delivery")
	}
	if delivery.ContextId != contextID {
		return errors.New("event delivery context mismatch")
	}
	if delivery.Sequence <= previous {
		return fmt.Errorf("event sequence %d is not greater than %d", delivery.Sequence, previous)
	}
	return nil
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

type eventCallback func(context.Context) error

func eventReply(ctx context.Context, sequence uint64, callback eventCallback) (reply *pb.EventReply) {
	reply = &pb.EventReply{Sequence: sequence, Outcome: &pb.EventReply_Acknowledged{Acknowledged: &pb.Empty{}}}
	defer func() {
		if recovered := recover(); recovered != nil {
			reply.Outcome = &pb.EventReply_Error{Error: callbackError(fmt.Errorf("event handler panic: %v", recovered), "CALLBACK_FAILED")}
		}
	}()
	if err := callback(ctx); err != nil {
		reply.Outcome = &pb.EventReply_Error{Error: callbackError(err, "CALLBACK_FAILED")}
	}
	return reply
}

func (d *eventDispatcher) decode(delivery *pb.EventDelivery) (eventCallback, error) {
	if delivery.Payload == nil && len(delivery.ProtoReflect().GetUnknown()) != 0 {
		return func(context.Context) error { return nil }, nil
	}
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
	default:
		return nil, errors.New("missing event payload")
	}
}

func notificationCallback[T any](correlation EventCorrelation, value T, handler func(context.Context, EventCorrelation, T) error) eventCallback {
	return func(ctx context.Context) error {
		if handler == nil {
			return nil
		}
		return handler(ctx, correlation, value)
	}
}

func operationProgress(value *pb.OperationProgress) (OperationProgress, error) {
	if value == nil {
		return OperationProgress{}, errors.New("missing progress notification")
	}
	progress := OperationProgress{Kind: ProgressKind(value.Kind)}
	var err error
	progress.TxHash, err = eventHash(value.TxHash)
	if err != nil {
		return progress, err
	}
	return progress, nil
}
