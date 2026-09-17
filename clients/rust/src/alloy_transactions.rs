use crate::{B256, ContractWriteRequest, SdkError, Signer, SigningRequest, alloy::AlloySigner};
use alloy_primitives::{TxKind, U256};
use alloy_provider::{
    Provider, SendableTx, WalletProvider,
    fillers::{FillProvider, TxFiller},
    network::{Ethereum, Network},
};
use alloy_rpc_types_eth::TransactionRequest;
use std::{future::Future, time::Duration};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

pub type TxEnvelope = <Ethereum as Network>::TxEnvelope;

/// Bounds a send that the caller's cancellation is no longer allowed to stop.
const BROADCAST_TIMEOUT: Duration = Duration::from_secs(30);

#[async_trait::async_trait]
pub trait WritePolicy: Send + Sync {
    /// Runs before signing; an error stops the write without a broadcast.
    async fn approve(
        &self,
        request: &ContractWriteRequest,
        cancel: &CancellationToken,
    ) -> Result<(), SdkError>;
    /// Receives the signed transaction before broadcast. Record it: a cancelled or lost
    /// callback cannot report the hash afterwards.
    fn submitting(&self, _request: &ContractWriteRequest, _transaction: &TxEnvelope) {}
}
#[async_trait::async_trait]
impl<F, Fut> WritePolicy for F
where
    F: Fn(ContractWriteRequest, CancellationToken) -> Fut + Send + Sync,
    Fut: Future<Output = Result<(), SdkError>> + Send,
{
    async fn approve(
        &self,
        request: &ContractWriteRequest,
        cancel: &CancellationToken,
    ) -> Result<(), SdkError> {
        self(request.clone(), cancel.clone()).await
    }
}

/// EIP-712 signing plus contract writes through one Alloy wallet provider.
/// Share one wallet for each account and chain; writes are serialized per wallet instance.
pub struct AlloyWallet<S, F, P, W>
where
    F: TxFiller,
    P: Provider,
{
    signer: AlloySigner<S>,
    provider: FillProvider<F, P>,
    policy: W,
    uncertain: Mutex<Option<B256>>,
}
impl<S> AlloySigner<S> {
    pub fn with_transactions<F, P, W>(
        self,
        provider: FillProvider<F, P>,
        policy: W,
    ) -> AlloyWallet<S, F, P, W>
    where
        F: TxFiller,
        P: Provider,
    {
        AlloyWallet {
            signer: self,
            provider,
            policy,
            uncertain: Mutex::new(None),
        }
    }
}
#[async_trait::async_trait]
impl<S, F, P, W> Signer for AlloyWallet<S, F, P, W>
where
    S: alloy_signer::Signer + Send + Sync,
    F: TxFiller,
    P: Provider,
    FillProvider<F, P>: WalletProvider,
    W: WritePolicy,
{
    async fn sign_typed_data(&self, request: SigningRequest) -> Result<Vec<u8>, SdkError> {
        self.signer.sign_typed_data(request).await
    }
    // Approval runs outside the serialization gate, so the chain is rechecked once this write holds it.
    async fn write_contract(
        &self,
        request: ContractWriteRequest,
        cancel: CancellationToken,
    ) -> Result<B256, SdkError> {
        if cancel.is_cancelled() {
            return Err(cancelled());
        }
        if self.provider.default_signer_address() != request.account.address {
            return Err(SdkError::signing_failed(
                "Wallet does not control the requested account.",
            ));
        }
        let transaction = transaction(&request)?;
        self.policy.approve(&request, &cancel).await?;
        let mut uncertain = self.uncertain.lock().await;
        if cancel.is_cancelled() {
            return Err(cancelled());
        }
        if let Some(hash) = *uncertain {
            // This write never reached the RPC; only the earlier submission is uncertain.
            return Err(SdkError::signing_failed(format!(
                "Reconcile uncertain transaction {hash} before sending another."
            )));
        }
        let chain = self.provider.get_chain_id().await.map_err(|error| {
            SdkError::signing_failed(format!("Cannot read the wallet RPC chain ID: {error}"))
        })?;
        if chain != request.account.chain_id {
            return Err(SdkError::chain_mismatch(
                "RPC chain does not match the requested account.",
            ));
        }
        // Filling and signing happen before broadcast, so their failures are certain.
        let envelope = match self.provider.fill(transaction).await {
            Ok(SendableTx::Envelope(envelope)) => envelope,
            Ok(SendableTx::Builder(_)) => {
                return Err(SdkError::signing_failed(
                    "Wallet provider did not sign the transaction.",
                ));
            }
            Err(error) => {
                return Err(SdkError::signing_failed(format!(
                    "Cannot prepare the transaction: {error}"
                )));
            }
        };
        let hash = *envelope.tx_hash();
        self.policy.submitting(&request, &envelope);
        // A signed transaction can reach the node without a usable answer, so later writes stay blocked.
        *uncertain = Some(hash);
        match tokio::time::timeout(BROADCAST_TIMEOUT, self.provider.send_tx_envelope(envelope))
            .await
        {
            Ok(Ok(_)) => (),
            Ok(Err(error)) => {
                return Err(SdkError::transaction_outcome_unknown(format!(
                    "Submission of transaction {hash} failed: {error}; reconcile the wallet before retrying."
                )));
            }
            Err(_) => {
                return Err(SdkError::transaction_outcome_unknown(format!(
                    "Submission of transaction {hash} timed out; reconcile the wallet before retrying."
                )));
            }
        }
        *uncertain = None;
        Ok(hash)
    }
}
fn cancelled() -> SdkError {
    SdkError::signing_failed("Contract write was cancelled.")
}
fn transaction(request: &ContractWriteRequest) -> Result<TransactionRequest, SdkError> {
    let value = request
        .value
        .as_ref()
        .map(|value| {
            U256::from_str_radix(&value.to_string(), 10)
                .map_err(|_| SdkError::signing_failed("Transaction value must fit uint256."))
        })
        .transpose()?;
    let gas = request
        .gas
        .as_ref()
        .map(|gas| {
            gas.to_string()
                .parse::<u64>()
                .map_err(|_| SdkError::signing_failed("Transaction gas must fit uint64."))
        })
        .transpose()?;
    Ok(TransactionRequest {
        from: Some(request.account.address),
        to: Some(TxKind::Call(request.address)),
        chain_id: Some(request.account.chain_id),
        input: request.data.clone().into(),
        value,
        gas,
        ..Default::default()
    })
}

#[cfg(test)]
#[path = "alloy_transaction_tests.rs"]
mod tests;
