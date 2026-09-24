package sidecar

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"sync"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	pb "github.com/zama-ai/sdk/clients/go/gen/zama/sdk/v1alpha1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
)

type eventServer struct {
	pb.UnimplementedSidecarServiceServer
	outgoing chan *pb.EventServerMessage
	replies  chan *pb.EventReply
	done     chan struct{}
	detached chan struct{}
}

func (s *eventServer) CreateContext(context.Context, *pb.CreateContextRequest) (*pb.CreateContextResponse, error) {
	return &pb.CreateContextResponse{ContextId: "events"}, nil
}
func (s *eventServer) CloseContext(context.Context, *pb.ContextRequest) (*pb.CloseContextResponse, error) {
	return &pb.CloseContextResponse{}, nil
}
func (s *eventServer) EventChannel(stream grpc.BidiStreamingServer[pb.EventClientMessage, pb.EventServerMessage]) error {
	if s.detached != nil {
		defer func() { s.detached <- struct{}{} }()
	}
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
	return &pb.EventServerMessage{Message: &pb.EventServerMessage_Delivery{Delivery: &pb.EventDelivery{ContextId: "events", OperationId: "rpc-1", Sequence: sequence, Payload: &pb.EventDelivery_Event{Event: &pb.SdkEvent{Type: pb.SdkEventKind_SDK_EVENT_KIND_DECRYPT_START}}}}}
}
func TestEventsOrderedCleanupAndReattach(t *testing.T) {
	server, client := eventFixture(t)
	sdk := unsignedSDK(t, client)
	entered := make(chan uint64, 3)
	release := make(chan struct{})
	sub, err := sdk.SubscribeEvents(testContext(t), EventHandlers{OnEvent: func(ctx context.Context, c EventCorrelation, event SDKEvent) error {
		entered <- c.Sequence
		if c.Sequence == 1 {
			select {
			case <-release:
			case <-ctx.Done():
				return ctx.Err()
			}
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
	select {
	case seq := <-entered:
		t.Fatalf("notification %d overtook blocked notification", seq)
	default:
	}
	close(release)
	select {
	case seq := <-entered:
		if seq != 2 {
			t.Fatal(seq)
		}
	case <-testContext(t).Done():
		t.Fatal("second handler did not start")
	}
	for _, sequence := range []uint64{1, 2} {
		select {
		case reply := <-server.replies:
			if reply.Sequence != sequence || reply.GetError() == nil {
				t.Fatalf("unexpected reply %v", reply)
			}
		case <-testContext(t).Done():
			t.Fatal("missing reply")
		}
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

func TestClosingEventsCancelsActiveHandler(t *testing.T) {
	server, client := eventFixture(t)
	sdk := unsignedSDK(t, client)
	entered := make(chan struct{})
	cancelled := make(chan struct{})
	subscription, err := sdk.SubscribeEvents(testContext(t), EventHandlers{
		OnEvent: func(ctx context.Context, _ EventCorrelation, _ SDKEvent) error {
			close(entered)
			<-ctx.Done()
			close(cancelled)
			return nil
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	server.outgoing <- deliverEvent(1)
	select {
	case <-entered:
	case <-testContext(t).Done():
		t.Fatal("notification did not start")
	}
	subscription.Close()
	select {
	case <-cancelled:
	case <-testContext(t).Done():
		t.Fatal("closing subscription did not cancel handler")
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

type delayedLossEventServer struct {
	pb.UnimplementedSidecarServiceServer
	mu       sync.Mutex
	active   bool
	first    bool
	release  chan struct{}
	rejected chan struct{}
	once     sync.Once
}

func (s *delayedLossEventServer) CreateContext(context.Context, *pb.CreateContextRequest) (*pb.CreateContextResponse, error) {
	return &pb.CreateContextResponse{ContextId: "events"}, nil
}

func (s *delayedLossEventServer) EventChannel(stream grpc.BidiStreamingServer[pb.EventClientMessage, pb.EventServerMessage]) error {
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
	first := s.first
	s.first = false
	s.mu.Unlock()
	if err := stream.Send(&pb.EventServerMessage{Message: &pb.EventServerMessage_Attached{Attached: &pb.Empty{}}}); err != nil {
		return err
	}
	if first {
		go func() {
			<-s.release
			s.mu.Lock()
			s.active = false
			s.mu.Unlock()
		}()
		return status.Error(codes.Unavailable, "event transport lost")
	}
	<-stream.Context().Done()
	s.mu.Lock()
	s.active = false
	s.mu.Unlock()
	return nil
}

func TestEventReattachAfterTransportLossWaitsForRemoteDetach(t *testing.T) {
	server := &delayedLossEventServer{first: true, release: make(chan struct{}), rejected: make(chan struct{})}
	client := testClient(t, server, nil)
	sdk := unsignedSDK(t, client)
	if _, err := sdk.SubscribeEvents(testContext(t), EventHandlers{}); err != nil {
		t.Fatal(err)
	}
	if err := sdk.WaitChannelFailure(testContext(t), EventChannel); status.Code(err) != codes.Unavailable {
		t.Fatalf("transport failure was not reported: %v", err)
	}
	type result struct {
		subscription *EventSubscription
		err          error
	}
	reattached := make(chan result, 1)
	go func() {
		subscription, err := sdk.SubscribeEvents(testContext(t), EventHandlers{})
		reattached <- result{subscription, err}
	}()
	select {
	case <-server.rejected:
	case <-testContext(t).Done():
		t.Fatal("reattach did not reach the remotely attached server")
	}
	close(server.release)
	select {
	case result := <-reattached:
		if result.err != nil {
			t.Fatalf("event reattach failed after transport loss: %v", result.err)
		}
		result.subscription.Close()
	case <-testContext(t).Done():
		t.Fatal("event reattach did not complete after transport loss")
	}
}

func TestEventPayload(t *testing.T) {
	large := new(big.Int).Lsh(big.NewInt(1), 200)
	hash := common.HexToHash("0x01")
	duration := 0.125
	sdkID := "sdk-operation"
	operation := pb.EventOperation_EVENT_OPERATION_GRANT_PERMIT
	path := pb.ShieldPath_SHIELD_PATH_TRANSFER_AND_CALL
	step := pb.ApprovalStep_APPROVAL_STEP_RESET
	decoded, err := sdkEvent(&pb.SdkEvent{Type: pb.SdkEventKind_SDK_EVENT_KIND_DECRYPT_END, Timestamp: 123.5, SdkOperationId: &sdkID, DurationMs: &duration, Operation: &operation, ShieldPath: &path, Step: &step, EncryptedValues: [][]byte{hash.Bytes()}, Result: []*pb.ClearEntry{{EncryptedValue: hash.Bytes(), Value: &pb.ClearValue{Value: &pb.ClearValue_BigintValue{BigintValue: large.String()}}}}})
	if err != nil || decoded.Result[hash].Integer.Cmp(large) != 0 || decoded.SDKOperationID == nil || decoded.Timestamp != 123.5 || decoded.DurationMS == nil || *decoded.DurationMS != duration {
		t.Fatalf("lost event payload: %+v %v", decoded, err)
	}
	if decoded.Operation == nil || *decoded.Operation != EventOperationGrantPermit || decoded.ShieldPath == nil || *decoded.ShieldPath != ShieldPathTransferAndCall || decoded.Step == nil || *decoded.Step != ApprovalStepReset {
		t.Fatalf("lost event enum payload: %+v", decoded)
	}
	if decoded.Kind.String() != pb.SdkEventKind_SDK_EVENT_KIND_DECRYPT_END.String() || decoded.Operation.String() != operation.String() || decoded.ShieldPath.String() != path.String() || decoded.Step.String() != step.String() || ProgressShieldSubmitted.String() != pb.ProgressKind_PROGRESS_KIND_SHIELD_SUBMITTED.String() {
		t.Fatal("native enum strings differ from protobuf")
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

func TestManagedEventsCanStopAndReattach(t *testing.T) {
	server, client := eventFixture(t)
	server.detached = make(chan struct{}, 1)
	firstCall := make(chan struct{}, 1)
	sdk, err := client.CreateContext(testContext(t), SDKConfig{Events: &EventHandlers{OnEvent: func(context.Context, EventCorrelation, SDKEvent) error {
		firstCall <- struct{}{}
		return nil
	}}}, SignerConfig{})
	if err != nil {
		t.Fatal(err)
	}
	server.outgoing <- deliverEvent(1)
	select {
	case <-firstCall:
	case <-testContext(t).Done():
		t.Fatal("managed handler did not receive delivery")
	}
	sdk.StopEvents()
	sdk.StopEvents()
	if err := sdk.WaitChannelFailure(testContext(t), EventChannel); !errors.Is(err, errEventSubscriptionClosed) {
		t.Fatalf("managed subscription did not stop: %v", err)
	}
	select {
	case <-server.detached:
	case <-testContext(t).Done():
		t.Fatal("managed stream did not detach")
	}
	secondCall := make(chan struct{}, 1)
	replacement, err := sdk.SubscribeEvents(testContext(t), EventHandlers{OnEvent: func(context.Context, EventCorrelation, SDKEvent) error {
		secondCall <- struct{}{}
		return nil
	}})
	if err != nil {
		t.Fatal(err)
	}
	defer replacement.Close()
	server.outgoing <- deliverEvent(1)
	select {
	case <-secondCall:
	case <-testContext(t).Done():
		t.Fatal("replacement handler did not receive delivery")
	}
}

func TestStopEventsWithoutSubscription(t *testing.T) {
	_, client := eventFixture(t)
	sdk := unsignedSDK(t, client)
	sdk.StopEvents()
	sdk.StopEvents()
	if err := sdk.WaitChannelFailure(testContext(t), EventChannel); err == nil || err.Error() != "callback channel has not been attached" {
		t.Fatalf("unexpected event channel state: %v", err)
	}
}

func TestEventContextMismatchClosesChannel(t *testing.T) {
	server, client := eventFixture(t)
	sdk := unsignedSDK(t, client)
	called := make(chan struct{}, 1)
	subscription, err := sdk.SubscribeEvents(testContext(t), EventHandlers{OnEvent: func(context.Context, EventCorrelation, SDKEvent) error {
		called <- struct{}{}
		return nil
	}})
	if err != nil {
		t.Fatal(err)
	}
	defer subscription.Close()
	frame := deliverEvent(1)
	frame.GetDelivery().ContextId = "other-context"
	server.outgoing <- frame
	if err := sdk.WaitChannelFailure(testContext(t), EventChannel); err == nil || err.Error() != "event delivery context mismatch" {
		t.Fatalf("mismatched context did not fail event channel: %v", err)
	}
	select {
	case <-called:
		t.Fatal("mismatched delivery reached handler")
	default:
	}
}

func TestEventDeliveryCorrelationErrors(t *testing.T) {
	for _, test := range []struct {
		name     string
		delivery *pb.EventDelivery
		want     string
	}{
		{"nil delivery", nil, "missing event delivery"},
		{"wrong context", &pb.EventDelivery{ContextId: "other", Sequence: 3}, "event delivery context mismatch"},
		{"duplicate sequence", &pb.EventDelivery{ContextId: "events", Sequence: 2}, "event sequence 2 is not greater than 2"},
		{"decreasing sequence", &pb.EventDelivery{ContextId: "events", Sequence: 1}, "event sequence 1 is not greater than 2"},
	} {
		t.Run(test.name, func(t *testing.T) {
			if err := validateEventDelivery(test.delivery, "events", 2); err == nil || err.Error() != test.want {
				t.Fatalf("unexpected correlation error: %v", err)
			}
		})
	}
}

func TestEventSequenceMustIncrease(t *testing.T) {
	for name, sequence := range map[string]uint64{"duplicate": 2, "decreasing": 1} {
		t.Run(name, func(t *testing.T) {
			server, client := eventFixture(t)
			sdk := unsignedSDK(t, client)
			subscription, err := sdk.SubscribeEvents(testContext(t), EventHandlers{})
			if err != nil {
				t.Fatal(err)
			}
			defer subscription.Close()
			server.outgoing <- deliverEvent(2)
			select {
			case reply := <-server.replies:
				if reply.Sequence != 2 {
					t.Fatalf("unexpected first reply: %v", reply)
				}
			case <-testContext(t).Done():
				t.Fatal("first delivery was not acknowledged")
			}
			server.outgoing <- deliverEvent(sequence)
			if err := sdk.WaitChannelFailure(testContext(t), EventChannel); err == nil || err.Error() != fmt.Sprintf("event sequence %d is not greater than 2", sequence) {
				t.Fatalf("nonincreasing sequence did not terminate channel: %v", err)
			}
			select {
			case reply := <-server.replies:
				t.Fatalf("invalid delivery acknowledged: %v", reply)
			default:
			}
		})
	}
}

func TestUnknownEventEnumsReachHandlerWithoutClosingChannel(t *testing.T) {
	server, client := eventFixture(t)
	sdk := unsignedSDK(t, client)
	received := make(chan SDKEvent, 1)
	subscription, err := sdk.SubscribeEvents(testContext(t), EventHandlers{OnEvent: func(_ context.Context, _ EventCorrelation, event SDKEvent) error {
		received <- event
		return nil
	}})
	if err != nil {
		t.Fatal(err)
	}
	defer subscription.Close()
	operation := pb.EventOperation(97)
	path := pb.ShieldPath(98)
	step := pb.ApprovalStep(99)
	server.outgoing <- &pb.EventServerMessage{Message: &pb.EventServerMessage_Delivery{Delivery: &pb.EventDelivery{
		ContextId: "events", Sequence: 1,
		Payload: &pb.EventDelivery_Event{Event: &pb.SdkEvent{Type: pb.SdkEventKind(96), Operation: &operation, ShieldPath: &path, Step: &step}},
	}}}
	select {
	case event := <-received:
		if event.Kind != 96 || event.Operation == nil || *event.Operation != EventOperation(operation) || event.ShieldPath == nil || *event.ShieldPath != ShieldPath(path) || event.Step == nil || *event.Step != ApprovalStep(step) {
			t.Fatalf("unknown enum values were lost: %+v", event)
		}
	case <-testContext(t).Done():
		t.Fatal("unknown event was not delivered")
	}
	select {
	case reply := <-server.replies:
		if reply.Sequence != 1 || reply.GetAcknowledged() == nil {
			t.Fatalf("unknown event not acknowledged: %v", reply)
		}
	case <-testContext(t).Done():
		t.Fatal("unknown event was not acknowledged")
	}
	server.outgoing <- deliverEvent(2)
	select {
	case event := <-received:
		if event.Kind != SDKEventDecryptStart {
			t.Fatalf("subsequent event was lost: %+v", event)
		}
	case <-testContext(t).Done():
		t.Fatal("channel closed after unknown event")
	}
}

func TestUnknownProgressKindIsPreserved(t *testing.T) {
	progress, err := operationProgress(&pb.OperationProgress{Kind: pb.ProgressKind(99)})
	if err != nil || progress.Kind != 99 {
		t.Fatalf("unknown progress kind was lost: %+v, %v", progress, err)
	}
	progress, err = operationProgress(&pb.OperationProgress{Kind: pb.ProgressKind_PROGRESS_KIND_SHIELD_SUBMITTED})
	if err != nil || progress.Kind != ProgressShieldSubmitted || progress.TxHash != nil {
		t.Fatalf("missing optional transaction hash was not preserved: %+v, %v", progress, err)
	}
}

func TestUnknownEventFramesAreSkippedAndChannelContinues(t *testing.T) {
	server, client := eventFixture(t)
	sdk := unsignedSDK(t, client)
	called := make(chan EventCorrelation, 1)
	subscription, err := sdk.SubscribeEvents(testContext(t), EventHandlers{OnEvent: func(_ context.Context, correlation EventCorrelation, _ SDKEvent) error {
		called <- correlation
		return nil
	}})
	if err != nil {
		t.Fatal(err)
	}
	defer subscription.Close()

	var futureOuter pb.EventServerMessage
	outerWire := protowire.AppendTag(nil, 4, protowire.BytesType)
	outerWire = protowire.AppendBytes(outerWire, []byte{1})
	if err := proto.Unmarshal(outerWire, &futureOuter); err != nil || futureOuter.Message != nil {
		t.Fatalf("future outer frame did not decode as unknown: %v", err)
	}
	server.outgoing <- &futureOuter

	knownDelivery, err := proto.Marshal(&pb.EventDelivery{ContextId: "events", Sequence: 1})
	if err != nil {
		t.Fatal(err)
	}
	unknownPayload := protowire.AppendTag(knownDelivery, 7, protowire.BytesType)
	unknownPayload = protowire.AppendBytes(unknownPayload, []byte{1})
	var futureDelivery pb.EventDelivery
	if err := proto.Unmarshal(unknownPayload, &futureDelivery); err != nil || futureDelivery.Payload != nil {
		t.Fatalf("future payload did not decode as unknown: %v", err)
	}
	server.outgoing <- &pb.EventServerMessage{Message: &pb.EventServerMessage_Delivery{Delivery: &futureDelivery}}
	select {
	case reply := <-server.replies:
		if reply.Sequence != 1 || reply.GetAcknowledged() == nil {
			t.Fatalf("future payload was not acknowledged: %v", reply)
		}
	case <-testContext(t).Done():
		t.Fatal("future payload was not acknowledged")
	}
	select {
	case correlation := <-called:
		t.Fatalf("future payload reached a handler: %+v", correlation)
	default:
	}
	server.outgoing <- deliverEvent(2)
	select {
	case correlation := <-called:
		if correlation.Sequence != 2 {
			t.Fatalf("wrong subsequent delivery: %+v", correlation)
		}
	case <-testContext(t).Done():
		t.Fatal("future frame closed event channel")
	}
	select {
	case reply := <-server.replies:
		if reply.Sequence != 2 || reply.GetAcknowledged() == nil {
			t.Fatalf("subsequent delivery was not acknowledged: %v", reply)
		}
	case <-testContext(t).Done():
		t.Fatal("subsequent delivery was not acknowledged")
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
	for sequence := uint64(2); sequence <= uint64(eventDeliveryWindow+2); sequence++ {
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
		"malformed progress hash":     {Payload: &pb.EventDelivery_Progress{Progress: &pb.OperationProgress{Kind: pb.ProgressKind_PROGRESS_KIND_SHIELD_SUBMITTED, TxHash: []byte{1}}}},
		"malformed SDK event address": {Payload: &pb.EventDelivery_Event{Event: &pb.SdkEvent{Type: pb.SdkEventKind_SDK_EVENT_KIND_DECRYPT_START, TokenAddress: []byte{1}}}},
		"malformed clear value":       {Payload: &pb.EventDelivery_Event{Event: &pb.SdkEvent{Type: pb.SdkEventKind_SDK_EVENT_KIND_DECRYPT_END, Result: []*pb.ClearEntry{{EncryptedValue: make([]byte, 32), Value: &pb.ClearValue{Value: &pb.ClearValue_BigintValue{BigintValue: "01"}}}}}}},
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
