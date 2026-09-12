use super::*;
use std::sync::atomic::{AtomicUsize, Ordering};

#[tokio::test]
async fn concurrent_close_is_idempotent_and_drop_does_not_retry_success() {
    let calls = Arc::new(AtomicUsize::new(0));
    let observed = calls.clone();
    let server = Server::start(Arc::new(move |path, bytes| {
        if path.ends_with("/CloseContext") {
            assert_eq!(observed.fetch_add(1, Ordering::SeqCst), 0);
        }
        default_handler(path, bytes)
    }))
    .await;
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .sdk(SdkConfig::new(11155111, "https://rpc.invalid"))
        .build()
        .await
        .unwrap();
    let (first, second) = tokio::join!(sdk.close(), sdk.close());
    first.unwrap();
    second.unwrap();
    sdk.close().await.unwrap();
    drop(sdk);
    tokio::task::yield_now().await;
    assert_eq!(calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn cancelling_build_during_attachment_closes_remote_context() {
    let closed = Arc::new(tokio::sync::Semaphore::new(0));
    let observed = closed.clone();
    let mut server = Server::start(Arc::new(move |path, bytes| {
        if path.ends_with("/CloseContext") {
            observed.add_permits(1);
        }
        default_handler(path, bytes)
    }))
    .await;
    let builder = Client::connect(&server.socket)
        .await
        .unwrap()
        .sdk(SdkConfig::new(11155111, "https://rpc.invalid"))
        .storage(ApplicationStorage::new(MemoryStorage::default()));
    let build = tokio::spawn(builder.build());
    let attach = tokio::time::timeout(Duration::from_secs(2), server.storage_replies.recv())
        .await
        .unwrap()
        .unwrap();
    assert!(matches!(
        attach.message,
        Some(storage_client_message::Message::Attach(_))
    ));
    build.abort();
    assert!(matches!(build.await, Err(error) if error.is_cancelled()));
    tokio::time::timeout(Duration::from_secs(2), closed.acquire())
        .await
        .unwrap()
        .unwrap()
        .forget();
}

#[tokio::test]
async fn managed_channel_wait_ignores_stale_replies_and_preserves_other_errors() {
    let mut server = Server::start(Arc::new(default_handler)).await;
    server
        .storage_actions
        .send(StorageServerMessage {
            message: Some(storage_server_message::Message::Attached(Empty {})),
        })
        .unwrap();
    let sdk = Client::connect(&server.socket)
        .await
        .unwrap()
        .sdk(SdkConfig::new(11155111, "https://rpc.invalid"))
        .storage(ApplicationStorage::new(MemoryStorage::default()))
        .build()
        .await
        .unwrap();
    server.storage_replies.recv().await.unwrap();
    let send_error = |code: &str| {
        server
            .storage_actions
            .send(StorageServerMessage {
                message: Some(storage_server_message::Message::ReplyError(
                    StorageReplyError {
                        request_id: "finished".into(),
                        error: Some(generated::SdkError {
                            code: code.into(),
                            message: "backend unavailable".into(),
                            retryable: true,
                            retry_after_seconds: Some(1.5),
                        }),
                    },
                )),
            })
            .unwrap();
    };
    send_error("STORAGE_REQUEST_NOT_FOUND");
    assert!(
        tokio::time::timeout(
            Duration::from_millis(30),
            sdk.wait_channel_closed(CallbackChannel::Storage)
        )
        .await
        .is_err()
    );
    send_error("STORAGE_FAILED");
    for _ in 0..2 {
        let error = tokio::time::timeout(
            Duration::from_secs(2),
            sdk.wait_channel_closed(CallbackChannel::Storage),
        )
        .await
        .unwrap()
        .unwrap_err();
        let sdk_error = error.downcast_ref::<crate::SdkError>().unwrap();
        assert_eq!(sdk_error.code, "STORAGE_FAILED");
        assert!(sdk_error.retryable);
        assert_eq!(sdk_error.retry_after_seconds, Some(1.5));
    }
    sdk.close().await.unwrap();
}

#[tokio::test]
async fn channel_wait_preserves_rpc_error_metadata() {
    let mut status = tonic::Status::unavailable("retry later");
    status
        .metadata_mut()
        .insert("zama-error-code", "RELAYER_REQUEST_FAILED".parse().unwrap());
    status
        .metadata_mut()
        .insert("zama-error-retryable", "true".parse().unwrap());
    let connection =
        crate::channel::Connection::spawn(async { Err(RpcError::from(status).into()) });
    let error = connection.wait().await.unwrap_err();
    let rpc = error.downcast_ref::<RpcError>().unwrap();
    assert_eq!(rpc.sdk.as_ref().unwrap().code, "RELAYER_REQUEST_FAILED");
    assert!(rpc.sdk.as_ref().unwrap().retryable);
}
