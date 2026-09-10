use anyhow::Result;
use std::{
    io::{self, Write},
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};
use zama_sdk_sidecar::{
    Address, ApplicationStorage, B256, ClearValue, Client, EncryptedInput, MemoryStorage, Sdk,
    SdkConfig, SigningRequest, WalletAccount,
};

async fn create(
    socket: &str,
    storage: ApplicationStorage,
    signatures: Arc<AtomicUsize>,
) -> Result<Sdk> {
    Client::connect(socket)
        .await?
        .sdk(SdkConfig::new(31337, "http://fixture.invalid"))
        .storage(storage)
        .signer(
            Some(WalletAccount {
                address: Address::repeat_byte(0x2b),
                chain_id: 31337,
            }),
            move |_: SigningRequest| {
                signatures.fetch_add(1, Ordering::SeqCst);
                async { Ok(vec![0x33; 65]) }
            },
        )
        .build()
        .await
}
async fn decrypt(sdk: &Sdk, marker: u8) -> Result<()> {
    let handle = B256::repeat_byte(marker);
    let values = sdk
        .decryption()
        .decrypt_values(
            &[EncryptedInput {
                encrypted_value: handle,
                contract_address: Address::repeat_byte(0x1a),
            }],
            None,
        )
        .await?;
    assert_eq!(values[&handle], ClearValue::BigInt(1000.into()));
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires parent-controlled SDK fixture server and restart handshake"]
async fn external_storage_survives_sidecar_restart() -> Result<()> {
    let socket = std::env::var("SIDECAR_STORAGE_TEST_SOCKET")?;
    let storage = ApplicationStorage::new(MemoryStorage::default());
    let signatures = Arc::new(AtomicUsize::new(0));
    let first = create(&socket, storage.clone(), signatures.clone()).await?;
    decrypt(&first, 0xab).await?;
    assert_eq!(signatures.load(Ordering::SeqCst), 1);
    println!("STORAGE_READY");
    io::stdout().flush()?;
    tokio::task::spawn_blocking(|| io::stdin().read_line(&mut String::new())).await??;
    drop(first);
    let second = create(&socket, storage, signatures.clone()).await?;
    decrypt(&second, 0xcd).await?;
    assert_eq!(signatures.load(Ordering::SeqCst), 1);
    second.close().await?;
    println!("STORAGE_REUSED");
    io::stdout().flush()?;
    Ok(())
}
