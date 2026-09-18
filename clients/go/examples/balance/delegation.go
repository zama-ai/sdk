package main

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/ethereum/go-ethereum/common"
	sidecar "github.com/zama-ai/sdk/clients/go"
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

func manageDelegation(ctx context.Context, sdk *sidecar.SDKContext, token, owner, delegate common.Address) error {
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
	expiration := time.Now().Add(24 * time.Hour)
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
