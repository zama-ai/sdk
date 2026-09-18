package main

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
	sidecar "github.com/zama-ai/sdk/clients/go"
)

const (
	nextBlockPollInterval = 2 * time.Second
	nextBlockWaitTimeout  = 90 * time.Second
)

func delegationStatusLine(status *sidecar.DelegationStatus) string {
	if !status.IsActive {
		return "inactive (expiry " + strconv.FormatUint(status.ExpiryTimestamp, 10) + ")"
	}
	if status.ExpiryTimestamp == sidecar.PermanentDelegationExpiry {
		return "active (permanent)"
	}
	return "active (expiry " + strconv.FormatUint(status.ExpiryTimestamp, 10) + ")"
}

func manageDelegation(ctx context.Context, sdk *sidecar.SDKContext, provider *ethclient.Client, token, owner, delegate common.Address) error {
	fmt.Printf("Delegate: %s\n", delegate.Hex())
	query := sidecar.DelegationQuery{ContractAddress: token, DelegatorAddress: owner, DelegateAddress: delegate}
	before, err := sdk.GetDelegationStatus(ctx, query)
	if err != nil {
		return err
	}
	fmt.Printf("Delegation before: %s\n", delegationStatusLine(before))
	if before.IsActive {
		fmt.Println("Existing delegation left in place; the demo only revokes what it granted.")
		return nil
	}
	// The SDK rejects expiries under 1 hour.
	expiration := time.Now().Add(2 * time.Hour)
	granted, err := sdk.DelegateDecryption(ctx, sidecar.DelegateDecryptionParams{ContractAddress: token, DelegateAddress: delegate, ExpirationDate: &expiration})
	if err != nil {
		return err
	}
	fmt.Printf("Delegation granted: %s\n", granted.TxHash.Hex())
	after, err := sdk.GetDelegationStatus(ctx, query)
	if err != nil {
		return err
	}
	fmt.Printf("Delegation after grant: %s\n", delegationStatusLine(after))
	fmt.Println("Waiting for the next block before revoking.")
	if err := waitForNextBlock(ctx, provider); err != nil {
		return err
	}
	revoked, err := sdk.RevokeDelegation(ctx, sidecar.RevokeDelegationParams{ContractAddress: token, DelegateAddress: delegate})
	if err != nil {
		return err
	}
	fmt.Printf("Delegation revoked: %s\n", revoked.TxHash.Hex())
	final, err := sdk.GetDelegationStatus(ctx, query)
	if err != nil {
		return err
	}
	fmt.Printf("Delegation after revoke: %s\n", delegationStatusLine(final))
	return nil
}

// waitForNextBlock blocks until the chain advances past the block observed at call time, so the revoke lands in a different block than the grant.
func waitForNextBlock(ctx context.Context, provider *ethclient.Client) error {
	start, err := provider.BlockNumber(ctx)
	if err != nil {
		return err
	}
	deadline := time.Now().Add(nextBlockWaitTimeout)
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(nextBlockPollInterval):
		}
		current, err := provider.BlockNumber(ctx)
		if err != nil {
			return err
		}
		if current > start {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("timed out after %s waiting for a block past %d", nextBlockWaitTimeout, start)
		}
	}
}
