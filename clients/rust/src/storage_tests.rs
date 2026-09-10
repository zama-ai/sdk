use super::*;

#[tokio::test]
async fn managed_storage_preserves_opaque_bytes_missing_empty_and_backend_identity() {
    let memory = MemoryStorage::default();
    let main = ApplicationStorage::new(memory.clone());
    let permit_memory = MemoryStorage::default();
    let permit = ApplicationStorage::new(permit_memory.clone());
    let main_id = main.id.clone();
    let permit_id = permit.id.clone();
    let expected_main = main_id.clone();
    let expected_permit = permit_id.clone();
    let mut server = Server::start(Arc::new(move |path, bytes| {
        if path.ends_with("/CreateContext") {
            let request = CreateContextRequest::decode(bytes).unwrap();
            assert_eq!(
                request.storage.unwrap().backend,
                Some(storage_binding::Backend::Application(expected_main.clone()))
            );
            assert_eq!(
                request.permit_storage.unwrap().backend,
                Some(storage_binding::Backend::Application(
                    expected_permit.clone()
                ))
            );
        }
        default_handler(path, bytes)
    }))
    .await;
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
        .storage(main)
        .permit_storage(permit)
        .build()
        .await
        .unwrap();
    let attached = server.storage_replies.recv().await.unwrap();
    assert!(matches!(
        attached.message,
        Some(storage_client_message::Message::Attach(_))
    ));
    for (index, method, value, expected) in [
        (0, StorageMethod::Get, vec![], None),
        (1, StorageMethod::Set, vec![], None),
        (2, StorageMethod::Get, vec![], Some(vec![])),
        (3, StorageMethod::Set, vec![0, 255, 128, 1], None),
        (4, StorageMethod::Get, vec![], Some(vec![0, 255, 128, 1])),
        (5, StorageMethod::Delete, vec![], None),
        (6, StorageMethod::Get, vec![], None),
    ] {
        server
            .storage_actions
            .send(StorageServerMessage {
                message: Some(storage_server_message::Message::Action(StorageAction {
                    request_id: index.to_string(),
                    backend_id: main_id.clone(),
                    method: method as i32,
                    key: "opaque".into(),
                    value,
                })),
            })
            .unwrap();
        let reply = tokio::time::timeout(Duration::from_secs(2), server.storage_replies.recv())
            .await
            .unwrap()
            .unwrap();
        let Some(storage_client_message::Message::Reply(reply)) = reply.message else {
            panic!("expected reply")
        };
        assert_eq!(reply.request_id, index.to_string());
        assert_eq!(reply.value, expected);
        assert!(reply.error.is_none());
    }
    memory.set("same", vec![1]).await.unwrap();
    permit_memory.set("same", vec![2]).await.unwrap();
    for (id, expected) in [(main_id, vec![1]), (permit_id, vec![2])] {
        server
            .storage_actions
            .send(StorageServerMessage {
                message: Some(storage_server_message::Message::Action(StorageAction {
                    request_id: id.clone(),
                    backend_id: id.clone(),
                    method: StorageMethod::Get as i32,
                    key: "same".into(),
                    value: vec![],
                })),
            })
            .unwrap();
        let reply = server.storage_replies.recv().await.unwrap();
        let Some(storage_client_message::Message::Reply(reply)) = reply.message else {
            panic!("expected reply")
        };
        assert_eq!(reply.request_id, id);
        assert_eq!(reply.value, Some(expected));
    }
    sdk.close().await.unwrap();
}

#[tokio::test]
async fn storage_callbacks_run_concurrently_and_stop_on_close() {
    struct BlockedStorage(Arc<tokio::sync::Semaphore>, Arc<tokio::sync::Semaphore>);
    struct Completion(Arc<tokio::sync::Semaphore>);
    impl Drop for Completion {
        fn drop(&mut self) {
            self.0.add_permits(1);
        }
    }
    #[async_trait]
    impl NativeStorage for BlockedStorage {
        async fn get(&self, key: &str) -> anyhow::Result<Option<Vec<u8>>> {
            if key == "blocked" {
                let _completion = Completion(self.1.clone());
                self.0.add_permits(1);
                std::future::pending::<()>().await;
            }
            Ok(Some(vec![42]))
        }
        async fn set(&self, _: &str, _: Vec<u8>) -> anyhow::Result<()> {
            Ok(())
        }
        async fn delete(&self, _: &str) -> anyhow::Result<()> {
            Ok(())
        }
    }
    let started = Arc::new(tokio::sync::Semaphore::new(0));
    let stopped = Arc::new(tokio::sync::Semaphore::new(0));
    let storage = ApplicationStorage::new(BlockedStorage(started.clone(), stopped.clone()));
    let id = storage.id.clone();
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
        .storage(storage)
        .build()
        .await
        .unwrap();
    server.storage_replies.recv().await.unwrap();
    for key in ["blocked", "fast"] {
        server
            .storage_actions
            .send(StorageServerMessage {
                message: Some(storage_server_message::Message::Action(StorageAction {
                    request_id: key.into(),
                    backend_id: id.clone(),
                    method: StorageMethod::Get as i32,
                    key: key.into(),
                    value: vec![],
                })),
            })
            .unwrap();
    }
    tokio::time::timeout(Duration::from_secs(2), started.acquire())
        .await
        .unwrap()
        .unwrap()
        .forget();
    let reply = tokio::time::timeout(Duration::from_secs(2), server.storage_replies.recv())
        .await
        .unwrap()
        .unwrap();
    let Some(storage_client_message::Message::Reply(reply)) = reply.message else {
        panic!("expected reply")
    };
    assert_eq!(reply.request_id, "fast");
    assert_eq!(reply.value, Some(vec![42]));
    let clone = sdk.clone();
    drop(sdk);
    assert_eq!(stopped.available_permits(), 0);
    clone.close().await.unwrap();
    tokio::time::timeout(Duration::from_secs(2), stopped.acquire())
        .await
        .unwrap()
        .unwrap()
        .forget();
}
