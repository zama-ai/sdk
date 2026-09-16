package sidecar

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"google.golang.org/grpc"
)

type ChannelKind string

const (
	SignerChannel  ChannelKind = "signer"
	StorageChannel ChannelKind = "storage"
)

type callbackChannel struct {
	cancel context.CancelFunc
	done   chan struct{}
	err    error
}

// WaitChannelFailure waits for the current attachment to end; reattach explicitly after failure.
func (s *SDKContext) WaitChannelFailure(ctx context.Context, kind ChannelKind) error {
	s.mu.Lock()
	var channel *callbackChannel
	switch kind {
	case SignerChannel:
		channel = s.signer
	case StorageChannel:
		channel = s.storage
	default:
		s.mu.Unlock()
		return errors.New("unknown callback channel")
	}
	s.mu.Unlock()
	if channel == nil {
		return errors.New("callback channel has not been attached")
	}
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-channel.done:
		s.mu.Lock()
		defer s.mu.Unlock()
		return channel.err
	}
}

func (s *SDKContext) channelFailed(channel *callbackChannel, kind ChannelKind, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if channel.err != nil {
		return
	}
	channel.err = err
	channel.cancel()
	close(channel.done)
	if kind != SignerChannel || s.signer != channel {
		return
	}
	for _, op := range s.operations {
		// A delayed stream failure must not cancel signer-independent work.
		if len(op.actions) == 0 {
			continue
		}
		if op.failure == nil {
			op.failure = err
		}
		op.cancel()
	}
}

func attachChannel[C, S any](
	ctx context.Context, sdk *SDKContext, kind ChannelKind, slot **callbackChannel,
	open func(context.Context) (grpc.BidiStreamingClient[C, S], error),
	attach *C, attached func(*S) bool,
	handle func(context.Context, *S, func(*C)) error,
) error {
	sdk.mu.Lock()
	if sdk.terminal != nil {
		err := sdk.terminal
		sdk.mu.Unlock()
		return err
	}
	if *slot != nil && (*slot).err == nil {
		sdk.mu.Unlock()
		return fmt.Errorf("%s channel already attached", kind)
	}
	channelctx, cancel := context.WithCancel(context.Background())
	channel := &callbackChannel{cancel: cancel, done: make(chan struct{})}
	*slot = channel
	sdk.mu.Unlock()
	fail := func(err error) { sdk.channelFailed(channel, kind, err) }
	type attachment struct {
		stream grpc.BidiStreamingClient[C, S]
		err    error
	}
	ready := make(chan attachment, 1)
	go func() {
		stream, err := open(channelctx)
		if err == nil {
			err = stream.Send(attach)
			if err == nil {
				var message *S
				message, err = stream.Recv()
				if err == nil && !attached(message) {
					err = fmt.Errorf("missing %s attachment acknowledgment", kind)
				}
			}
			if err != nil {
				err = rpcError(err, stream.Trailer())
			}
		}
		ready <- attachment{stream: stream, err: err}
	}()
	var stream grpc.BidiStreamingClient[C, S]
	select {
	case <-ctx.Done():
		fail(ctx.Err())
		return ctx.Err()
	case result := <-ready:
		if result.err != nil {
			fail(result.err)
			return result.err
		}
		stream = result.stream
	}
	var sendMu sync.Mutex
	send := func(message *C) {
		sendMu.Lock()
		err := stream.Send(message)
		sendMu.Unlock()
		if err != nil {
			fail(err)
		}
	}
	go func() {
		for {
			message, err := stream.Recv()
			if err != nil {
				fail(rpcError(err, stream.Trailer()))
				return
			}
			if err := handle(channelctx, message, send); err != nil {
				fail(err)
				return
			}
		}
	}()
	return nil
}
