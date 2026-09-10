package sidecar

import (
	"errors"
	"strconv"

	pb "github.com/zama-ai/sdk/clients/go/gen/zama/sdk/v1alpha1"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

type SDKError struct {
	Code              string
	Message           string
	Retryable         bool
	RetryAfterSeconds *float64
}

func (e *SDKError) Error() string {
	if e.Code != "" {
		return e.Code + ": " + e.Message
	}
	return e.Message
}

func (e *SDKError) wire() *pb.SdkError {
	return &pb.SdkError{Code: e.Code, Message: e.Message, Retryable: e.Retryable, RetryAfterSeconds: e.RetryAfterSeconds}
}

type RPCError struct {
	SDKError
	cause error
}

func (e *RPCError) Error() string {
	if e.Code != "" {
		return e.Code + ": " + e.cause.Error()
	}
	return e.cause.Error()
}
func (e *RPCError) Unwrap() error { return e.cause }
func (e *RPCError) As(target any) bool {
	details, ok := target.(**SDKError)
	if ok {
		*details = &e.SDKError
	}
	return ok
}
func (e *RPCError) GRPCStatus() *status.Status { return status.Convert(e.cause) }
func rpcError(err error, trailers metadata.MD) error {
	if err == nil {
		return nil
	}
	result := &RPCError{SDKError: SDKError{Message: status.Convert(err).Message()}, cause: err}
	if v := trailers.Get("zama-error-code"); len(v) == 1 {
		result.Code = v[0]
	}
	if v := trailers.Get("zama-error-retryable"); len(v) == 1 {
		result.Retryable = v[0] == "true"
	}
	if v := trailers.Get("zama-error-retry-after-seconds"); len(v) == 1 {
		if n, e := strconv.ParseFloat(v[0], 64); e == nil {
			result.RetryAfterSeconds = &n
		}
	}
	return result
}
func sdkError(err *pb.SdkError) *SDKError {
	if err == nil {
		return nil
	}
	return &SDKError{Code: err.Code, Message: err.Message, Retryable: err.Retryable, RetryAfterSeconds: err.RetryAfterSeconds}
}

var ErrSigningRejected = errors.New("signing rejected")

func callbackError(err error, fallbackCode string) *pb.SdkError {
	var sdk *SDKError
	if errors.As(err, &sdk) {
		return sdk.wire()
	}
	return &pb.SdkError{Code: fallbackCode, Message: err.Error()}
}
func signingError(err error) *pb.SdkError {
	code := "SIGNING_FAILED"
	if errors.Is(err, ErrSigningRejected) {
		code = "SIGNING_REJECTED"
	}
	return callbackError(err, code)
}
