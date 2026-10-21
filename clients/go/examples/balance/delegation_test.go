package main

import (
	"testing"

	"github.com/zama-ai/sdk/clients/go/v3"
)

func TestDelegationStatusLine(t *testing.T) {
	for _, tt := range []struct {
		name   string
		status *zama.DelegationStatus
		want   string
	}{
		{"never delegated", &zama.DelegationStatus{IsActive: false, ExpiryTimestamp: 0}, "inactive (expiry 0)"},
		{"expired", &zama.DelegationStatus{IsActive: false, ExpiryTimestamp: 12345}, "inactive (expiry 12345)"},
		{"permanent", &zama.DelegationStatus{IsActive: true, ExpiryTimestamp: zama.PermanentDelegationExpiry}, "active (permanent)"},
		{"active", &zama.DelegationStatus{IsActive: true, ExpiryTimestamp: 99999}, "active (expiry 99999)"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if got := delegationStatusLine(tt.status); got != tt.want {
				t.Fatalf("got %q, want %q", got, tt.want)
			}
		})
	}
}
