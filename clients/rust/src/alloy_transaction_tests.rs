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
    let wallet =
        AlloySigner::new(signer).with_transactions(provider, |_request, _cancel| async { Ok(()) });
    let mut wrong_account = request.clone();
    wrong_account.account.address = Address::ZERO;
    assert_eq!(
        wallet
            .write_contract(wrong_account, CancellationToken::new())
            .await
            .unwrap_err()
            .code,
        "SIGNING_FAILED"
    );
    rpc.push_success(&"0x2");
    assert_eq!(
        wallet
            .write_contract(request.clone(), CancellationToken::new())
            .await
            .unwrap_err()
            .code,
        "CHAIN_MISMATCH"
    );
    // Without nonce and fee fillers the wallet filler cannot sign; nothing was broadcast.
    rpc.push_success(&"0x1");
    assert_eq!(
        wallet
            .write_contract(request.clone(), CancellationToken::new())
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
    let wallet = AlloySigner::new(signer).with_transactions(provider, |_request, _cancel| async {
        Err(SdkError::signing_rejected("declined"))
    });
    assert_eq!(
        wallet
            .write_contract(request, CancellationToken::new())
            .await
            .unwrap_err()
            .code,
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
    async fn approve(
        &self,
        _request: &ContractWriteRequest,
        _cancel: &CancellationToken,
    ) -> Result<(), SdkError> {
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
    let error = wallet
        .write_contract(request.clone(), CancellationToken::new())
        .await
        .unwrap_err();
    let submitted = *network.recorded.lock().unwrap()[0].tx_hash();
    assert_eq!(error.code, "TRANSACTION_OUTCOME_UNKNOWN");
    assert!(!error.retryable);
    assert!(error.message.contains(&submitted.to_string()));
    assert_eq!(wallet.policy.0.lock().unwrap().as_slice(), &[submitted]);
    let blocked = wallet
        .write_contract(request, CancellationToken::new())
        .await
        .unwrap_err();
    assert_eq!(blocked.code, "SIGNING_FAILED");
    assert!(blocked.message.contains(&submitted.to_string()));
    assert_eq!(network.recorded.lock().unwrap().len(), 1);
}
#[tokio::test]
async fn cancellation_after_signing_still_broadcasts() {
    let network = Network {
        hold: Some(Arc::new(tokio::sync::Semaphore::new(0))),
        ..Network::default()
    };
    let wallet = Arc::new(AlloySigner::new(test_signer()).with_transactions(
        network.provider(FixtureFiller::default()),
        RecordingPolicy::default(),
    ));
    let request = request(test_signer().address());
    let cancel = CancellationToken::new();
    let active_wallet = wallet.clone();
    let active_request = request.clone();
    let active_cancel = cancel.clone();
    let active = tokio::spawn(async move {
        active_wallet
            .write_contract(active_request, active_cancel)
            .await
    });
    while network.recorded.lock().unwrap().is_empty() {
        tokio::task::yield_now().await;
    }
    cancel.cancel();
    network.hold.as_ref().unwrap().add_permits(1);
    let submitted = *network.recorded.lock().unwrap()[0].tx_hash();
    assert_eq!(active.await.unwrap().unwrap(), submitted);
    assert_eq!(wallet.policy.0.lock().unwrap().as_slice(), &[submitted]);
    assert!(wallet.uncertain.lock().await.is_none());
}
#[tokio::test]
async fn cancellation_before_approval_never_broadcasts() {
    let network = Network::default();
    let wallet = AlloySigner::new(test_signer()).with_transactions(
        network.provider(FixtureFiller::default()),
        |_request, _cancel| async { Err(SdkError::signing_rejected("approval must not run")) },
    );
    let cancel = CancellationToken::new();
    cancel.cancel();
    let error = wallet
        .write_contract(request(test_signer().address()), cancel)
        .await
        .unwrap_err();
    assert_eq!(error.code, "SIGNING_FAILED");
    assert!(network.recorded.lock().unwrap().is_empty());
    assert!(wallet.uncertain.lock().await.is_none());
}
#[tokio::test]
async fn alloy_wallet_signs_and_broadcasts_serialized_writes_without_receipts() {
    let network = Network::default();
    let filler = FixtureFiller::default();
    let nonces = filler.0.clone();
    let wallet = AlloySigner::new(test_signer())
        .with_transactions(network.provider(filler), |_request, _cancel| async {
            Ok(())
        });
    let request = request(test_signer().address());
    let (first, second) = tokio::join!(
        wallet.write_contract(request.clone(), CancellationToken::new()),
        wallet.write_contract(request.clone(), CancellationToken::new())
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

/// Answers the recommended filler stack and can fail gas estimation once.
#[derive(Clone)]
struct RecoveringNetwork {
    sent: Arc<SyncMutex<Vec<TxEnvelope>>>,
    fail_gas: Arc<SyncMutex<bool>>,
    /// Turns true once a nonce request has been answered, gating the gas failure behind it.
    nonce_served: Arc<tokio::sync::watch::Sender<bool>>,
}
impl Default for RecoveringNetwork {
    fn default() -> Self {
        Self {
            sent: Arc::default(),
            fail_gas: Arc::default(),
            nonce_served: Arc::new(tokio::sync::watch::channel(false).0),
        }
    }
}
impl RecoveringNetwork {
    fn transport(
        &self,
    ) -> impl tower::Service<
        alloy_json_rpc::RequestPacket,
        Response = alloy_json_rpc::ResponsePacket,
        Error = alloy_transport::TransportError,
        Future = alloy_transport::TransportFut<'static>,
    > + Clone
    + Send
    + Sync
    + use<> {
        let network = self.clone();
        tower::service_fn(
            move |packet: alloy_json_rpc::RequestPacket| -> alloy_transport::TransportFut<'static> {
                let network = network.clone();
                Box::pin(async move {
                    let packet = serde_json::to_value(packet).unwrap();
                    let result = match packet["method"].as_str().unwrap() {
                        "eth_chainId" => serde_json::json!("0x1"),
                        "eth_getTransactionCount" => {
                            network.nonce_served.send_replace(true);
                            serde_json::json!("0x5")
                        }
                        "eth_feeHistory" => serde_json::json!({
                            "oldestBlock": "0x1",
                            "baseFeePerGas": ["0x7", "0x7"],
                            "gasUsedRatio": [0.5],
                            "reward": [["0x1"]],
                        }),
                        "eth_estimateGas" => {
                            if std::mem::take(&mut *network.fail_gas.lock().unwrap()) {
                                // The nonce read of the same fill has to settle before this failure.
                                let mut served = network.nonce_served.subscribe();
                                // The timeout only keeps a broken stack from hanging; the test
                                // asserts the nonce was served.
                                let _ = tokio::time::timeout(Duration::from_secs(5), async {
                                    while !*served.borrow_and_update() {
                                        served.changed().await.unwrap();
                                    }
                                })
                                .await;
                                return Err(alloy_transport::TransportErrorKind::custom_str(
                                    "gas estimation unavailable",
                                ));
                            }
                            serde_json::json!("0x5208")
                        }
                        "eth_sendRawTransaction" => {
                            let raw = alloy_primitives::hex::decode(
                                packet["params"][0].as_str().unwrap(),
                            )
                            .unwrap();
                            let tx = TxEnvelope::decode_2718(&mut raw.as_slice()).unwrap();
                            let hash = *tx.tx_hash();
                            network.sent.lock().unwrap().push(tx);
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
        )
    }
}
#[tokio::test]
async fn simple_nonce_management_keeps_the_nonce_after_a_fill_failure() {
    let network = RecoveringNetwork::default();
    *network.fail_gas.lock().unwrap() = true;
    let provider = ProviderBuilder::new()
        .disable_recommended_fillers()
        .with_gas_estimation()
        .with_blob_gas_estimation()
        .with_simple_nonce_management()
        .fetch_chain_id()
        .wallet(test_signer())
        .connect_client(alloy_rpc_client::RpcClient::new(network.transport(), true));
    let wallet = AlloySigner::new(test_signer())
        .with_transactions(provider, |_request, _cancel| async { Ok(()) });
    let request = request(test_signer().address());
    let failed = wallet
        .write_contract(request.clone(), CancellationToken::new())
        .await
        .unwrap_err();
    assert_eq!(failed.code, "SIGNING_FAILED");
    assert!(network.sent.lock().unwrap().is_empty());
    // The failing fill took a nonce, which a cached manager would not hand out twice.
    assert!(*network.nonce_served.borrow());
    wallet
        .write_contract(request, CancellationToken::new())
        .await
        .unwrap();
    assert_eq!(network.sent.lock().unwrap()[0].nonce(), 5);
}
