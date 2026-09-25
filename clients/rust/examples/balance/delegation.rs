use alloy_provider::Provider;
use anyhow::{Context, Result};
use std::time::{Duration, SystemTime};
use zama_sdk::{
    Address, DelegateDecryptionParams, DelegationQuery, DelegationStatus,
    PERMANENT_DELEGATION_EXPIRY, RevokeDelegationParams, Sdk,
};

/// The SDK rejects expiries under 1 hour, so the demo grants comfortably above that.
const GRANT_DURATION: Duration = Duration::from_secs(2 * 60 * 60);
const BLOCK_POLL_INTERVAL: Duration = Duration::from_secs(2);
const BLOCK_WAIT_TIMEOUT: Duration = Duration::from_secs(90);

pub async fn manage_delegation(
    sdk: &Sdk,
    provider: &impl Provider,
    token: Address,
    owner: Address,
    delegate: Address,
) -> Result<()> {
    println!("Delegate: {delegate}");
    let query = DelegationQuery {
        contract_address: token,
        delegator_address: owner,
        delegate_address: delegate,
    };
    let status = sdk.delegations().get_status(query).await?;
    println!("Delegation before: {}", delegation_status_line(&status));
    if status.is_active {
        println!("Existing delegation left in place; the demo only revokes what it granted.");
        return Ok(());
    }

    let expiring_at = SystemTime::now()
        .checked_add(GRANT_DURATION)
        .context("grant duration overflows the system clock")?;
    let params = DelegateDecryptionParams::expiring_at(token, delegate, expiring_at)?;
    let granted = sdk.delegations().delegate_decryption(params).await?;
    println!("Delegation granted: {}", granted.transaction_hash);
    let status = sdk.delegations().get_status(query).await?;
    println!(
        "Delegation after grant: {}",
        delegation_status_line(&status)
    );

    println!("Waiting for the next block before revoking.");
    wait_for_next_block(provider).await?;

    let revoked = sdk
        .delegations()
        .revoke_delegation(RevokeDelegationParams {
            contract_address: token,
            delegate_address: delegate,
        })
        .await?;
    println!("Delegation revoked: {}", revoked.transaction_hash);
    let status = sdk.delegations().get_status(query).await?;
    println!(
        "Delegation after revoke: {}",
        delegation_status_line(&status)
    );
    Ok(())
}

/// Polls the block number until it advances past the block observed right after the grant.
async fn wait_for_next_block(provider: &impl Provider) -> Result<()> {
    let starting_block = provider
        .get_block_number()
        .await
        .context("read the current block number")?;
    let deadline = tokio::time::Instant::now() + BLOCK_WAIT_TIMEOUT;
    loop {
        let block = provider
            .get_block_number()
            .await
            .context("read the current block number")?;
        if block > starting_block {
            return Ok(());
        }
        if tokio::time::Instant::now() >= deadline {
            anyhow::bail!(
                "timed out after {BLOCK_WAIT_TIMEOUT:?} waiting for a block past {starting_block}"
            );
        }
        tokio::time::sleep(BLOCK_POLL_INTERVAL).await;
    }
}

fn delegation_status_line(status: &DelegationStatus) -> String {
    if !status.is_active {
        format!("inactive (expiry {})", status.expiry_timestamp)
    } else if status.expiry_timestamp == PERMANENT_DELEGATION_EXPIRY {
        "active (permanent)".into()
    } else {
        format!("active (expiry {})", status.expiry_timestamp)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn describes_every_status_shape() {
        for (status, want) in [
            (
                DelegationStatus {
                    is_active: false,
                    expiry_timestamp: 0,
                },
                "inactive (expiry 0)",
            ),
            (
                DelegationStatus {
                    is_active: false,
                    expiry_timestamp: 1_700_000_000,
                },
                "inactive (expiry 1700000000)",
            ),
            (
                DelegationStatus {
                    is_active: true,
                    expiry_timestamp: PERMANENT_DELEGATION_EXPIRY,
                },
                "active (permanent)",
            ),
            (
                DelegationStatus {
                    is_active: true,
                    expiry_timestamp: 2_000_000_000,
                },
                "active (expiry 2000000000)",
            ),
        ] {
            assert_eq!(delegation_status_line(&status), want);
        }
    }
}
