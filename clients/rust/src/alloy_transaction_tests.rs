use super::*;
use crate::{Address, WalletAccount};
use alloy_consensus::{Transaction, transaction::SignerRecoverable};
use alloy_eips::eip2718::Decodable2718;
use alloy_provider::{
    Identity, ProviderBuilder, RootProvider,
    fillers::{JoinFill, WalletFiller},
    network::EthereumWallet,
};
use alloy_signer_local::PrivateKeySigner;
use alloy_transport::mock::Asserter;
use std::sync::{Arc, Mutex as SyncMutex, atomic::AtomicU64};

fn request(address: Address) -> ContractWriteRequest {
    ContractWriteRequest {
        operation_id: "operation".into(),
        action_id: "write".into(),
        account: WalletAccount {
            address,
            chain_id: 1,
        },
        address: Address::repeat_byte(2),
        data: vec![1, 2, 3, 4],
        abi: serde_json::json!([]),
        args: serde_json::json!([]),
        function_name: "call".into(),
        value: None,
        gas: None,
    }
}
fn test_signer() -> PrivateKeySigner {
    PrivateKeySigner::from_bytes(&B256::repeat_byte(1)).unwrap()
}
#[test]
fn preserves_calldata_account_chain_and_zero_overrides() {
    let mut request = request(Address::repeat_byte(1));
    let omitted = transaction(&request).unwrap();
    assert_eq!(omitted.gas, None);
    assert_eq!(omitted.value, None);
    assert_eq!(omitted.from, Some(request.account.address));
    assert_eq!(omitted.to, Some(TxKind::Call(request.address)));
    assert_eq!(omitted.chain_id, Some(1));
    assert_eq!(
        omitted.input.input.unwrap().as_ref(),
        request.data.as_slice()
    );
    request.value = Some(0.into());
    request.gas = Some(0.into());
    let zero = transaction(&request).unwrap();
    assert_eq!(zero.value, Some(U256::ZERO));
    assert_eq!(zero.gas, Some(0));
    request.gas = Some((-1).into());
    assert_eq!(transaction(&request).unwrap_err().code, "SIGNING_FAILED");
}
#[tokio::test]
async fn verifies_account_and_chain_and_keeps_preparation_failures_certain() {
    let signer = test_signer();
    let request = request(signer.address());
    let rpc = Asserter::new();
    let provider = ProviderBuilder::new()
        .disable_recommended_fillers()
        .wallet(signer.clone())
        .connect_mocked_client(rpc.clone());
    let wallet = AlloySigner::new(signer).with_transactions(provider, |_request| async { Ok(()) });
    let mut wrong_account = request.clone();
    wrong_account.account.address = Address::ZERO;
    assert_eq!(
        wallet.write_contract(wrong_account).await.unwrap_err().code,
        "SIGNING_FAILED"
    );
    rpc.push_success(&"0x2");
    assert_eq!(
        wallet
            .write_contract(request.clone())
            .await
            .unwrap_err()
            .code,
        "CHAIN_MISMATCH"
    );
    // Without nonce and fee fillers the wallet filler cannot sign; nothing was broadcast.
    rpc.push_success(&"0x1");
    assert_eq!(
        wallet
            .write_contract(request.clone())
            .await
            .unwrap_err()
            .code,
        "SIGNING_FAILED"
    );
    assert!(wallet.uncertain.lock().await.is_none());
    assert!(rpc.read_q().is_empty());
}
#[tokio::test]
async fn rejection_never_submits() {
    let signer = test_signer();
    let request = request(signer.address());
    let provider = ProviderBuilder::new()
        .wallet(signer.clone())
        .connect_mocked_client(Asserter::new());
    let wallet = AlloySigner::new(signer).with_transactions(provider, |_request| async {
        Err(SdkError::signing_rejected("declined"))
    });
    assert_eq!(
        wallet.write_contract(request).await.unwrap_err().code,
        "SIGNING_REJECTED"
    );
    assert!(wallet.uncertain.lock().await.is_none());
}

#[derive(Clone, Debug, Default)]
struct FixtureFiller(Arc<AtomicU64>);
impl alloy_provider::fillers::TxFiller for FixtureFiller {
    type Fillable = ();
    fn status(&self, tx: &TransactionRequest) -> alloy_provider::fillers::FillerControlFlow {
        if tx.nonce.is_some() {
            alloy_provider::fillers::FillerControlFlow::Finished
        } else {
            alloy_provider::fillers::FillerControlFlow::Ready
        }
    }
    fn fill_sync(&self, tx: &mut SendableTx<Ethereum>) {
        if let Some(tx) = tx.as_mut_builder() {
            tx.nonce
                .get_or_insert_with(|| self.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst));
            tx.gas.get_or_insert(100_000);
            tx.gas_price = Some(1);
        }
    }
    async fn prepare<P: Provider>(
        &self,
        _provider: &P,
        _tx: &TransactionRequest,
    ) -> alloy_transport::TransportResult<()> {
        Ok(())
    }
    async fn fill(
        &self,
        _: (),
        tx: SendableTx<Ethereum>,
    ) -> alloy_transport::TransportResult<SendableTx<Ethereum>> {
        Ok(tx)
    }
}

type TestProvider = FillProvider<
    JoinFill<JoinFill<Identity, FixtureFiller>, WalletFiller<EthereumWallet>>,
    RootProvider,
>;
/// Records broadcast transactions and can fail or hold a broadcast after the node received it.
#[derive(Clone, Default)]
struct Network {
    recorded: Arc<SyncMutex<Vec<TxEnvelope>>>,
    fail_next_broadcast: Arc<SyncMutex<bool>>,
    hold: Option<Arc<tokio::sync::Semaphore>>,
}
impl Network {
    fn provider(&self, filler: FixtureFiller) -> TestProvider {
        let network = self.clone();
        let transport = tower::service_fn(
            move |packet: alloy_json_rpc::RequestPacket| -> alloy_transport::TransportFut<'static> {
                let network = network.clone();
                Box::pin(async move {
                    let packet = serde_json::to_value(packet).unwrap();
                    let result = match packet["method"].as_str().unwrap() {
                        "eth_chainId" => serde_json::json!("0x1"),
                        "eth_sendRawTransaction" => {
                            let raw = alloy_primitives::hex::decode(
                                packet["params"][0].as_str().unwrap(),
                            )
                            .unwrap();
                            let tx = TxEnvelope::decode_2718(&mut raw.as_slice()).unwrap();
                            let hash = *tx.tx_hash();
                            network.recorded.lock().unwrap().push(tx);
                            if let Some(hold) = &network.hold {
                                hold.acquire().await.unwrap().forget();
                            }
                            if std::mem::take(&mut *network.fail_next_broadcast.lock().unwrap()) {
                                return Err(alloy_transport::TransportErrorKind::custom_str(
                                    "connection lost after acceptance",
                                ));
                            }
                            serde_json::json!(hash)
                        }
                        method => panic!("unexpected RPC method: {method}"),
                    };
                    Ok::<_, alloy_transport::TransportError>(
                        serde_json::from_value::<alloy_json_rpc::ResponsePacket>(
                            serde_json::json!({
                                "jsonrpc": "2.0", "id": packet["id"], "result": result,
                            }),
                        )
                        .unwrap(),
                    )
                })
            },
        );
        ProviderBuilder::new()
            .disable_recommended_fillers()
            .filler(filler)
            .wallet(test_signer())
            .connect_client(alloy_rpc_client::RpcClient::new(transport, true))
    }
}
#[derive(Default)]
struct RecordingPolicy(SyncMutex<Vec<B256>>);
#[async_trait::async_trait]
impl WritePolicy for RecordingPolicy {
    async fn approve(&self, _request: &ContractWriteRequest) -> Result<(), SdkError> {
        Ok(())
    }
    fn submitting(&self, _request: &ContractWriteRequest, transaction: &TxEnvelope) {
        self.0.lock().unwrap().push(*transaction.tx_hash());
    }
}

#[tokio::test]
async fn uncertain_broadcast_blocks_following_writes_with_a_certain_code() {
    let network = Network::default();
    *network.fail_next_broadcast.lock().unwrap() = true;
    let wallet = AlloySigner::new(test_signer()).with_transactions(
        network.provider(FixtureFiller::default()),
        RecordingPolicy::default(),
    );
    let request = request(test_signer().address());
    let error = wallet.write_contract(request.clone()).await.unwrap_err();
    let submitted = *network.recorded.lock().unwrap()[0].tx_hash();
    assert_eq!(error.code, "TRANSACTION_OUTCOME_UNKNOWN");
    assert!(!error.retryable);
    assert!(error.message.contains(&submitted.to_string()));
    assert_eq!(wallet.policy.0.lock().unwrap().as_slice(), &[submitted]);
    let blocked = wallet.write_contract(request).await.unwrap_err();
    assert_eq!(blocked.code, "SIGNING_FAILED");
    assert!(blocked.message.contains(&submitted.to_string()));
    assert_eq!(network.recorded.lock().unwrap().len(), 1);
}
#[tokio::test]
async fn cancellation_after_submission_blocks_following_writes() {
    let network = Network {
        hold: Some(Arc::new(tokio::sync::Semaphore::new(0))),
        ..Network::default()
    };
    let wallet = Arc::new(AlloySigner::new(test_signer()).with_transactions(
        network.provider(FixtureFiller::default()),
        RecordingPolicy::default(),
    ));
    let request = request(test_signer().address());
    let active_wallet = wallet.clone();
    let active_request = request.clone();
    let active = tokio::spawn(async move { active_wallet.write_contract(active_request).await });
    while network.recorded.lock().unwrap().is_empty() {
        tokio::task::yield_now().await;
    }
    active.abort();
    assert!(active.await.unwrap_err().is_cancelled());
    let submitted = *network.recorded.lock().unwrap()[0].tx_hash();
    // The policy saw the signed transaction even though the callback never returned its hash.
    assert_eq!(wallet.policy.0.lock().unwrap().as_slice(), &[submitted]);
    let blocked = wallet.write_contract(request).await.unwrap_err();
    assert_eq!(blocked.code, "SIGNING_FAILED");
    assert_eq!(network.recorded.lock().unwrap().len(), 1);
}
#[tokio::test]
async fn alloy_wallet_signs_and_broadcasts_concurrent_writes_without_receipts() {
    let network = Network::default();
    let filler = FixtureFiller::default();
    let nonces = filler.0.clone();
    let wallet = AlloySigner::new(test_signer())
        .with_transactions(network.provider(filler), |_request| async { Ok(()) });
    let request = request(test_signer().address());
    let (first, second) = tokio::join!(
        wallet.write_contract(request.clone()),
        wallet.write_contract(request.clone())
    );
    let recorded = network.recorded.lock().unwrap();
    assert_eq!(recorded.len(), 2);
    assert_eq!(first.unwrap(), *recorded[0].tx_hash());
    assert_eq!(second.unwrap(), *recorded[1].tx_hash());
    for (nonce, tx) in recorded.iter().enumerate() {
        assert_eq!(tx.recover_signer().unwrap(), request.account.address);
        assert_eq!(tx.chain_id(), Some(1));
        assert_eq!(tx.nonce(), nonce as u64);
        assert_eq!(tx.to(), Some(request.address));
        assert_eq!(tx.input().as_ref(), request.data.as_slice());
    }
    assert_eq!(nonces.load(std::sync::atomic::Ordering::SeqCst), 2);
}
