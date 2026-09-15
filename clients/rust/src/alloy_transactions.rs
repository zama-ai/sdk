use crate::{B256, ContractWriteRequest, SdkError, Signer, SigningRequest, alloy::AlloySigner};
use alloy_primitives::{TxKind, U256};
use alloy_provider::{
    Provider, SendableTx, WalletProvider,
    fillers::{FillProvider, TxFiller},
    network::{Ethereum, Network},
};
use alloy_rpc_types_eth::TransactionRequest;
use std::future::Future;
use tokio::sync::Mutex;

pub type TxEnvelope = <Ethereum as Network>::TxEnvelope;

/// The application's say over each contract write.
#[async_trait::async_trait]
pub trait WritePolicy: Send + Sync {
    /// Runs before signing; an error stops the write without a broadcast.
    async fn approve(&self, request: &ContractWriteRequest) -> Result<(), SdkError>;
    /// Receives the signed transaction before broadcast. Record it: a cancelled or lost
    /// callback cannot report the hash afterwards.
    fn submitting(&self, _request: &ContractWriteRequest, _transaction: &TxEnvelope) {}
}
#[async_trait::async_trait]
impl<F, Fut> WritePolicy for F
where
    F: Fn(ContractWriteRequest) -> Fut + Send + Sync,
    Fut: Future<Output = Result<(), SdkError>> + Send,
{
    async fn approve(&self, request: &ContractWriteRequest) -> Result<(), SdkError> {
        self(request.clone()).await
    }
}

/// EIP-712 signing plus contract writes through one Alloy wallet provider.
/// Share one wallet for each account and chain so concurrent SDK contexts coordinate nonces.
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
    // Approval runs before the uncertainty gate; the RPC chain is verified right before submission.
    async fn write_contract(&self, request: ContractWriteRequest) -> Result<B256, SdkError> {
        if self.provider.default_signer_address() != request.account.address {
            return Err(SdkError::signing_failed(
                "Wallet does not control the requested account.",
            ));
        }
        let transaction = transaction(&request)?;
        self.policy.approve(&request).await?;
        let mut uncertain = self.uncertain.lock().await;
        if let Some(hash) = *uncertain {
            // This write never reached the RPC; only the earlier submission is uncertain.
            return Err(SdkError::signing_failed(format!(
                "Reconcile uncertain transaction {hash} before sending another."
            )));
        }
        let chain = self
            .provider
            .get_chain_id()
            .await
            .map_err(|_| SdkError::signing_failed("Cannot read the wallet RPC chain ID."))?;
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
        // Dropping the future during submission must leave subsequent writes blocked.
        *uncertain = Some(hash);
        self.provider
            .send_tx_envelope(envelope)
            .await
            .map(drop)
            .map_err(|_| {
                SdkError::transaction_outcome_unknown(format!(
                    "Submission of transaction {hash} failed; reconcile the wallet before retrying."
                ))
            })?;
        *uncertain = None;
        Ok(hash)
    }
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
