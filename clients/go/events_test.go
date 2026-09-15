package sidecar

import (
	"context"
	"errors"
	"math/big"
	"sync"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	pb "github.com/zama-ai/sdk/clients/go/gen/zama/sdk/v1alpha1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

type eventServer struct {
	pb.UnimplementedSidecarServiceServer
	outgoing chan *pb.EventServerMessage
	replies  chan *pb.EventReply
	done     chan struct{}
}

func (s *eventServer) CreateContext(context.Context, *pb.CreateContextRequest) (*pb.CreateContextResponse, error) {
	return &pb.CreateContextResponse{ContextId: "events"}, nil
}
func (s *eventServer) CloseContext(context.Context, *pb.ContextRequest) (*pb.CloseContextResponse, error) {
	return &pb.CloseContextResponse{}, nil
}
func (s *eventServer) EventChannel(stream grpc.BidiStreamingServer[pb.EventClientMessage, pb.EventServerMessage]) error {
	attach, err := stream.Recv()
	if err != nil {
		return err
	}
	if attach.GetAttach().ContextId != "events" {
		return errors.New("wrong context")
	}
	if err := stream.Send(&pb.EventServerMessage{Message: &pb.EventServerMessage_Attached{Attached: &pb.Empty{}}}); err != nil {
		return err
	}
	return serveCallback(stream, s.outgoing, s.done, func(message *pb.EventClientMessage) error {
		select {
		case s.replies <- message.GetReply():
			return nil
		case <-stream.Context().Done():
			return stream.Context().Err()
		}
	})
}
func eventFixture(t *testing.T) (*eventServer, *Client) {
	server := &eventServer{outgoing: make(chan *pb.EventServerMessage, 260), replies: make(chan *pb.EventReply, 260), done: make(chan struct{})}
	return server, testClient(t, server, nil)
}
func deliverEvent(sequence uint64) *pb.EventServerMessage {
	return &pb.EventServerMessage{Message: &pb.EventServerMessage_Delivery{Delivery: &pb.EventDelivery{ContextId: "events", OperationId: "rpc-1", Sequence: sequence, Payload: &pb.EventDelivery_Event{Event: &pb.SdkEvent{Type: "decrypt:start"}}}}}
}
func TestEventsOrderedCancellationCleanupAndReattach(t *testing.T) {
	server, client := eventFixture(t)
	sdk := unsignedSDK(t, client)
	entered := make(chan uint64, 3)
	sub, err := sdk.SubscribeEvents(testContext(t), EventHandlers{OnEvent: func(ctx context.Context, c EventCorrelation, event SDKEvent) error {
		entered <- c.Sequence
		if c.Sequence == 1 {
			<-ctx.Done()
		}
		return errors.New("notification failure")
	}})
	if err != nil {
		t.Fatal(err)
	}
	defer sub.Close()
	server.outgoing <- deliverEvent(1)
	select {
	case seq := <-entered:
		if seq != 1 {
			t.Fatal(seq)
		}
	case <-testContext(t).Done():
		t.Fatal("handler did not start")
	}
	server.outgoing <- deliverEvent(2)
	server.outgoing <- &pb.EventServerMessage{Message: &pb.EventServerMessage_Cancelled{Cancelled: &pb.EventCancelled{Sequence: 1}}}
	select {
	case seq := <-entered:
		if seq != 2 {
			t.Fatal(seq)
		}
	case <-testContext(t).Done():
		t.Fatal("cancellation blocked behind handler")
	}
	select {
	case reply := <-server.replies:
		if reply.Sequence != 2 || reply.GetError() == nil {
			t.Fatalf("unexpected reply %v", reply)
		}
	case <-testContext(t).Done():
		t.Fatal("missing reply")
	}
	sub.Close()
	if err := sdk.WaitChannelFailure(testContext(t), EventChannel); err == nil {
		t.Fatal("missing close result")
	}
	second, err := sdk.SubscribeEvents(testContext(t), EventHandlers{})
	if err != nil {
		t.Fatal(err)
	}
	defer second.Close()
	sub.Close()
	server.outgoing <- deliverEvent(1)
	select {
	case reply := <-server.replies:
		if reply.Sequence != 1 {
			t.Fatal(reply)
		}
	case <-testContext(t).Done():
		t.Fatal("old cleanup closed replacement")
	}
}

func TestBatchCallbackDoesNotWaitForNotification(t *testing.T) {
	server, client := eventFixture(t)
	sdk := unsignedSDK(t, client)
	entered := make(chan struct{})
	subscription, err := sdk.SubscribeEvents(testContext(t), EventHandlers{
		OnEvent: func(ctx context.Context, _ EventCorrelation, _ SDKEvent) error {
			close(entered)
			<-ctx.Done()
			return nil
		},
		OnBatchError: func(_ context.Context, _ EventCorrelation, _ BatchErrorCallback) (*big.Int, error) {
			return big.NewInt(42), nil
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer subscription.Close()
	server.outgoing <- deliverEvent(1)
	select {
	case <-entered:
	case <-testContext(t).Done():
		t.Fatal("notification did not start")
	}
	server.outgoing <- &pb.EventServerMessage{Message: &pb.EventServerMessage_Delivery{Delivery: &pb.EventDelivery{
		ContextId: "events", OperationId: "rpc-2", Sequence: 2,
		Payload: &pb.EventDelivery_BatchError{BatchError: &pb.BatchErrorCallback{TokenAddress: make([]byte, 20), Error: &pb.SdkError{Code: "FAILED"}}},
	}}}
	select {
	case reply := <-server.replies:
		if reply.Sequence != 2 || reply.GetFallbackBigint() != "42" {
			t.Fatalf("batch callback blocked or misrouted: %v", reply)
		}
	case <-testContext(t).Done():
		t.Fatal("batch callback blocked behind notification")
	}
}

type delayedDetachEventServer struct {
	pb.UnimplementedSidecarServiceServer
	mu       sync.Mutex
	active   bool
	release  chan struct{}
	rejected chan struct{}
	once     sync.Once
}

func (s *delayedDetachEventServer) CreateContext(context.Context, *pb.CreateContextRequest) (*pb.CreateContextResponse, error) {
	return &pb.CreateContextResponse{ContextId: "events"}, nil
}

func (s *delayedDetachEventServer) EventChannel(stream grpc.BidiStreamingServer[pb.EventClientMessage, pb.EventServerMessage]) error {
	if _, err := stream.Recv(); err != nil {
		return err
	}
	s.mu.Lock()
	if s.active {
		s.mu.Unlock()
		stream.SetTrailer(metadata.Pairs("zama-error-code", "EVENT_ATTACHED"))
		s.once.Do(func() { close(s.rejected) })
		return status.Error(codes.AlreadyExists, "event channel already attached")
	}
	s.active = true
	s.mu.Unlock()
	if err := stream.Send(&pb.EventServerMessage{Message: &pb.EventServerMessage_Attached{Attached: &pb.Empty{}}}); err != nil {
		return err
	}
	<-stream.Context().Done()
	<-s.release
	s.mu.Lock()
	s.active = false
	s.mu.Unlock()
	return nil
}

func TestImmediateEventReattachWaitsForRemoteDetach(t *testing.T) {
	server := &delayedDetachEventServer{release: make(chan struct{}), rejected: make(chan struct{})}
	client := testClient(t, server, nil)
	sdk := unsignedSDK(t, client)
	first, err := sdk.SubscribeEvents(testContext(t), EventHandlers{})
	if err != nil {
		t.Fatal(err)
	}
	first.Close()
	ctx := testContext(t)
	type result struct {
		subscription *EventSubscription
		err          error
	}
	reattached := make(chan result, 1)
	go func() {
		subscription, err := sdk.SubscribeEvents(ctx, EventHandlers{})
		reattached <- result{subscription, err}
	}()
	select {
	case <-server.rejected:
	case <-testContext(t).Done():
		t.Fatal("reattach did not reach the still-attached server")
	}
	close(server.release)
	select {
	case result := <-reattached:
		if result.err != nil {
			t.Fatalf("event reattach failed: %v", result.err)
		}
		result.subscription.Close()
	case <-testContext(t).Done():
		t.Fatal("event reattach did not complete")
	}
}

func TestEventPayloadAndBatchReplies(t *testing.T) {
	large := new(big.Int).Lsh(big.NewInt(1), 200)
	hash := common.HexToHash("0x01")
	duration := 0.125
	sdkID := "sdk-operation"
	decoded, err := sdkEvent(&pb.SdkEvent{Type: "decrypt:end", Timestamp: 123.5, SdkOperationId: &sdkID, DurationMs: &duration, EncryptedValues: [][]byte{hash.Bytes()}, Result: []*pb.ClearEntry{{EncryptedValue: hash.Bytes(), Value: &pb.ClearValue{Value: &pb.ClearValue_BigintValue{BigintValue: large.String()}}}}})
	if err != nil || decoded.Result[hash].Integer.Cmp(large) != 0 || decoded.SDKOperationID == nil || decoded.Timestamp != 123.5 || decoded.DurationMS == nil || *decoded.DurationMS != duration {
		t.Fatalf("lost event payload: %+v %v", decoded, err)
	}
	dispatcher := &eventDispatcher{handlers: EventHandlers{OnBatchError: func(_ context.Context, c EventCorrelation, e BatchErrorCallback) (*big.Int, error) {
		if c.OperationID != "rpc" || c.Sequence != 3 || e.Error.Code != "FAILED" {
			t.Error("lost correlation/error")
		}
		return large, nil
	}}}
	delivery := &pb.EventDelivery{Sequence: 3, OperationId: "rpc", Payload: &pb.EventDelivery_BatchError{BatchError: &pb.BatchErrorCallback{TokenAddress: make([]byte, 20), Error: &pb.SdkError{Code: "FAILED"}}}}
	if reply := decodedEventReply(t, dispatcher, delivery); reply.GetFallbackBigint() != large.String() {
		t.Fatal(reply)
	}
	dispatcher.handlers.OnBatchError = func(context.Context, EventCorrelation, BatchErrorCallback) (*big.Int, error) {
		return nil, &SDKError{Code: "CUSTOM", Message: "rejected", Retryable: true}
	}
	if reply := decodedEventReply(t, dispatcher, delivery); reply.GetError().Code != "CUSTOM" || !reply.GetError().Retryable {
		t.Fatal(reply)
	}
	dispatcher.handlers.OnBatchError = nil
	if reply := decodedEventReply(t, dispatcher, delivery); reply.GetError() == nil {
		t.Fatal("missing handler accepted")
	}
}
func TestManagedEventsAndChannelLoss(t *testing.T) {
	server, client := eventFixture(t)
	called := make(chan struct{}, 1)
	sdk, err := client.CreateContext(testContext(t), SDKConfig{Events: &EventHandlers{OnEvent: func(context.Context, EventCorrelation, SDKEvent) error { called <- struct{}{}; return nil }}}, SignerConfig{})
	if err != nil {
		t.Fatal(err)
	}
	server.outgoing <- deliverEvent(1)
	select {
	case <-called:
	case <-testContext(t).Done():
		t.Fatal("managed handler missing")
	}
	close(server.done)
	if err := sdk.WaitChannelFailure(testContext(t), EventChannel); err == nil {
		t.Fatal("loss unreported")
	}
}

func TestEventBackpressureCancelsActiveHandler(t *testing.T) {
	server, client := eventFixture(t)
	sdk := unsignedSDK(t, client)
	entered := make(chan struct{})
	cancelled := make(chan struct{})
	sub, err := sdk.SubscribeEvents(testContext(t), EventHandlers{OnEvent: func(ctx context.Context, c EventCorrelation, _ SDKEvent) error {
		if c.Sequence == 1 {
			close(entered)
			<-ctx.Done()
			close(cancelled)
		}
		return nil
	}})
	if err != nil {
		t.Fatal(err)
	}
	defer sub.Close()
	server.outgoing <- deliverEvent(1)
	select {
	case <-entered:
	case <-testContext(t).Done():
		t.Fatal("missing first handler")
	}
	for sequence := uint64(2); sequence <= 258; sequence++ {
		server.outgoing <- deliverEvent(sequence)
	}
	if err := sdk.WaitChannelFailure(testContext(t), EventChannel); err == nil {
		t.Fatal("queue overflow accepted")
	}
	select {
	case <-cancelled:
	case <-testContext(t).Done():
		t.Fatal("overflow did not cancel callback")
	}
}

func TestWalletAndProgressPayloads(t *testing.T) {
	address := common.HexToAddress("0x01")
	hash := common.HexToHash("0x02")
	walletCalls, progressCalls := 0, 0
	dispatcher := &eventDispatcher{handlers: EventHandlers{
		OnWalletAccountChanged: func(_ context.Context, _ EventCorrelation, change WalletAccountChanged) error {
			walletCalls++
			if change.Previous == nil || change.Previous.Address != address || change.Previous.ChainID != 1 || change.Next != nil {
				t.Error("lost disconnect payload")
			}
			return nil
		},
		OnProgress: func(_ context.Context, _ EventCorrelation, progress OperationProgress) error {
			progressCalls++
			if progress.Kind != ProgressShieldSubmitted || progress.TxHash == nil || *progress.TxHash != hash {
				t.Error("lost progress payload")
			}
			return nil
		},
	}}
	wallet := &pb.EventDelivery{Payload: &pb.EventDelivery_WalletAccount{WalletAccount: &pb.WalletAccountChanged{Previous: &pb.WalletAccount{Address: address.Bytes(), ChainId: 1}}}}
	progress := &pb.EventDelivery{Payload: &pb.EventDelivery_Progress{Progress: &pb.OperationProgress{Kind: pb.ProgressKind_PROGRESS_KIND_SHIELD_SUBMITTED, TxHash: hash.Bytes()}}}
	for _, delivery := range []*pb.EventDelivery{wallet, progress} {
		if reply := decodedEventReply(t, dispatcher, delivery); reply.GetAcknowledged() == nil {
			t.Fatal(reply)
		}
	}
	if walletCalls != 1 || progressCalls != 1 {
		t.Fatal("missing callbacks")
	}
}

func TestEventHandlerPanicBecomesReplyError(t *testing.T) {
	dispatcher := &eventDispatcher{handlers: EventHandlers{OnEvent: func(context.Context, EventCorrelation, SDKEvent) error { panic("handler failed") }}}
	reply := decodedEventReply(t, dispatcher, deliverEvent(1).GetDelivery())
	if reply.GetError() == nil || reply.GetError().Code != "CALLBACK_FAILED" {
		t.Fatal(reply)
	}
}

func decodedEventReply(t *testing.T, dispatcher *eventDispatcher, delivery *pb.EventDelivery) *pb.EventReply {
	t.Helper()
	callback, err := dispatcher.decode(delivery)
	if err != nil {
		t.Fatal(err)
	}
	return eventReply(context.Background(), delivery.Sequence, callback)
}

func TestMalformedEventPayloadClosesChannel(t *testing.T) {
	tests := map[string]*pb.EventDelivery{
		"missing submitted hash":      {Payload: &pb.EventDelivery_Progress{Progress: &pb.OperationProgress{Kind: pb.ProgressKind_PROGRESS_KIND_SHIELD_SUBMITTED}}},
		"malformed progress hash":     {Payload: &pb.EventDelivery_Progress{Progress: &pb.OperationProgress{Kind: pb.ProgressKind_PROGRESS_KIND_SHIELD_SUBMITTED, TxHash: []byte{1}}}},
		"unknown progress kind":       {Payload: &pb.EventDelivery_Progress{Progress: &pb.OperationProgress{Kind: 99}}},
		"unknown SDK event":           {Payload: &pb.EventDelivery_Event{Event: &pb.SdkEvent{Type: "future:event"}}},
		"malformed SDK event address": {Payload: &pb.EventDelivery_Event{Event: &pb.SdkEvent{Type: "decrypt:start", TokenAddress: []byte{1}}}},
		"malformed clear value":       {Payload: &pb.EventDelivery_Event{Event: &pb.SdkEvent{Type: "decrypt:end", Result: []*pb.ClearEntry{{EncryptedValue: make([]byte, 32), Value: &pb.ClearValue{Value: &pb.ClearValue_BigintValue{BigintValue: "01"}}}}}}},
		"missing payload":             {},
	}
	for name, delivery := range tests {
		t.Run(name, func(t *testing.T) {
			server, client := eventFixture(t)
			sdk := unsignedSDK(t, client)
			called := make(chan struct{}, 1)
			subscription, err := sdk.SubscribeEvents(testContext(t), EventHandlers{
				OnEvent:    func(context.Context, EventCorrelation, SDKEvent) error { called <- struct{}{}; return nil },
				OnProgress: func(context.Context, EventCorrelation, OperationProgress) error { called <- struct{}{}; return nil },
			})
			if err != nil {
				t.Fatal(err)
			}
			defer subscription.Close()
			delivery.ContextId = "events"
			delivery.Sequence = 1
			server.outgoing <- &pb.EventServerMessage{Message: &pb.EventServerMessage_Delivery{Delivery: delivery}}
			if err := sdk.WaitChannelFailure(testContext(t), EventChannel); err == nil || errors.Is(err, context.DeadlineExceeded) {
				t.Fatalf("malformed payload did not terminate channel: %v", err)
			}
			select {
			case <-called:
				t.Fatal("malformed payload reached handler")
			default:
			}
			select {
			case reply := <-server.replies:
				t.Fatalf("protocol failure acknowledged: %v", reply)
			default:
			}
		})
	}
}
