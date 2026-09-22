package main

import (
	"testing"

	sidecar "github.com/zama-ai/sdk/clients/go"
)

func TestDelegationStatusLine(t *testing.T) {
	for _, tt := range []struct {
		name   string
		status *sidecar.DelegationStatus
		want   string
	}{
		{"never delegated", &sidecar.DelegationStatus{IsActive: false, ExpiryTimestamp: 0}, "inactive (expiry 0)"},
		{"expired", &sidecar.DelegationStatus{IsActive: false, ExpiryTimestamp: 12345}, "inactive (expiry 12345)"},
		{"permanent", &sidecar.DelegationStatus{IsActive: true, ExpiryTimestamp: sidecar.PermanentDelegationExpiry}, "active (permanent)"},
		{"active", &sidecar.DelegationStatus{IsActive: true, ExpiryTimestamp: 99999}, "active (expiry 99999)"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if got := delegationStatusLine(tt.status); got != tt.want {
				t.Fatalf("got %q, want %q", got, tt.want)
			}
		})
	}
}
