use super::*;
use crate::{
    DelegateDecryptionParams, DelegationQuery, DelegationStatus, PERMANENT_DELEGATION_EXPIRY,
    RevokeDelegationParams, TransactionResult,
};

fn sample_transaction() -> generated::TransactionResult {
    generated::TransactionResult {
        transaction_hash: vec![1; 32],
        logs: vec![
            generated::TransactionLog {
                address: Some(vec![2; 20]),
                topics: vec![vec![3; 32], vec![4; 32]],
                data: vec![5, 6],
            },
            generated::TransactionLog {
                address: None,
                topics: vec![vec![7; 32]],
                data: vec![],
            },
        ],
    }
}

fn expect_decoded_sample(result: TransactionResult) {
    assert_eq!(result.transaction_hash, B256::repeat_byte(1));
    assert_eq!(result.logs.len(), 2);
    assert_eq!(result.logs[0].address, Some(Address::repeat_byte(2)));
    assert_eq!(
        result.logs[0].topics,
        vec![B256::repeat_byte(3), B256::repeat_byte(4)]
    );
    assert_eq!(result.logs[0].data, vec![5, 6]);
    assert_eq!(result.logs[1].address, None);
    assert_eq!(result.logs[1].topics, vec![B256::repeat_byte(7)]);
    assert!(result.logs[1].data.is_empty());
}

#[tokio::test]
async fn delegate_decryption_encodes_expiry_variants_and_decodes_transaction() {
    let captured = Arc::new(Mutex::new(Vec::new()));
    let capture = captured.clone();
    let server = Server::start(Arc::new(move |path, bytes| {
        if path.ends_with("/DelegateDecryption") {
            capture
                .lock()
                .unwrap()
                .push(DelegateDecryptionRequest::decode(bytes).unwrap());
            response(DelegateDecryptionResponse {
                transaction: Some(sample_transaction()),
            })
        } else {
            default_handler(path, bytes)
        }
    }))
    .await;
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .create_context(
            SdkConfig::new(11155111, "http://localhost:8545"),
            SignerConfig::Disabled,
        )
        .await
        .unwrap();
    let contract = Address::repeat_byte(9);
    let delegate = Address::repeat_byte(8);
    for expiry in [None, Some(1_700_000_000_000u64), Some(u64::MAX)] {
        let result = sdk
            .delegations()
            .delegate_decryption(DelegateDecryptionParams {
                contract_address: contract,
                delegate_address: delegate,
                expiration_date_ms: expiry,
            })
            .await
            .unwrap();
        expect_decoded_sample(result);
        let request = captured.lock().unwrap().last().cloned().unwrap();
        let delegation = request.delegation.unwrap();
        assert_eq!(delegation.contract_address, contract.to_vec());
        assert_eq!(delegation.delegate_address, delegate.to_vec());
        assert_eq!(delegation.expiration_date_ms, expiry);
    }
    sdk.close().await.unwrap();
}

#[tokio::test]
async fn revoke_delegation_encodes_wire_fields_and_decodes_transaction() {
    let captured = Arc::new(Mutex::new(Vec::new()));
    let capture = captured.clone();
    let server = Server::start(Arc::new(move |path, bytes| {
        if path.ends_with("/RevokeDelegation") {
            capture
                .lock()
                .unwrap()
                .push(RevokeDelegationRequest::decode(bytes).unwrap());
            response(RevokeDelegationResponse {
                transaction: Some(sample_transaction()),
            })
        } else {
            default_handler(path, bytes)
        }
    }))
    .await;
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .create_context(
            SdkConfig::new(11155111, "http://localhost:8545"),
            SignerConfig::Disabled,
        )
        .await
        .unwrap();
    let contract = Address::repeat_byte(6);
    let delegate = Address::repeat_byte(7);
    let result = sdk
        .delegations()
        .revoke_delegation(RevokeDelegationParams {
            contract_address: contract,
            delegate_address: delegate,
        })
        .await
        .unwrap();
    expect_decoded_sample(result);
    let request = captured.lock().unwrap().last().cloned().unwrap();
    let delegation = request.delegation.unwrap();
    assert_eq!(delegation.contract_address, contract.to_vec());
    assert_eq!(delegation.delegate_address, delegate.to_vec());
    sdk.close().await.unwrap();
}

#[tokio::test]
async fn queries_encode_addresses_and_succeed_without_a_signer() {
    let captured = Arc::new(Mutex::new(Vec::new()));
    let capture = captured.clone();
    let server = Server::start(Arc::new(move |path, bytes| {
        match path.rsplit('/').next().unwrap() {
            "IsDelegationActive" => {
                capture.lock().unwrap().push((
                    "IsDelegationActive",
                    generated::DelegationQueryRequest::decode(bytes).unwrap(),
                ));
                response(IsDelegationActiveResponse { is_active: true })
            }
            "GetDelegationExpiry" => {
                capture.lock().unwrap().push((
                    "GetDelegationExpiry",
                    generated::DelegationQueryRequest::decode(bytes).unwrap(),
                ));
                response(GetDelegationExpiryResponse {
                    expiry_timestamp: u64::MAX,
                })
            }
            "GetDelegationStatus" => {
                capture.lock().unwrap().push((
                    "GetDelegationStatus",
                    generated::DelegationQueryRequest::decode(bytes).unwrap(),
                ));
                response(GetDelegationStatusResponse {
                    is_active: false,
                    expiry_timestamp: 42,
                })
            }
            _ => default_handler(path, bytes),
        }
    }))
    .await;
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .create_context(
            SdkConfig::new(11155111, "http://localhost:8545"),
            SignerConfig::Disabled,
        )
        .await
        .unwrap();
    let contract = Address::repeat_byte(1);
    let delegator = Address::repeat_byte(2);
    let delegate = Address::repeat_byte(3);
    let query = DelegationQuery {
        contract_address: contract,
        delegator_address: delegator,
        delegate_address: delegate,
    };

    assert!(sdk.delegations().is_active(query).await.unwrap());
    let expiry = sdk.delegations().get_expiry(query).await.unwrap();
    assert_eq!(expiry, PERMANENT_DELEGATION_EXPIRY);
    let status = sdk.delegations().get_status(query).await.unwrap();
    assert_eq!(
        status,
        DelegationStatus {
            is_active: false,
            expiry_timestamp: 42,
        }
    );

    for (_, request) in captured.lock().unwrap().iter() {
        assert_eq!(request.contract_address, contract.to_vec());
        assert_eq!(request.delegator_address, delegator.to_vec());
        assert_eq!(request.delegate_address, delegate.to_vec());
    }
    sdk.close().await.unwrap();
}

#[tokio::test]
async fn transaction_result_rejects_malformed_or_missing_fields() {
    async fn expect_error(transaction: Option<generated::TransactionResult>, message: &str) {
        let server = Server::start(Arc::new(move |path, bytes| {
            if path.ends_with("/RevokeDelegation") {
                response(RevokeDelegationResponse {
                    transaction: transaction.clone(),
                })
            } else {
                default_handler(path, bytes)
            }
        }))
        .await;
        let sdk = Client::connect(&server.socket)
            .await
            .unwrap()
            .create_context(
                SdkConfig::new(11155111, "http://localhost:8545"),
                SignerConfig::Disabled,
            )
            .await
            .unwrap();
        let error = sdk
            .delegations()
            .revoke_delegation(RevokeDelegationParams {
                contract_address: Address::repeat_byte(1),
                delegate_address: Address::repeat_byte(2),
            })
            .await
            .unwrap_err();
        assert!(
            error.to_string().contains(message),
            "unexpected error: {error}"
        );
        sdk.close().await.unwrap();
    }

    expect_error(None, "missing transaction result").await;
    expect_error(
        Some(generated::TransactionResult {
            transaction_hash: vec![1; 31],
            logs: vec![],
        }),
        "invalid transaction hash length",
    )
    .await;
    expect_error(
        Some(generated::TransactionResult {
            transaction_hash: vec![1; 32],
            logs: vec![generated::TransactionLog {
                address: None,
                topics: vec![vec![1; 31]],
                data: vec![],
            }],
        }),
        "invalid transaction log topic length",
    )
    .await;
    expect_error(
        Some(generated::TransactionResult {
            transaction_hash: vec![1; 32],
            logs: vec![generated::TransactionLog {
                address: Some(vec![1; 19]),
                topics: vec![],
                data: vec![],
            }],
        }),
        "invalid log address length",
    )
    .await;
}

#[tokio::test]
async fn transaction_result_treats_present_but_empty_address_as_absent() {
    let server = Server::start(Arc::new(|path, bytes| {
        if path.ends_with("/RevokeDelegation") {
            response(RevokeDelegationResponse {
                transaction: Some(generated::TransactionResult {
                    transaction_hash: vec![1; 32],
                    logs: vec![generated::TransactionLog {
                        address: Some(vec![]),
                        topics: vec![],
                        data: vec![],
                    }],
                }),
            })
        } else {
            default_handler(path, bytes)
        }
    }))
    .await;
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .create_context(
            SdkConfig::new(11155111, "http://localhost:8545"),
            SignerConfig::Disabled,
        )
        .await
        .unwrap();
    let result = sdk
        .delegations()
        .revoke_delegation(RevokeDelegationParams {
            contract_address: Address::repeat_byte(1),
            delegate_address: Address::repeat_byte(2),
        })
        .await
        .unwrap();
    assert_eq!(result.logs[0].address, None);
    sdk.close().await.unwrap();
}

#[tokio::test]
async fn sdk_error_metadata_surfaces_on_revoke_delegation() {
    let server = Server::start(Arc::new(|path, bytes| {
        if path.ends_with("/RevokeDelegation") {
            Response::builder()
                .header("content-type", "application/grpc")
                .header("grpc-status", "5")
                .header("grpc-message", "no active delegation")
                .header("zama-error-code", "DELEGATION_NOT_FOUND")
                .header("zama-error-retryable", "false")
                .body(Full::new(Bytes::new()).boxed())
                .unwrap()
        } else {
            default_handler(path, bytes)
        }
    }))
    .await;
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .create_context(
            SdkConfig::new(11155111, "http://localhost:8545"),
            SignerConfig::Disabled,
        )
        .await
        .unwrap();
    let error = sdk
        .delegations()
        .revoke_delegation(RevokeDelegationParams {
            contract_address: Address::repeat_byte(1),
            delegate_address: Address::repeat_byte(2),
        })
        .await
        .unwrap_err();
    let error = error.downcast_ref::<RpcError>().unwrap();
    assert_eq!(error.status.code(), tonic::Code::NotFound);
    assert_eq!(error.sdk.as_ref().unwrap().code, "DELEGATION_NOT_FOUND");
    assert_eq!(error.sdk.as_ref().unwrap().message, "no active delegation");
    assert!(!error.sdk.as_ref().unwrap().retryable);
    sdk.close().await.unwrap();
}

#[test]
fn expiring_at_rejects_a_time_before_the_unix_epoch() {
    let before_epoch = std::time::UNIX_EPOCH - std::time::Duration::from_secs(1);
    let error = DelegateDecryptionParams::expiring_at(
        Address::repeat_byte(1),
        Address::repeat_byte(2),
        before_epoch,
    )
    .unwrap_err();
    assert!(error.to_string().contains("predates the unix epoch"));
    let params = DelegateDecryptionParams::expiring_at(
        Address::repeat_byte(1),
        Address::repeat_byte(2),
        std::time::UNIX_EPOCH + std::time::Duration::from_millis(1_700_000_000_123),
    )
    .unwrap();
    assert_eq!(params.expiration_date_ms, Some(1_700_000_000_123));
}
#[test]
fn expiring_at_rejects_a_time_whose_millisecond_count_exceeds_u64() {
    let beyond_u64_millis =
        std::time::UNIX_EPOCH + std::time::Duration::from_secs(u64::MAX / 1_000 + 1);
    let error = DelegateDecryptionParams::expiring_at(
        Address::repeat_byte(1),
        Address::repeat_byte(2),
        beyond_u64_millis,
    )
    .unwrap_err();
    assert!(
        error
            .to_string()
            .contains("does not fit in u64 milliseconds")
    );
}
