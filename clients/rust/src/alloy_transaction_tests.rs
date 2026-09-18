use super::*;
use crate::{Address, WalletAccount};
use alloy_consensus::{Transaction, transaction::SignerRecoverable};
use alloy_eips::eip2718::Decodable2718;
use alloy_provider::{
    ProviderBuilder,
    network::{Ethereum, Network},
};
use alloy_signer_local::PrivateKeySigner;
use alloy_transport::mock::Asserter;
use std::sync::{
    Arc, Mutex as SyncMutex,
    atomic::{AtomicU64, Ordering},
};
use tokio::sync::{Semaphore, watch};

type TxEnvelope = <Ethereum as Network>::TxEnvelope;

const ESTIMATED_GAS: u64 = 30_000;

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
    request.gas = Some(0.into());
    request.value = Some((-1).into());
    assert_eq!(transaction(&request).unwrap_err().code, "SIGNING_FAILED");
}
#[tokio::test]
async fn account_and_chain_mismatch_are_refused_without_any_rpc() {
    let signer = test_signer();
    let rpc = Asserter::new();
    let provider = ProviderBuilder::new()
        .disable_recommended_fillers()
        .wallet(signer.clone())
        .connect_mocked_client(rpc.clone());
    let wallet = AlloySigner::new(alloy_signer::Signer::with_chain_id(signer.clone(), Some(2)))
        .with_transactions(provider);
    let mut wrong_account = request(signer.address());
    wrong_account.account.address = Address::ZERO;
    assert_eq!(
        wallet
            .write_contract(wrong_account, CancellationToken::new())
            .await
            .unwrap_err()
            .code,
        "SIGNING_FAILED"
    );
    assert_eq!(
        wallet
            .write_contract(request(signer.address()), CancellationToken::new())
            .await
            .unwrap_err()
            .code,
        "CHAIN_MISMATCH"
    );
    assert!(rpc.read_q().is_empty());
}

/// A revert message and optional raw revert data, for a queued eth_estimateGas error response.
type RevertGas = (&'static str, Option<&'static str>);

/// Answers the recommended filler stack, records broadcasts, and can disturb any of the two steps.
#[derive(Clone)]
struct TestNetwork {
    sent: Arc<SyncMutex<Vec<TxEnvelope>>>,
    /// Holds every broadcast after the node received it.
    hold: Option<Arc<Semaphore>>,
    fail_next_broadcast: Arc<SyncMutex<bool>>,
    fail_gas_once: Arc<SyncMutex<bool>>,
    /// When set, eth_estimateGas answers with this JSON-RPC error instead of a gas value.
    revert_gas: Arc<SyncMutex<Option<RevertGas>>>,
    /// Advances the answered nonce per request; otherwise every fill reads the same one.
    advance_nonce: Option<Arc<AtomicU64>>,
    /// Cancels while the write is still filling, so it holds an unsent transaction.
    cancel_on_nonce: Option<CancellationToken>,
    nonce_served: Arc<watch::Sender<bool>>,
}
impl Default for TestNetwork {
    fn default() -> Self {
        Self {
            sent: Arc::default(),
            hold: None,
            fail_next_broadcast: Arc::default(),
            fail_gas_once: Arc::default(),
            revert_gas: Arc::default(),
            advance_nonce: None,
            cancel_on_nonce: None,
            nonce_served: Arc::new(watch::channel(false).0),
        }
    }
}
impl TestNetwork {
    fn wallet(&self) -> impl Signer + use<> {
        self.wallet_with_timeout(DEFAULT_BROADCAST_TIMEOUT)
    }
    fn wallet_with_timeout(&self, timeout: Duration) -> impl Signer + use<> {
        let network = self.clone();
        let transport = tower::service_fn(
            move |packet: alloy_json_rpc::RequestPacket| -> alloy_transport::TransportFut<'static> {
                let network = network.clone();
                Box::pin(async move {
                    let packet = serde_json::to_value(packet).unwrap();
                    let result = match packet["method"].as_str().unwrap() {
                        "eth_chainId" => serde_json::json!("0x1"),
                        "eth_getTransactionCount" => {
                            network.nonce_served.send_replace(true);
                            if let Some(cancel) = &network.cancel_on_nonce {
                                cancel.cancel();
                            }
                            let nonce = match &network.advance_nonce {
                                Some(next) => 5 + next.fetch_add(1, Ordering::SeqCst),
                                None => 5,
                            };
                            serde_json::json!(format!("0x{nonce:x}"))
                        }
                        "eth_feeHistory" => serde_json::json!({
                            "oldestBlock": "0x1",
                            "baseFeePerGas": ["0x7", "0x7"],
                            "gasUsedRatio": [0.5],
                            "reward": [["0x1"]],
                        }),
                        "eth_estimateGas" => {
                            if let Some((message, data)) = network.revert_gas.lock().unwrap().take()
                            {
                                let error = match data {
                                    Some(data) => {
                                        serde_json::json!({"code": 3, "message": message, "data": data})
                                    }
                                    None => serde_json::json!({"code": 3, "message": message}),
                                };
                                return Ok::<_, alloy_transport::TransportError>(
                                    serde_json::from_value::<alloy_json_rpc::ResponsePacket>(
                                        serde_json::json!({
                                            "jsonrpc": "2.0", "id": packet["id"], "error": error,
                                        }),
                                    )
                                    .unwrap(),
                                );
                            }
                            if std::mem::take(&mut *network.fail_gas_once.lock().unwrap()) {
                                // The nonce read of the same fill has to settle first; the timeout
                                // only keeps a broken stack from hanging.
                                let mut served = network.nonce_served.subscribe();
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
                            serde_json::json!(format!("0x{ESTIMATED_GAS:x}"))
                        }
                        "eth_sendRawTransaction" => {
                            let raw = alloy_primitives::hex::decode(
                                packet["params"][0].as_str().unwrap(),
                            )
                            .unwrap();
                            let tx = TxEnvelope::decode_2718(&mut raw.as_slice()).unwrap();
                            let hash = *tx.tx_hash();
                            network.sent.lock().unwrap().push(tx);
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
        let provider = ProviderBuilder::new()
            .disable_recommended_fillers()
            .with_gas_estimation()
            .with_blob_gas_estimation()
            .with_simple_nonce_management()
            .fetch_chain_id()
            .wallet(test_signer())
            .connect_client(alloy_rpc_client::RpcClient::new(transport, true));
        AlloySigner::new(test_signer())
            .with_transactions(provider)
            .broadcast_timeout(timeout)
    }
    async fn wait_for_broadcast(&self) {
        while self.sent.lock().unwrap().is_empty() {
            tokio::task::yield_now().await;
        }
    }
    fn only_hash(&self) -> B256 {
        *self.sent.lock().unwrap()[0].tx_hash()
    }
}
fn reverting_network(data: Option<&'static str>) -> TestNetwork {
    let network = TestNetwork::default();
    *network.revert_gas.lock().unwrap() = Some(("execution reverted", data));
    network
}
fn holding_network() -> TestNetwork {
    TestNetwork {
        hold: Some(Arc::new(Semaphore::new(0))),
        ..TestNetwork::default()
    }
}

#[tokio::test]
async fn broadcasts_the_signed_transaction_and_returns_its_hash() {
    let network = TestNetwork::default();
    let wallet = network.wallet();
    let mut request = request(test_signer().address());
    request.value = Some(7.into());
    request.gas = Some(21_000.into());
    let hash = wallet
        .write_contract(request.clone(), CancellationToken::new())
        .await
        .unwrap();
    let sent = network.sent.lock().unwrap();
    assert_eq!(sent.len(), 1);
    let sent = &sent[0];
    assert_eq!(hash, *sent.tx_hash());
    assert_eq!(sent.recover_signer().unwrap(), request.account.address);
    assert_eq!(sent.chain_id(), Some(1));
    assert_eq!(sent.to(), Some(request.address));
    assert_eq!(sent.input().as_ref(), request.data.as_slice());
    assert_eq!(sent.value(), U256::from(7));
    assert_eq!(sent.gas_limit(), 21_000);
}
#[tokio::test]
async fn an_absent_gas_limit_is_estimated_by_the_provider() {
    let network = TestNetwork::default();
    let wallet = network.wallet();
    wallet
        .write_contract(request(test_signer().address()), CancellationToken::new())
        .await
        .unwrap();
    let sent = network.sent.lock().unwrap();
    assert_eq!(sent[0].gas_limit(), ESTIMATED_GAS);
    assert_eq!(sent[0].value(), U256::ZERO);
}
#[tokio::test]
async fn cancellation_before_the_fill_never_broadcasts() {
    let network = TestNetwork::default();
    let wallet = network.wallet();
    let cancel = CancellationToken::new();
    cancel.cancel();
    let error = wallet
        .write_contract(request(test_signer().address()), cancel)
        .await
        .unwrap_err();
    assert_eq!(error.code, "SIGNING_FAILED");
    assert!(network.sent.lock().unwrap().is_empty());
}
#[tokio::test]
async fn cancellation_before_the_send_never_broadcasts() {
    let cancel = CancellationToken::new();
    let network = TestNetwork {
        cancel_on_nonce: Some(cancel.clone()),
        ..TestNetwork::default()
    };
    let error = network
        .wallet()
        .write_contract(request(test_signer().address()), cancel)
        .await
        .unwrap_err();
    assert_eq!(error.code, "SIGNING_FAILED");
    assert!(network.sent.lock().unwrap().is_empty());
}
#[tokio::test]
async fn cancellation_during_the_send_still_returns_the_hash() {
    let network = holding_network();
    let wallet = network.wallet();
    let cancel = CancellationToken::new();
    let write = tokio::spawn({
        let cancel = cancel.clone();
        async move {
            wallet
                .write_contract(request(test_signer().address()), cancel)
                .await
        }
    });
    network.wait_for_broadcast().await;
    cancel.cancel();
    network.hold.as_ref().unwrap().add_permits(1);
    assert_eq!(write.await.unwrap().unwrap(), network.only_hash());
}
#[test]
fn a_zero_broadcast_timeout_keeps_the_default() {
    let provider = ProviderBuilder::new()
        .disable_recommended_fillers()
        .wallet(test_signer())
        .connect_mocked_client(Asserter::new());
    let wallet = AlloySigner::new(test_signer()).with_transactions(provider);
    assert_eq!(wallet.broadcast_timeout, DEFAULT_BROADCAST_TIMEOUT);
    let wallet = wallet.broadcast_timeout(Duration::ZERO);
    assert_eq!(wallet.broadcast_timeout, DEFAULT_BROADCAST_TIMEOUT);
    assert_eq!(
        wallet
            .broadcast_timeout(Duration::from_secs(1))
            .broadcast_timeout,
        Duration::from_secs(1)
    );
}
#[tokio::test]
async fn a_failed_send_reports_an_uncertain_outcome_with_the_hash() {
    let network = TestNetwork::default();
    *network.fail_next_broadcast.lock().unwrap() = true;
    let error = network
        .wallet()
        .write_contract(request(test_signer().address()), CancellationToken::new())
        .await
        .unwrap_err();
    assert_eq!(error.code, "TRANSACTION_OUTCOME_UNKNOWN");
    assert!(!error.retryable);
    assert!(error.message.contains(&network.only_hash().to_string()));
    assert!(error.message.contains("connection lost after acceptance"));
}
#[tokio::test]
async fn a_send_past_the_broadcast_timeout_reports_an_uncertain_outcome_with_the_hash() {
    let network = holding_network();
    let error = network
        .wallet_with_timeout(Duration::from_millis(50))
        .write_contract(request(test_signer().address()), CancellationToken::new())
        .await
        .unwrap_err();
    assert_eq!(error.code, "TRANSACTION_OUTCOME_UNKNOWN");
    assert!(error.message.contains(&network.only_hash().to_string()));
}
#[tokio::test]
async fn a_fill_failure_stays_certain_and_reports_its_cause() {
    let network = TestNetwork::default();
    *network.fail_gas_once.lock().unwrap() = true;
    let error = network
        .wallet()
        .write_contract(request(test_signer().address()), CancellationToken::new())
        .await
        .unwrap_err();
    assert_eq!(error.code, "SIGNING_FAILED");
    assert!(error.message.contains("gas estimation unavailable"));
    assert!(network.sent.lock().unwrap().is_empty());
}
#[tokio::test]
async fn concurrent_writes_both_reach_the_network_with_provider_nonces() {
    let network = TestNetwork {
        advance_nonce: Some(Arc::default()),
        ..TestNetwork::default()
    };
    let wallet = network.wallet();
    let request = request(test_signer().address());
    let (first, second) = tokio::join!(
        wallet.write_contract(request.clone(), CancellationToken::new()),
        wallet.write_contract(request.clone(), CancellationToken::new())
    );
    let sent = network.sent.lock().unwrap();
    assert_eq!(sent.len(), 2);
    let hashes = [first.unwrap(), second.unwrap()];
    let mut nonces = Vec::new();
    for tx in sent.iter() {
        assert!(hashes.contains(tx.tx_hash()));
        assert_eq!(tx.recover_signer().unwrap(), request.account.address);
        assert_eq!(tx.to(), Some(request.address));
        nonces.push(tx.nonce());
    }
    nonces.sort_unstable();
    assert_eq!(nonces, [5, 6]);
}
#[tokio::test]
async fn a_simulation_revert_with_data_is_certain_and_carries_the_bytes() {
    let network = reverting_network(Some("0x1234abcd"));
    let error = network
        .wallet()
        .write_contract(request(test_signer().address()), CancellationToken::new())
        .await
        .unwrap_err();
    assert_eq!(error.code, "TRANSACTION_REVERTED");
    assert!(!error.retryable);
    assert_eq!(error.revert_data, Some(vec![0x12, 0x34, 0xab, 0xcd]));
    assert!(network.sent.lock().unwrap().is_empty());
}
#[tokio::test]
async fn a_simulation_revert_without_data_carries_empty_bytes() {
    let network = reverting_network(None);
    let error = network
        .wallet()
        .write_contract(request(test_signer().address()), CancellationToken::new())
        .await
        .unwrap_err();
    assert_eq!(error.code, "TRANSACTION_REVERTED");
    assert_eq!(error.revert_data, Some(Vec::new()));
    assert!(network.sent.lock().unwrap().is_empty());
}

fn error_resp(code: i64, message: &str, data: Option<serde_json::Value>) -> TransportError {
    let data = data.map(|value| serde_json::value::to_raw_value(&value).unwrap());
    TransportError::ErrorResp(alloy_json_rpc::ErrorPayload {
        code,
        message: message.to_string().into(),
        data,
    })
}
#[test]
fn a_plain_insufficient_funds_error_is_not_a_revert() {
    let error = error_resp(-32000, "insufficient funds for gas * price + value", None);
    assert_eq!(revert_data(&error), None);
}
#[test]
fn code_three_with_empty_string_data_is_a_revert_with_empty_bytes() {
    let error = error_resp(3, "execution reverted", Some(serde_json::json!("")));
    assert_eq!(revert_data(&error), Some(Vec::new()));
}
#[test]
fn non_string_data_on_an_unrelated_code_is_not_a_revert() {
    let error = error_resp(-32000, "header not found", Some(serde_json::json!(1234)));
    assert_eq!(revert_data(&error), None);
}
