use super::*;
use crate::{PrepareFees, PrepareOptions, PrepareTransaction, Transaction, TransactionKind};

fn capturing_server(captured: Arc<Mutex<Vec<PrepareTransactionRequest>>>) -> Handler {
    Arc::new(move |path, bytes| {
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
    })
}

#[tokio::test]
async fn prepares_every_kind_with_exact_wire_fields() {
    let captured = Arc::new(Mutex::new(Vec::new()));
    let server = Server::start(capturing_server(captured.clone())).await;
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .sdk(SdkConfig::new(11155111, "http://localhost:8545"))
        .build()
        .await
        .unwrap();
    let token = Address::repeat_byte(1);
    let peer = Address::repeat_byte(2);
    let sender = Address::repeat_byte(3);
    let amount: BigInt = "340282366920938463463374607431768211457".parse().unwrap();
    use generated::prepare_transaction_request::Transaction as Wire;
    let table = vec![
        (
            Transaction::ConfidentialTransfer {
                token,
                to: peer,
                amount: amount.clone(),
            },
            Wire::ConfidentialTransfer(ConfidentialTransfer {
                token: token.to_vec(),
                to: peer.to_vec(),
                amount: amount.to_string(),
            }),
        ),
        (
            Transaction::ConfidentialTransferFrom {
                token,
                owner: peer,
                to: sender,
                amount: amount.clone(),
            },
            Wire::ConfidentialTransferFrom(ConfidentialTransferFrom {
                token: token.to_vec(),
                owner: peer.to_vec(),
                to: sender.to_vec(),
                amount: amount.to_string(),
            }),
        ),
        (
            Transaction::SetOperator {
                token,
                operator: peer,
                until: 1,
            },
            Wire::SetOperator(SetOperator {
                token: token.to_vec(),
                operator: peer.to_vec(),
                until: Some(1),
            }),
        ),
        (
            Transaction::Unwrap {
                token,
                to: peer,
                amount: amount.clone(),
            },
            Wire::Unwrap(Unwrap {
                token: token.to_vec(),
                to: peer.to_vec(),
                amount: amount.to_string(),
            }),
        ),
        (
            Transaction::UnwrapAll { token, to: peer },
            Wire::UnwrapAll(UnwrapAll {
                token: token.to_vec(),
                to: peer.to_vec(),
            }),
        ),
        (
            Transaction::FinalizeUnwrap {
                wrapper: token,
                unwrap_request_id_or_amount: vec![255; 32],
            },
            Wire::FinalizeUnwrap(FinalizeUnwrap {
                wrapper: token.to_vec(),
                unwrap_request_id_or_amount: vec![255; 32],
            }),
        ),
        (
            Transaction::ApproveUnderlying {
                underlying: token,
                spender: peer,
                amount: amount.clone(),
            },
            Wire::ApproveUnderlying(ApproveUnderlying {
                underlying: token.to_vec(),
                spender: peer.to_vec(),
                amount: amount.to_string(),
            }),
        ),
        (
            Transaction::Wrap {
                wrapper: token,
                to: peer,
                amount: amount.clone(),
            },
            Wire::Wrap(Wrap {
                wrapper: token.to_vec(),
                to: peer.to_vec(),
                amount: amount.to_string(),
            }),
        ),
        (
            Transaction::TransferAndCall {
                underlying: token,
                wrapper: peer,
                amount: amount.clone(),
                recipient_data: None,
            },
            Wire::TransferAndCall(TransferAndCall {
                underlying: token.to_vec(),
                wrapper: peer.to_vec(),
                amount: amount.to_string(),
                recipient_data: None,
            }),
        ),
        (
            Transaction::DelegateDecryption {
                contract_address: token,
                delegate_address: peer,
                expiration_date_ms: None,
            },
            Wire::DelegateDecryption(DelegateDecryption {
                contract_address: token.to_vec(),
                delegate_address: peer.to_vec(),
                expiration_date_ms: None,
            }),
        ),
        (
            Transaction::RevokeDelegation {
                contract_address: token,
                delegate_address: peer,
            },
            Wire::RevokeDelegation(RevokeDelegation {
                contract_address: token.to_vec(),
                delegate_address: peer.to_vec(),
            }),
        ),
        (
            Transaction::TransferAndCall {
                underlying: token,
                wrapper: peer,
                amount: (-1).into(),
                recipient_data: Some(vec![]),
            },
            Wire::TransferAndCall(TransferAndCall {
                underlying: token.to_vec(),
                wrapper: peer.to_vec(),
                amount: "-1".into(),
                recipient_data: Some(vec![]),
            }),
        ),
        (
            Transaction::DelegateDecryption {
                contract_address: token,
                delegate_address: peer,
                expiration_date_ms: Some(0),
            },
            Wire::DelegateDecryption(DelegateDecryption {
                contract_address: token.to_vec(),
                delegate_address: peer.to_vec(),
                expiration_date_ms: Some(0),
            }),
        ),
    ];
    let mut operation_ids = std::collections::HashSet::new();
    for (transaction, expected) in table {
        let prepared = sdk
            .offline()
            .prepare(
                PrepareTransaction {
                    from: sender,
                    transaction,
                },
                None,
            )
            .await
            .unwrap();
        assert_eq!(prepared.kind, TransactionKind::SetOperator);
        assert_eq!(prepared.from, Address::repeat_byte(9));
        assert_eq!(prepared.unsigned_tx, vec![2, 0, 255, 128]);
        let request = captured.lock().unwrap().last().cloned().unwrap();
        let operation = request.operation.as_ref().unwrap();
        assert_eq!(operation.context_id, "context");
        assert!(!operation.operation_id.is_empty());
        assert!(operation_ids.insert(operation.operation_id.clone()));
        assert_eq!(request.from, sender.to_vec());
        assert_eq!(request.transaction, Some(expected));
    }
    sdk.close().await.unwrap();
}

#[tokio::test]
async fn sends_prepare_options_only_when_provided() {
    let captured = Arc::new(Mutex::new(Vec::new()));
    let server = Server::start(capturing_server(captured.clone())).await;
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .sdk(SdkConfig::new(11155111, "http://localhost:8545"))
        .build()
        .await
        .unwrap();
    let amount: BigInt = "340282366920938463463374607431768211457".parse().unwrap();
    let options = PrepareOptions {
        nonce: Some(0),
        gas_limit: Some(0.into()),
        fees: Some(PrepareFees {
            max_fee_per_gas: amount.clone(),
            max_priority_fee_per_gas: 0.into(),
        }),
    };
    for options in [Some(options), None] {
        sdk.offline()
            .prepare(
                PrepareTransaction {
                    from: Address::repeat_byte(3),
                    transaction: Transaction::UnwrapAll {
                        token: Address::repeat_byte(1),
                        to: Address::repeat_byte(2),
                    },
                },
                options,
            )
            .await
            .unwrap();
    }
    sdk.close().await.unwrap();
    let requests = captured.lock().unwrap();
    let sent = requests[0].options.as_ref().unwrap();
    assert_eq!(sent.nonce, Some(0));
    assert_eq!(sent.gas_limit.as_deref(), Some("0"));
    let fees = sent.fees.as_ref().unwrap();
    assert_eq!(fees.max_fee_per_gas, amount.to_string());
    assert_eq!(fees.max_priority_fee_per_gas, "0");
    assert!(requests[1].options.is_none());
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
