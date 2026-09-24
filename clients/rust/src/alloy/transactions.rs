use crate::{B256, ContractWriteRequest, SdkError, Signer, SigningRequest, alloy::AlloySigner};
use alloy_primitives::{TxKind, U256};
use alloy_provider::transport::TransportError;
use alloy_provider::{
    Provider, SendableTx, WalletProvider,
    fillers::{FillProvider, TxFiller},
};
use alloy_rpc_types_eth::TransactionRequest;
use std::time::Duration;
use tokio_util::sync::CancellationToken;

/// Bounds a send that the caller's cancellation is no longer allowed to stop.
pub const DEFAULT_BROADCAST_TIMEOUT: Duration = Duration::from_secs(30);

/// EIP-712 signing plus contract writes through one Alloy wallet provider: the EIP-712 signer and
/// the provider's wallet must hold the same key.
pub struct AlloyWallet<S, F, P>
where
    F: TxFiller,
    P: Provider,
{
    signer: AlloySigner<S>,
    provider: FillProvider<F, P>,
    broadcast_timeout: Duration,
}
impl<S> AlloySigner<S> {
    pub fn with_transactions<F, P>(self, provider: FillProvider<F, P>) -> AlloyWallet<S, F, P>
    where
        F: TxFiller,
        P: Provider,
    {
        AlloyWallet {
            signer: self,
            provider,
            broadcast_timeout: DEFAULT_BROADCAST_TIMEOUT,
        }
    }
}
impl<S, F, P> AlloyWallet<S, F, P>
where
    F: TxFiller,
    P: Provider,
{
    /// A zero timeout keeps [`DEFAULT_BROADCAST_TIMEOUT`].
    pub fn broadcast_timeout(mut self, timeout: Duration) -> Self {
        if !timeout.is_zero() {
            self.broadcast_timeout = timeout;
        }
        self
    }
}
#[async_trait::async_trait]
impl<S, F, P> Signer for AlloyWallet<S, F, P>
where
    S: alloy_signer::Signer + Send + Sync,
    F: TxFiller,
    P: Provider,
    FillProvider<F, P>: WalletProvider,
{
    async fn sign_typed_data(&self, request: SigningRequest) -> Result<Vec<u8>, SdkError> {
        self.signer.sign_typed_data(request).await
    }
    async fn write_contract(
        &self,
        request: ContractWriteRequest,
        cancel: CancellationToken,
    ) -> Result<B256, SdkError> {
        if cancel.is_cancelled() {
            return Err(cancelled());
        }
        self.signer.ensure_account(
            &request.account,
            self.provider.default_signer_address(),
            "Wallet does not control the requested account.",
        )?;
        let transaction = transaction(&request)?;
        // Filling and signing happen before broadcast, so their failures are certain.
        let envelope = match self.provider.fill(transaction).await {
            Ok(SendableTx::Envelope(envelope)) => envelope,
            Ok(SendableTx::Builder(_)) => {
                return Err(SdkError::signing_failed(
                    "Wallet provider did not sign the transaction.",
                ));
            }
            Err(error) => {
                return Err(match revert_data(&error) {
                    Some(data) => SdkError::execution_reverted(
                        format!("Cannot prepare the transaction: {error}"),
                        data,
                    ),
                    None => {
                        SdkError::signing_failed(format!("Cannot prepare the transaction: {error}"))
                    }
                });
            }
        };
        if cancel.is_cancelled() {
            return Err(cancelled());
        }
        let hash = *envelope.tx_hash();
        // Cancellation cannot recall a broadcast, so the send runs to its own timeout.
        match tokio::time::timeout(
            self.broadcast_timeout,
            self.provider.send_tx_envelope(envelope),
        )
        .await
        {
            Ok(Ok(_)) => Ok(hash),
            Ok(Err(error)) => Err(SdkError::transaction_outcome_unknown(format!(
                "Submission of transaction {hash} failed: {error}; reconcile the wallet before retrying."
            ))),
            Err(_) => Err(SdkError::transaction_outcome_unknown(format!(
                "Submission of transaction {hash} timed out; reconcile the wallet before retrying."
            ))),
        }
    }
}
fn cancelled() -> SdkError {
    SdkError::signing_failed("Contract write was cancelled.")
}
/// Some when the node rejected the transaction during simulation or gas estimation; the bytes
/// are the raw revert return data, empty when the node did not provide any.
/// Code 3 is geth's dedicated revert code; the message check is anchored to a prefix so an
/// unrelated error carrying "execution reverted" mid-message is not misclassified.
fn revert_data(error: &TransportError) -> Option<Vec<u8>> {
    let payload = error.as_error_resp()?;
    let data = payload.data.as_ref().and_then(|raw| {
        let text = serde_json::from_str::<String>(raw.get()).ok()?;
        let hex = text.strip_prefix("0x")?;
        alloy_primitives::hex::decode(hex).ok()
    });
    let is_revert_message = payload
        .message
        .to_lowercase()
        .starts_with("execution reverted");
    (payload.code == 3 || is_revert_message).then(|| data.unwrap_or_default())
}
fn transaction(request: &ContractWriteRequest) -> Result<TransactionRequest, SdkError> {
    let value = request
        .value
        .as_ref()
        .map(|value| {
            value
                .to_biguint()
                .and_then(|value| U256::try_from_be_slice(&value.to_bytes_be()))
                .ok_or_else(|| SdkError::signing_failed("Transaction value must fit uint256."))
        })
        .transpose()?;
    let gas = request
        .gas
        .as_ref()
        .map(|gas| {
            u64::try_from(gas)
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
mod tests;
