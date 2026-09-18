use anyhow::{Context, Result};
use std::time::{SystemTime, UNIX_EPOCH};
use zama_sdk_sidecar::{
    Address, DelegateDecryptionParams, DelegationQuery, DelegationStatus,
    PERMANENT_DELEGATION_EXPIRY, RevokeDelegationParams, Sdk,
};

pub async fn manage_delegation(
    sdk: &Sdk,
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

    let expiry_ms = u64::try_from(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .context("system clock before unix epoch")?
            .as_millis(),
    )
    .context("expiry does not fit in u64 milliseconds")?
        + 24 * 60 * 60 * 1000;
    let granted = sdk
        .delegations()
        .delegate_decryption(DelegateDecryptionParams {
            contract_address: token,
            delegate_address: delegate,
            expiration_date_ms: Some(expiry_ms),
        })
        .await?;
    println!("Delegation granted: {}", granted.transaction_hash);
    let status = sdk.delegations().get_status(query).await?;
    println!(
        "Delegation after grant: {}",
        delegation_status_line(&status)
    );

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
