use super::*;

#[tokio::test]
async fn signer_channel_replies_to_invalid_actions_and_keeps_processing() {
    let mut server = Server::start(Arc::new(default_handler)).await;
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .create_context(
            SdkConfig::new(11155111, "https://rpc.invalid"),
            SignerConfig::Enabled(None),
        )
        .await
        .unwrap();
    server
        .actions
        .send(SignerServerMessage {
            message: Some(signer_server_message::Message::Attached(Empty {})),
        })
        .unwrap();
    let connection = sdk
        .attach_signer(|request| async move { Ok(request.action_id.into_bytes()) })
        .await
        .unwrap();
    assert!(matches!(
        server.reply().await.message,
        Some(signer_client_message::Message::Attach(_))
    ));

    let malformed_json = sdk.operation();
    let missing_account = sdk.operation();
    let invalid_account = sdk.operation();
    let valid = sdk.operation();
    let cases = [
        (&malformed_json, "malformed-json"),
        (&missing_account, "missing-account"),
        (&invalid_account, "invalid-account"),
    ];
    server
        .actions
        .send(signer_action(
            &malformed_json.message.operation_id,
            "malformed-json",
            Some(generated::WalletAccount {
                address: vec![1; 20],
                chain_id: 1,
            }),
            "{]",
        ))
        .unwrap();
    server
        .actions
        .send(signer_action(
            &missing_account.message.operation_id,
            "missing-account",
            None,
            "{}",
        ))
        .unwrap();
    server
        .actions
        .send(signer_action(
            &invalid_account.message.operation_id,
            "invalid-account",
            Some(generated::WalletAccount {
                address: vec![1; 19],
                chain_id: 1,
            }),
            "{}",
        ))
        .unwrap();
    server
        .actions
        .send(action(&valid.message.operation_id, "valid"))
        .unwrap();

    let mut replies = HashMap::new();
    for _ in 0..4 {
        let Some(signer_client_message::Message::Reply(reply)) = server.reply().await.message
        else {
            panic!("missing signer reply")
        };
        replies.insert(reply.action_id.clone(), reply);
    }
    for (operation, action_id) in cases {
        let reply = &replies[action_id];
        assert_eq!(reply.operation_id, operation.message.operation_id);
        let Some(generated::signer_reply::Result::Error(error)) = &reply.result else {
            panic!("expected signing failure for {action_id}")
        };
        assert_eq!(error.code, "SIGNING_FAILED");
    }
    assert_eq!(
        replies["valid"].result,
        Some(generated::signer_reply::Result::Signature(
            b"valid".to_vec()
        ))
    );

    let after = sdk.operation();
    server
        .actions
        .send(action(&after.message.operation_id, "after-invalid"))
        .unwrap();
    let Some(signer_client_message::Message::Reply(reply)) = server.reply().await.message else {
        panic!("missing reply after invalid actions")
    };
    assert_eq!(reply.action_id, "after-invalid");
    assert_eq!(
        reply.result,
        Some(generated::signer_reply::Result::Signature(
            b"after-invalid".to_vec()
        ))
    );

    drop(connection);
    sdk.close().await.unwrap();
}

#[cfg(feature = "alloy")]
#[tokio::test]
async fn alloy_signer_preserves_structured_errors_on_the_channel() {
    let expected = [
        crate::SdkError::signing_rejected("User rejected the request."),
        crate::SdkError {
            code: "RPC_RATE_LIMITED".into(),
            message: "Retry later.".into(),
            retryable: true,
            retry_after_seconds: Some(9),
            revert_data: None,
        },
        crate::SdkError {
            code: "WALLET_ACCOUNT_NOT_READY".into(),
            message: "Wallet account is still loading.".into(),
            retryable: true,
            retry_after_seconds: None,
            revert_data: None,
        },
    ];
    let signer = FailingAlloySigner {
        errors: Mutex::new(
            expected
                .iter()
                .cloned()
                .map(alloy_signer::Error::other)
                .collect(),
        ),
    };
    let mut server = Server::start(Arc::new(default_handler)).await;
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .create_context(
            SdkConfig::new(11155111, "https://rpc.invalid"),
            SignerConfig::Enabled(None),
        )
        .await
        .unwrap();
    server
        .actions
        .send(SignerServerMessage {
            message: Some(signer_server_message::Message::Attached(Empty {})),
        })
        .unwrap();
    let connection = crate::signer::attach_signer(
        sdk.client.inner.clone(),
        &sdk.context_id,
        sdk.operations.clone(),
        Arc::new(crate::alloy::AlloySigner::new(signer)),
    )
    .await
    .unwrap();
    assert!(matches!(
        server.reply().await.message,
        Some(signer_client_message::Message::Attach(_))
    ));

    let mut operations = Vec::new();
    for (index, expected) in expected.into_iter().enumerate() {
        let operation = sdk.operation();
        let action_id = format!("structured-{index}");
        let mut message = action(&operation.message.operation_id, &action_id);
        let Some(signer_server_message::Message::Action(payload)) = message.message.as_mut() else {
            unreachable!()
        };
        payload.request = Some(generated::signer_action::Request::TypedDataJson(
            serde_json::json!({
                "types": { "EIP712Domain": [] },
                "primaryType": "EIP712Domain",
                "domain": {},
                "message": {}
            })
            .to_string(),
        ));
        server.actions.send(message).unwrap();

        let Some(signer_client_message::Message::Reply(reply)) = server.reply().await.message
        else {
            panic!("missing structured signer error")
        };
        assert_eq!(reply.operation_id, operation.message.operation_id);
        assert_eq!(reply.action_id, action_id);
        assert_eq!(
            reply.result,
            Some(generated::signer_reply::Result::Error(expected.into()))
        );
        operations.push(operation);
    }

    drop(connection);
    sdk.close().await.unwrap();
}

#[tokio::test]
async fn signer_channel_routes_concurrent_callbacks_rejection_and_cancellation() {
    let mut server = Server::start(Arc::new(default_handler)).await;
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .create_context(
            SdkConfig::new(11155111, "https://rpc.invalid"),
            SignerConfig::Enabled(None),
        )
        .await
        .unwrap();
    server
        .actions
        .send(SignerServerMessage {
            message: Some(signer_server_message::Message::Attached(Empty {})),
        })
        .unwrap();
    let (started, mut starts) = mpsc::unbounded_channel();
    let (dropped, mut drops) = mpsc::unbounded_channel();
    struct OnDrop(mpsc::UnboundedSender<()>);
    impl Drop for OnDrop {
        fn drop(&mut self) {
            let _ = self.0.send(());
        }
    }
    let connection = sdk
        .attach_signer(move |request| {
            let started = started.clone();
            let dropped = dropped.clone();
            async move {
                assert_eq!(request.account.address, Address::repeat_byte(1));
                started.send(request.action_id.clone()).unwrap();
                match request.action_id.as_str() {
                    "slow" => {
                        tokio::time::sleep(Duration::from_millis(80)).await;
                        Ok(vec![1])
                    }
                    "reject" => Err(crate::SdkError {
                        code: "SIGNING_FAILED".into(),
                        message: "rejected".into(),
                        retryable: false,
                        retry_after_seconds: None,
                        revert_data: None,
                    }),
                    "cancel" => {
                        let _drop = OnDrop(dropped);
                        std::future::pending::<()>().await;
                        unreachable!()
                    }
                    _ => Ok(vec![2]),
                }
            }
        })
        .await
        .unwrap();
    assert!(matches!(
        server.reply().await.message,
        Some(signer_client_message::Message::Attach(_))
    ));
    let a = sdk.operation();
    let b = sdk.operation();
    let c = sdk.operation();
    let d = sdk.operation();
    server
        .actions
        .send(action(&a.message.operation_id, "slow"))
        .unwrap();
    server
        .actions
        .send(action(&b.message.operation_id, "fast"))
        .unwrap();
    for (operation, signature) in [
        (b.message.operation_id.as_str(), vec![2]),
        (a.message.operation_id.as_str(), vec![1]),
    ] {
        let Some(signer_client_message::Message::Reply(reply)) = server.reply().await.message
        else {
            panic!("missing reply")
        };
        assert_eq!(reply.operation_id, operation);
        assert_eq!(
            reply.result,
            Some(generated::signer_reply::Result::Signature(signature))
        );
    }
    server
        .actions
        .send(action(&b.message.operation_id, "fast"))
        .unwrap();
    assert!(
        tokio::time::timeout(Duration::from_millis(100), server.replies.recv())
            .await
            .is_err()
    );
    server
        .actions
        .send(action(&c.message.operation_id, "reject"))
        .unwrap();
    let Some(signer_client_message::Message::Reply(reply)) = server.reply().await.message else {
        panic!("missing rejection")
    };
    let Some(generated::signer_reply::Result::Error(error)) = reply.result else {
        panic!("expected signer error");
    };
    assert_eq!(error.code, "SIGNING_FAILED");
    server
        .actions
        .send(action(&d.message.operation_id, "cancel"))
        .unwrap();
    while starts.recv().await.unwrap() != "cancel" {}
    server
        .actions
        .send(SignerServerMessage {
            message: Some(signer_server_message::Message::Cancelled(
                SignerActionCancelled {
                    operation_id: d.message.operation_id.clone(),
                    action_id: "cancel".into(),
                },
            )),
        })
        .unwrap();
    tokio::time::timeout(Duration::from_secs(1), drops.recv())
        .await
        .unwrap()
        .unwrap();
    assert!(
        tokio::time::timeout(Duration::from_millis(100), server.replies.recv())
            .await
            .is_err()
    );
    server
        .actions
        .send(SignerServerMessage {
            message: Some(signer_server_message::Message::ReplyError(
                SignerReplyError {
                    operation_id: d.message.operation_id.clone(),
                    action_id: "cancel".into(),
                    error: Some(generated::SdkError {
                        code: "SIGNER_ACTION_NOT_FOUND".into(),
                        message: "stale".into(),
                        retryable: false,
                        retry_after_seconds: None,
                    }),
                },
            )),
        })
        .unwrap();
    server
        .actions
        .send(action(&d.message.operation_id, "after-stale"))
        .unwrap();
    let Some(signer_client_message::Message::Reply(reply)) = server.reply().await.message else {
        panic!("missing reply after stale response")
    };
    assert_eq!(reply.action_id, "after-stale");

    let local = sdk.operation();
    server
        .actions
        .send(action(&local.message.operation_id, "cancel"))
        .unwrap();
    while starts.recv().await.unwrap() != "cancel" {}
    drop(local);
    tokio::time::timeout(Duration::from_secs(1), drops.recv())
        .await
        .unwrap()
        .unwrap();

    let closing_operation = sdk.operation();
    server
        .actions
        .send(action(&closing_operation.message.operation_id, "cancel"))
        .unwrap();
    while starts.recv().await.unwrap() != "cancel" {}
    let closing = tokio::spawn(connection.closed());
    tokio::task::yield_now().await;
    closing.abort();
    let _ = closing.await;
    tokio::time::timeout(Duration::from_secs(1), drops.recv())
        .await
        .unwrap()
        .unwrap();
    sdk.close().await.unwrap();
}
