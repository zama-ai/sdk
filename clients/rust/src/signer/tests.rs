use super::*;
use crate::{Address, U256};
use generated::{
    signer_action::Request, signer_client_message::Message, signer_reply::Result as Reply,
    signer_server_message,
};

fn write_action(operation: &str, id: &str) -> generated::SignerAction {
    generated::SignerAction {
        operation_id: operation.into(),
        action_id: id.into(),
        account: Some(
            WalletAccount {
                address: Address::repeat_byte(1),
                chain_id: 1,
            }
            .into(),
        ),
        request: Some(Request::ContractWrite(generated::ContractWriteRequest {
            address: vec![2; 20],
            data: vec![1, 2, 3, 4],
            abi_json: "[]".into(),
            function_name: "transfer".into(),
            args_json: "[\"9007199254740993\"]".into(),
            value: Some("0".into()),
            gas: None,
        })),
    }
}
fn write_payload(action: &mut generated::SignerAction) -> &mut generated::ContractWriteRequest {
    match action.request.as_mut() {
        Some(Request::ContractWrite(write)) => write,
        _ => panic!("not a contract write"),
    }
}
fn reply(frame: generated::SignerClientMessage) -> generated::SignerReply {
    match frame.message {
        Some(Message::Reply(reply)) => reply,
        _ => panic!("not a signer reply"),
    }
}

#[test]
fn write_payload_preserves_presence_and_reports_malformed_payloads() {
    let action = write_action("operation", "write");
    let CallbackRequest::ContractWrite(request) = CallbackRequest::decode(action.clone()).unwrap()
    else {
        panic!()
    };
    assert_eq!(request.value, Some(U256::ZERO));
    assert_eq!(request.gas, None);
    assert_eq!(request.args[0], "9007199254740993");
    let mut malformed = action.clone();
    write_payload(&mut malformed).gas = Some("01".into());
    assert_eq!(
        CallbackRequest::decode(malformed).unwrap_err().code,
        "SIGNING_FAILED"
    );
    let mut missing = action;
    missing.request = None;
    assert_eq!(
        CallbackRequest::decode(missing).unwrap_err().code,
        "SIGNING_FAILED"
    );
}

struct TestWallet<F>(F);
#[async_trait::async_trait]
impl<F, Fut> Signer for TestWallet<F>
where
    F: Fn(ContractWriteRequest, CancellationToken) -> Fut + Send + Sync,
    Fut: Future<Output = Result<B256, SdkError>> + Send,
{
    async fn sign_typed_data(&self, _request: SigningRequest) -> Result<Vec<u8>, SdkError> {
        Ok(vec![7])
    }
    async fn write_contract(
        &self,
        request: ContractWriteRequest,
        cancel: CancellationToken,
    ) -> Result<B256, SdkError> {
        (self.0)(request, cancel).await
    }
}

#[tokio::test]
async fn writes_correlate_reject_cancel_and_never_replay() {
    let operations = Arc::new(crate::operations::Operations::new());
    let operation = operations.start("context");
    let id = &operation.message.operation_id;
    let (sender, mut replies) = mpsc::channel(16);
    let (started, mut starts) = mpsc::unbounded_channel();
    let release = Arc::new(tokio::sync::Notify::new());
    let release_write = release.clone();
    let signer = TestWallet(
        move |request: ContractWriteRequest, cancel: CancellationToken| {
            let started = started.clone();
            let release = release_write.clone();
            async move {
                started.send(request.action_id.clone()).unwrap();
                match request.action_id.as_str() {
                    "slow" => release.notified().await,
                    "cancel" => {
                        cancel.cancelled().await;
                        return Err(SdkError::signing_failed("cancelled before signing"));
                    }
                    "reject" => return Err(SdkError::signing_rejected("declined")),
                    _ => (),
                }
                Ok(B256::repeat_byte(3))
            }
        },
    );
    let mut callbacks = Callbacks::new(Arc::new(signer), sender, operations);
    callbacks.start(write_action(id, "slow")).unwrap();
    assert_eq!(starts.recv().await.unwrap(), "slow");
    callbacks.start(write_action(id, "fast")).unwrap();
    assert_eq!(starts.recv().await.unwrap(), "fast");
    // Typed-data and write actions share the channel and settle independently.
    callbacks
        .start(generated::SignerAction {
            request: Some(Request::TypedDataJson("{}".into())),
            ..write_action(id, "typed")
        })
        .unwrap();
    let mut settled = HashMap::new();
    for _ in 0..2 {
        let reply = reply(replies.recv().await.unwrap());
        assert_eq!(reply.operation_id, *id);
        settled.insert(reply.action_id, reply.result);
    }
    assert_eq!(
        settled.remove("fast").unwrap(),
        Some(Reply::TransactionHash(vec![3; 32]))
    );
    assert_eq!(
        settled.remove("typed").unwrap(),
        Some(Reply::Signature(vec![7]))
    );
    release.notify_one();
    assert_eq!(reply(replies.recv().await.unwrap()).action_id, "slow");
    callbacks.start(write_action(id, "fast")).unwrap();
    assert!(starts.try_recv().is_err());
    callbacks.start(write_action(id, "reject")).unwrap();
    let Some(Reply::Error(rejected)) = reply(replies.recv().await.unwrap()).result else {
        panic!()
    };
    assert_eq!(rejected.code, "SIGNING_REJECTED");
    assert_eq!(starts.recv().await.unwrap(), "reject");
    // A malformed write fails only its own action; the wallet never sees it.
    let mut malformed = write_action(id, "malformed");
    write_payload(&mut malformed).address = vec![2; 19];
    callbacks.start(malformed).unwrap();
    let malformed = reply(replies.recv().await.unwrap());
    assert_eq!(malformed.action_id, "malformed");
    let Some(Reply::Error(error)) = malformed.result else {
        panic!()
    };
    assert_eq!(error.code, "SIGNING_FAILED");
    assert!(starts.try_recv().is_err());
    callbacks.start(write_action(id, "cancel")).unwrap();
    assert_eq!(starts.recv().await.unwrap(), "cancel");
    callbacks
        .handle_frame(generated::SignerServerMessage {
            message: Some(signer_server_message::Message::Cancelled(
                generated::SignerActionCancelled {
                    operation_id: id.clone(),
                    action_id: "cancel".into(),
                },
            )),
        })
        .unwrap();
    callbacks.start(write_action(id, "cancel")).unwrap();
    while let Some(result) = callbacks.tasks.join_next().await {
        callbacks.settle(result).unwrap();
    }
    assert!(starts.try_recv().is_err());
    assert!(replies.try_recv().is_err());
    drop(operation);
    callbacks.sweep_cancelled();
    assert!(callbacks.pending.is_empty());
}

#[tokio::test]
async fn a_pre_broadcast_revert_replies_with_execution_revert_and_a_plain_error_stays_an_error() {
    let operations = Arc::new(crate::operations::Operations::new());
    let operation = operations.start("context");
    let id = &operation.message.operation_id;
    let (sender, mut replies) = mpsc::channel(16);
    let signer = TestWallet(
        move |request: ContractWriteRequest, _cancel: CancellationToken| async move {
            match request.action_id.as_str() {
                "revert" => Err(SdkError::execution_reverted(
                    "Cannot prepare the transaction: execution reverted",
                    vec![0xab, 0xcd],
                )),
                _ => Err(SdkError::signing_failed("gas estimation unavailable")),
            }
        },
    );
    let mut callbacks = Callbacks::new(Arc::new(signer), sender, operations);
    callbacks.start(write_action(id, "revert")).unwrap();
    let revert = reply(replies.recv().await.unwrap());
    let Some(Reply::ExecutionRevert(revert)) = revert.result else {
        panic!()
    };
    assert_eq!(revert.data, vec![0xab, 0xcd]);
    assert_eq!(
        revert.message,
        "Cannot prepare the transaction: execution reverted"
    );

    callbacks.start(write_action(id, "plain")).unwrap();
    let plain = reply(replies.recv().await.unwrap());
    let Some(Reply::Error(error)) = plain.result else {
        panic!()
    };
    assert_eq!(error.code, "SIGNING_FAILED");
}

struct RevertingTypedDataWallet;
#[async_trait::async_trait]
impl Signer for RevertingTypedDataWallet {
    async fn sign_typed_data(&self, _request: SigningRequest) -> Result<Vec<u8>, SdkError> {
        Err(SdkError::execution_reverted(
            "Cannot prepare the transaction: execution reverted",
            vec![0xab, 0xcd],
        ))
    }
    async fn write_contract(
        &self,
        _request: ContractWriteRequest,
        _cancel: CancellationToken,
    ) -> Result<B256, SdkError> {
        panic!("not exercised by this test")
    }
}
#[tokio::test]
async fn a_typed_data_error_with_revert_data_stays_an_error_reply() {
    let operations = Arc::new(crate::operations::Operations::new());
    let operation = operations.start("context");
    let id = &operation.message.operation_id;
    let (sender, mut replies) = mpsc::channel(16);
    let mut callbacks = Callbacks::new(Arc::new(RevertingTypedDataWallet), sender, operations);
    callbacks
        .start(generated::SignerAction {
            request: Some(Request::TypedDataJson("{}".into())),
            ..write_action(id, "typed")
        })
        .unwrap();
    let reply = reply(replies.recv().await.unwrap());
    let Some(Reply::Error(error)) = reply.result else {
        panic!("typed-data revert must stay an error reply, not execution_revert")
    };
    assert_eq!(error.code, "TRANSACTION_REVERTED");
}

#[tokio::test]
async fn channel_teardown_never_kills_an_in_flight_broadcast() {
    let operations = Arc::new(crate::operations::Operations::new());
    let operation = operations.start("context");
    let id = &operation.message.operation_id;
    let (sender, replies) = mpsc::channel(16);
    let (started, mut starts) = mpsc::unbounded_channel();
    let (submitted, mut submissions) = mpsc::unbounded_channel();
    let release = Arc::new(tokio::sync::Notify::new());
    let release_write = release.clone();
    let signer = TestWallet(
        move |_request: ContractWriteRequest, _cancel: CancellationToken| {
            let started = started.clone();
            let submitted = submitted.clone();
            let release = release_write.clone();
            async move {
                started.send(()).unwrap();
                // Stands in for a broadcast the node has already accepted.
                release.notified().await;
                submitted.send(B256::repeat_byte(3)).unwrap();
                Ok(B256::repeat_byte(3))
            }
        },
    );
    let mut callbacks = Callbacks::new(Arc::new(signer), sender, operations);
    callbacks.start(write_action(id, "write")).unwrap();
    starts.recv().await.unwrap();
    // The channel loop and its reply sink go away while the write is held in the broadcast.
    drop(callbacks);
    drop(replies);
    release.notify_one();
    assert_eq!(submissions.recv().await.unwrap(), B256::repeat_byte(3));
}

#[tokio::test]
async fn channel_teardown_cancels_a_write_that_has_not_broadcast() {
    let operations = Arc::new(crate::operations::Operations::new());
    let operation = operations.start("context");
    let id = &operation.message.operation_id;
    let (sender, _replies) = mpsc::channel(16);
    let (started, mut starts) = mpsc::unbounded_channel();
    let (stopped, mut stops) = mpsc::unbounded_channel();
    let signer = TestWallet(
        move |_request: ContractWriteRequest, cancel: CancellationToken| {
            let started = started.clone();
            let stopped = stopped.clone();
            async move {
                started.send(()).unwrap();
                cancel.cancelled().await;
                stopped.send(()).unwrap();
                Err(SdkError::signing_failed("cancelled before broadcast"))
            }
        },
    );
    let mut callbacks = Callbacks::new(Arc::new(signer), sender, operations);
    callbacks.start(write_action(id, "write")).unwrap();
    starts.recv().await.unwrap();
    drop(callbacks);
    drop(operation);
    tokio::time::timeout(std::time::Duration::from_secs(2), stops.recv())
        .await
        .unwrap()
        .unwrap();
}

#[tokio::test]
async fn a_cancelled_write_that_panics_sends_no_reply() {
    let operations = Arc::new(crate::operations::Operations::new());
    let operation = operations.start("context");
    let id = &operation.message.operation_id;
    let (sender, mut replies) = mpsc::channel(16);
    let (started, mut starts) = mpsc::unbounded_channel();
    let signer = TestWallet(
        move |_request: ContractWriteRequest, cancel: CancellationToken| {
            let started = started.clone();
            async move {
                started.send(()).unwrap();
                cancel.cancelled().await;
                panic!("secret wallet state");
            }
        },
    );
    let mut callbacks = Callbacks::new(Arc::new(signer), sender, operations);
    callbacks.start(write_action(id, "panic")).unwrap();
    starts.recv().await.unwrap();
    callbacks
        .handle_frame(generated::SignerServerMessage {
            message: Some(signer_server_message::Message::Cancelled(
                generated::SignerActionCancelled {
                    operation_id: id.clone(),
                    action_id: "panic".into(),
                },
            )),
        })
        .unwrap();
    // The channel closes only once the write task has finished without replying.
    drop(callbacks);
    let closed = tokio::time::timeout(std::time::Duration::from_secs(2), replies.recv())
        .await
        .unwrap();
    assert!(closed.is_none());
}

#[tokio::test]
async fn a_panicking_write_fails_only_its_action_with_an_unknown_outcome() {
    let operations = Arc::new(crate::operations::Operations::new());
    let operation = operations.start("context");
    let id = &operation.message.operation_id;
    let (sender, mut replies) = mpsc::channel(16);
    let signer = TestWallet(
        move |request: ContractWriteRequest, _cancel: CancellationToken| async move {
            if request.action_id == "panic" {
                panic!("secret wallet state");
            }
            Ok(B256::repeat_byte(3))
        },
    );
    let mut callbacks = Callbacks::new(Arc::new(signer), sender, operations);
    callbacks.start(write_action(id, "panic")).unwrap();
    let panicked = reply(
        tokio::time::timeout(std::time::Duration::from_secs(2), replies.recv())
            .await
            .unwrap()
            .unwrap(),
    );
    assert_eq!(panicked.action_id, "panic");
    let Some(Reply::Error(error)) = panicked.result else {
        panic!()
    };
    assert_eq!(error.code, "TRANSACTION_OUTCOME_UNKNOWN");
    assert!(!error.retryable);
    assert_eq!(
        error.message,
        "wallet adapter panicked during contract write"
    );
    callbacks.start(write_action(id, "next")).unwrap();
    let next = reply(replies.recv().await.unwrap());
    assert_eq!(next.action_id, "next");
    assert_eq!(next.result, Some(Reply::TransactionHash(vec![3; 32])));
}

struct PanickingTypedDataWallet;
#[async_trait::async_trait]
impl Signer for PanickingTypedDataWallet {
    async fn sign_typed_data(&self, request: SigningRequest) -> Result<Vec<u8>, SdkError> {
        if request.action_id == "panic" {
            panic!("secret wallet state");
        }
        Ok(vec![7])
    }
}
#[tokio::test]
async fn a_panicking_signature_fails_only_its_action() {
    let operations = Arc::new(crate::operations::Operations::new());
    let operation = operations.start("context");
    let id = &operation.message.operation_id;
    let (sender, mut replies) = mpsc::channel(16);
    let mut callbacks = Callbacks::new(Arc::new(PanickingTypedDataWallet), sender, operations);
    let typed = |action: &str| generated::SignerAction {
        request: Some(Request::TypedDataJson("{}".into())),
        ..write_action(id, action)
    };
    callbacks.start(typed("panic")).unwrap();
    while let Some(result) = callbacks.tasks.join_next().await {
        callbacks.settle(result).unwrap();
    }
    let panicked = reply(replies.recv().await.unwrap());
    assert_eq!(panicked.action_id, "panic");
    let Some(Reply::Error(error)) = panicked.result else {
        panic!()
    };
    assert_eq!(error.code, "SIGNING_FAILED");
    assert_eq!(error.message, "wallet adapter panicked during signing");
    // The action stays a replay guard.
    callbacks.start(typed("panic")).unwrap();
    assert!(callbacks.tasks.is_empty());
    callbacks.start(typed("next")).unwrap();
    while let Some(result) = callbacks.tasks.join_next().await {
        callbacks.settle(result).unwrap();
    }
    let next = reply(replies.recv().await.unwrap());
    assert_eq!(next.action_id, "next");
    assert_eq!(next.result, Some(Reply::Signature(vec![7])));
}

fn connection_lost() -> crate::Result<()> {
    Err(ClientError::from(tonic::Status::unavailable(
        "connection lost",
    )))
}
fn daemon_error(code: &str) -> crate::Result<()> {
    let mut status = tonic::Status::failed_precondition("failure");
    status
        .metadata_mut()
        .insert("zama-error-code", code.parse().unwrap());
    Err(ClientError::from(status))
}

#[tokio::test]
async fn a_failure_without_a_daemon_verdict_is_outcome_unknown_only_after_a_live_write() {
    let operations = Arc::new(crate::operations::Operations::new());
    let operation = operations.start("context");
    let id = &operation.message.operation_id;
    let (sender, mut replies) = mpsc::channel(16);
    let (started, mut starts) = mpsc::unbounded_channel();
    let signer = TestWallet(
        move |request: ContractWriteRequest, cancel: CancellationToken| {
            let started = started.clone();
            async move {
                match request.action_id.as_str() {
                    "revert" => Err(SdkError::execution_reverted("reverted", vec![1])),
                    "fail" => Err(SdkError::signing_failed("node unreachable")),
                    _ => {
                        started.send(()).unwrap();
                        cancel.cancelled().await;
                        Err(SdkError::signing_failed("cancelled"))
                    }
                }
            }
        },
    );
    let mut callbacks = Callbacks::new(Arc::new(signer), sender, operations.clone());
    assert!(
        !operation
            .settle(connection_lost())
            .unwrap_err()
            .is_outcome_unknown()
    );
    callbacks
        .start(generated::SignerAction {
            request: Some(Request::TypedDataJson("{}".into())),
            ..write_action(id, "typed")
        })
        .unwrap();
    reply(replies.recv().await.unwrap());
    assert!(
        !operation
            .settle(connection_lost())
            .unwrap_err()
            .is_outcome_unknown()
    );

    callbacks.start(write_action(id, "revert")).unwrap();
    reply(replies.recv().await.unwrap());
    assert!(
        !operation
            .settle(connection_lost())
            .unwrap_err()
            .is_outcome_unknown()
    );

    let hung = operations.start("context");
    callbacks
        .start(write_action(&hung.message.operation_id, "hang"))
        .unwrap();
    starts.recv().await.unwrap();
    let error = hung.settle(connection_lost()).unwrap_err();
    assert!(error.is_outcome_unknown());
    assert_eq!(error.kind(), ErrorKind::Transport);
    assert!(
        std::error::Error::source(&error)
            .unwrap()
            .downcast_ref::<tonic::Status>()
            .is_some()
    );
    assert!(
        !operation
            .settle(connection_lost())
            .unwrap_err()
            .is_outcome_unknown()
    );

    // A write error other than a revert may have been raised after the broadcast.
    callbacks.start(write_action(id, "fail")).unwrap();
    reply(replies.recv().await.unwrap());
    assert!(
        operation
            .settle(connection_lost())
            .unwrap_err()
            .is_outcome_unknown()
    );
    let timeout = Err(ClientError::timeout("daemon request timed out"));
    assert!(
        operation
            .settle::<()>(timeout)
            .unwrap_err()
            .is_outcome_unknown()
    );

    // The daemon's verdict wins either way.
    let settled = operation
        .settle(daemon_error("RELAYER_FAILED"))
        .unwrap_err();
    assert!(!settled.is_outcome_unknown());
    let fresh = operations.start("context");
    let lost = fresh
        .settle(daemon_error("TRANSACTION_OUTCOME_UNKNOWN"))
        .unwrap_err();
    assert!(lost.is_outcome_unknown());
}
