package zama

import (
	"errors"
	"strconv"

	pb "github.com/zama-ai/sdk/clients/go/v3/internal/gen/zama/sdk/v1beta1"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// Codes this client produces itself; daemon codes arrive verbatim in SDKError.Code.
const (
	CodeTransactionOutcomeUnknown = "TRANSACTION_OUTCOME_UNKNOWN"
	CodeSigningFailed             = "SIGNING_FAILED"
	CodeSigningRejected           = "SIGNING_REJECTED"
	CodeChainMismatch             = "CHAIN_MISMATCH"
	CodeSignerNotConfigured       = "SIGNER_NOT_CONFIGURED"
	CodeStorageFailed             = "STORAGE_FAILED"
)

const (
	codeStorageRequestNotFound = "STORAGE_REQUEST_NOT_FOUND"
	codeSignerActionNotFound   = "SIGNER_ACTION_NOT_FOUND"
	codeEventDeliveryNotFound  = "EVENT_DELIVERY_NOT_FOUND"
	codeEventAttached          = "EVENT_ATTACHED"
	codeCallbackFailed         = "CALLBACK_FAILED"
)

type SDKError struct {
	Code              string
	Message           string
	Retryable         bool
	RetryAfterSeconds *uint32
}

func (e *SDKError) Error() string {
	if e.Code != "" {
		return e.Code + ": " + e.Message
	}
	return e.Message
}

// As is promoted to the wrapper types that embed SDKError, so errors.As reaches their details.
func (e *SDKError) As(target any) bool {
	details, ok := target.(**SDKError)
	if ok {
		*details = e
	}
	return ok
}

func (e *SDKError) wire() *pb.SdkError {
	return &pb.SdkError{Code: e.Code, Message: e.Message, Retryable: e.Retryable, RetryAfterSeconds: e.RetryAfterSeconds}
}

type RPCError struct {
	SDKError
	cause error
}

// Error names the SDK code and the status message; GRPCStatus keeps the transport framing reachable.
func (e *RPCError) Error() string {
	if e.Code != "" {
		return e.Code + ": " + status.Convert(e.cause).Message()
	}
	return e.cause.Error()
}
func (e *RPCError) Unwrap() error              { return e.cause }
func (e *RPCError) GRPCStatus() *status.Status { return status.Convert(e.cause) }
func rpcError(err error, trailers metadata.MD) error {
	if err == nil {
		return nil
	}
	return newRPCError(err, trailers)
}
func newRPCError(err error, trailers metadata.MD) *RPCError {
	result := &RPCError{SDKError: SDKError{Message: status.Convert(err).Message()}, cause: err}
	if v := trailers.Get("zama-error-code"); len(v) == 1 {
		result.Code = v[0]
	}
	if v := trailers.Get("zama-error-retryable"); len(v) == 1 {
		result.Retryable = v[0] == "true"
	}
	if v := trailers.Get("zama-error-retry-after-seconds"); len(v) == 1 {
		if n, e := strconv.ParseUint(v[0], 10, 32); e == nil {
			seconds := uint32(n)
			result.RetryAfterSeconds = &seconds
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

// IsOutcomeUnknown reports whether a contract write may have been broadcast; reconcile on-chain before retrying it.
func IsOutcomeUnknown(err error) bool {
	var details *SDKError
	return errors.As(err, &details) && details.Code == CodeTransactionOutcomeUnknown
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
	code := CodeSigningFailed
	if errors.Is(err, ErrSigningRejected) {
		code = CodeSigningRejected
	}
	return callbackError(err, code)
}
