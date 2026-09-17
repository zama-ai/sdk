use super::*;
use crate::{PrepareFees, PrepareOptions, PrepareTransaction, Transaction, TransactionKind};

#[tokio::test]
async fn prepares_every_kind_with_exact_fields_and_optional_presence() {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let captured = seen.clone();
    let server = Server::start(Arc::new(move |path, bytes| {
        if path.ends_with("/PrepareTransaction") {
            captured
                .lock()
                .unwrap()
                .push(PrepareTransactionRequest::decode(bytes).unwrap());
            response(generated::PrepareTransactionResponse {
                kind: generated::TransactionKind::SetOperator as i32,
                from: vec![9; 20],
                unsigned_tx: vec![2, 0, 255, 128],
            })
        } else {
            default_handler(path, bytes)
        }
    }))
    .await;
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .sdk(SdkConfig::new(11155111, "http://localhost:8545"))
        .build()
        .await
        .unwrap();
    let a = Address::repeat_byte(1);
    let b = Address::repeat_byte(2);
    let c = Address::repeat_byte(3);
    let n: BigInt = "340282366920938463463374607431768211457".parse().unwrap();
    let transactions = vec![
        Transaction::ConfidentialTransfer {
            token: a,
            to: b,
            amount: n.clone(),
        },
        Transaction::ConfidentialTransferFrom {
            token: a,
            owner: b,
            to: c,
            amount: n.clone(),
        },
        Transaction::SetOperator {
            token: a,
            operator: b,
            until: 1,
        },
        Transaction::Unwrap {
            token: a,
            to: b,
            amount: n.clone(),
        },
        Transaction::UnwrapAll { token: a, to: b },
        Transaction::FinalizeUnwrap {
            wrapper: a,
            unwrap_request_id_or_amount: vec![255; 32],
        },
        Transaction::ApproveUnderlying {
            underlying: a,
            spender: b,
            amount: n.clone(),
        },
        Transaction::Wrap {
            wrapper: a,
            to: b,
            amount: n.clone(),
        },
        Transaction::TransferAndCall {
            underlying: a,
            wrapper: b,
            amount: n.clone(),
            recipient_data: None,
        },
        Transaction::DelegateDecryption {
            contract_address: a,
            delegate_address: b,
            expiration_date_ms: None,
        },
        Transaction::RevokeDelegation {
            contract_address: a,
            delegate_address: b,
        },
        Transaction::TransferAndCall {
            underlying: a,
            wrapper: b,
            amount: (-1).into(),
            recipient_data: Some(vec![]),
        },
        Transaction::DelegateDecryption {
            contract_address: a,
            delegate_address: b,
            expiration_date_ms: Some(0),
        },
    ];
    for (index, transaction) in transactions.into_iter().enumerate() {
        let options = (index != 0).then(|| PrepareOptions {
            nonce: Some(0),
            gas_limit: Some(0.into()),
            fees: Some(PrepareFees {
                max_fee_per_gas: n.clone(),
                max_priority_fee_per_gas: 0.into(),
            }),
        });
        let result = sdk
            .offline()
            .prepare(
                PrepareTransaction {
                    from: c,
                    transaction,
                },
                options,
            )
            .await
            .unwrap();
        assert_eq!(result.kind, TransactionKind::SetOperator);
        assert_eq!(result.from, Address::repeat_byte(9));
        assert_eq!(result.unsigned_tx, vec![2, 0, 255, 128]);
    }
    sdk.close().await.unwrap();
    let requests = seen.lock().unwrap();
    let mut ids = std::collections::HashSet::new();
    for (i, r) in requests.iter().enumerate() {
        let op = r.operation.as_ref().unwrap();
        assert_eq!(op.context_id, "context");
        assert!(!op.operation_id.is_empty());
        assert!(ids.insert(&op.operation_id));
        assert_eq!(r.from, c.to_vec());
        if i == 0 {
            assert!(r.options.is_none());
        } else {
            let o = r.options.as_ref().unwrap();
            assert_eq!(o.nonce, Some(0));
            assert_eq!(o.gas_limit.as_deref(), Some("0"));
            let f = o.fees.as_ref().unwrap();
            assert_eq!(f.max_fee_per_gas, n.to_string());
            assert_eq!(f.max_priority_fee_per_gas, "0");
        }
    }
    use generated::prepare_transaction_request::Transaction as W;
    let expected = vec![
        W::ConfidentialTransfer(ConfidentialTransfer {
            token: a.to_vec(),
            to: b.to_vec(),
            amount: n.to_string(),
        }),
        W::ConfidentialTransferFrom(ConfidentialTransferFrom {
            token: a.to_vec(),
            owner: b.to_vec(),
            to: c.to_vec(),
            amount: n.to_string(),
        }),
        W::SetOperator(SetOperator {
            token: a.to_vec(),
            operator: b.to_vec(),
            until: Some(1),
        }),
        W::Unwrap(Unwrap {
            token: a.to_vec(),
            to: b.to_vec(),
            amount: n.to_string(),
        }),
        W::UnwrapAll(UnwrapAll {
            token: a.to_vec(),
            to: b.to_vec(),
        }),
        W::FinalizeUnwrap(FinalizeUnwrap {
            wrapper: a.to_vec(),
            unwrap_request_id_or_amount: vec![255; 32],
        }),
        W::ApproveUnderlying(ApproveUnderlying {
            underlying: a.to_vec(),
            spender: b.to_vec(),
            amount: n.to_string(),
        }),
        W::Wrap(Wrap {
            wrapper: a.to_vec(),
            to: b.to_vec(),
            amount: n.to_string(),
        }),
        W::TransferAndCall(TransferAndCall {
            underlying: a.to_vec(),
            wrapper: b.to_vec(),
            amount: n.to_string(),
            recipient_data: None,
        }),
        W::DelegateDecryption(DelegateDecryption {
            contract_address: a.to_vec(),
            delegate_address: b.to_vec(),
            expiration_date_ms: None,
        }),
        W::RevokeDelegation(RevokeDelegation {
            contract_address: a.to_vec(),
            delegate_address: b.to_vec(),
        }),
        W::TransferAndCall(TransferAndCall {
            underlying: a.to_vec(),
            wrapper: b.to_vec(),
            amount: "-1".into(),
            recipient_data: Some(vec![]),
        }),
        W::DelegateDecryption(DelegateDecryption {
            contract_address: a.to_vec(),
            delegate_address: b.to_vec(),
            expiration_date_ms: Some(0),
        }),
    ];
    assert_eq!(
        requests
            .iter()
            .map(|r| r.transaction.as_ref().unwrap())
            .collect::<Vec<_>>(),
        expected.iter().collect::<Vec<_>>()
    );
}

#[tokio::test]
async fn preserves_sdk_validation_errors_and_empty_options() {
    let server = Server::start(Arc::new(|path, bytes| {
        if path.ends_with("/PrepareTransaction") {
            let request = PrepareTransactionRequest::decode(bytes).unwrap();
            assert_eq!(request.options, Some(generated::PrepareOptions::default()));
            assert!(matches!(request.transaction, Some(generated::prepare_transaction_request::Transaction::TransferAndCall(TransferAndCall { recipient_data: Some(ref bytes), .. })) if bytes == &[1,2,3]));
            Response::builder()
                .header("content-type", "application/grpc")
                .header("grpc-status", "3")
                .header("grpc-message", "SDK rejects recipient bytes")
                .header("zama-error-code", "CONFIGURATION_ERROR")
                .header("zama-error-retryable", "false")
                .body(Full::new(Bytes::new()).boxed()).unwrap()
        } else { default_handler(path, bytes) }
    })).await;
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .sdk(SdkConfig::new(11155111, "http://localhost:8545"))
        .build()
        .await
        .unwrap();
    let error = sdk
        .offline()
        .prepare(
            PrepareTransaction {
                from: Address::repeat_byte(3),
                transaction: Transaction::TransferAndCall {
                    underlying: Address::repeat_byte(1),
                    wrapper: Address::repeat_byte(2),
                    amount: 1.into(),
                    recipient_data: Some(vec![1, 2, 3]),
                },
            },
            Some(PrepareOptions::default()),
        )
        .await
        .unwrap_err();
    let error = error.downcast_ref::<RpcError>().unwrap();
    assert_eq!(error.status.code(), tonic::Code::InvalidArgument);
    assert_eq!(error.sdk.as_ref().unwrap().code, "CONFIGURATION_ERROR");
    assert_eq!(
        error.sdk.as_ref().unwrap().message,
        "SDK rejects recipient bytes"
    );
    assert!(!error.sdk.as_ref().unwrap().retryable);
    sdk.close().await.unwrap();
}

#[tokio::test]
async fn rejects_unspecified_or_unknown_prepared_kind() {
    for (kind, expected) in [
        (
            generated::TransactionKind::Unspecified as i32,
            "unspecified prepared transaction kind",
        ),
        (99, "unknown prepared transaction kind"),
    ] {
        let server = Server::start(Arc::new(move |path, bytes| {
            if path.ends_with("/PrepareTransaction") {
                response(generated::PrepareTransactionResponse {
                    kind,
                    from: vec![9; 20],
                    unsigned_tx: vec![2],
                })
            } else {
                default_handler(path, bytes)
            }
        }))
        .await;
        let sdk = Client::connect(&server.socket)
            .await
            .unwrap()
            .sdk(SdkConfig::new(11155111, "http://localhost:8545"))
            .build()
            .await
            .unwrap();
        let error = sdk
            .offline()
            .prepare(
                PrepareTransaction {
                    from: Address::repeat_byte(1),
                    transaction: Transaction::RevokeDelegation {
                        contract_address: Address::repeat_byte(2),
                        delegate_address: Address::repeat_byte(3),
                    },
                },
                None,
            )
            .await
            .unwrap_err();
        assert_eq!(error.to_string(), expected);
        sdk.close().await.unwrap();
    }
}

#[tokio::test]
async fn preparation_honors_client_deadline() {
    let server = Server::start(Arc::new(|path, bytes| {
        if path.ends_with("/PrepareTransaction") {
            Response::builder()
                .header("content-type", "application/grpc")
                .body(
                    StreamBody::new(tokio_stream::pending::<Result<Frame<Bytes>, Infallible>>())
                        .boxed(),
                )
                .unwrap()
        } else {
            default_handler(path, bytes)
        }
    }))
    .await;
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .sdk(SdkConfig::new(11155111, "http://localhost:8545"))
        .build()
        .await
        .unwrap();
    let result = sdk
        .clone()
        .with_timeout(Duration::from_millis(50))
        .offline()
        .prepare(
            PrepareTransaction {
                from: Address::repeat_byte(1),
                transaction: Transaction::SetOperator {
                    token: Address::repeat_byte(2),
                    operator: Address::repeat_byte(3),
                    until: 1,
                },
            },
            None,
        )
        .await;
    assert!(result.is_err());
    assert!(server.timeouts.lock().unwrap().contains(&true));
    sdk.close().await.unwrap();
}

#[tokio::test]
async fn rejects_malformed_prepared_sender() {
    let server = Server::start(Arc::new(|path, bytes| {
        if path.ends_with("/PrepareTransaction") {
            response(generated::PrepareTransactionResponse {
                kind: generated::TransactionKind::SetOperator as i32,
                from: vec![1],
                unsigned_tx: vec![2],
            })
        } else {
            default_handler(path, bytes)
        }
    }))
    .await;
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .sdk(SdkConfig::new(11155111, "http://localhost:8545"))
        .build()
        .await
        .unwrap();
    let error = sdk
        .offline()
        .prepare(
            PrepareTransaction {
                from: Address::repeat_byte(1),
                transaction: Transaction::RevokeDelegation {
                    contract_address: Address::repeat_byte(2),
                    delegate_address: Address::repeat_byte(3),
                },
            },
            None,
        )
        .await
        .unwrap_err();
    assert!(
        error
            .to_string()
            .contains("invalid prepared sender address")
    );
    sdk.close().await.unwrap();
}
