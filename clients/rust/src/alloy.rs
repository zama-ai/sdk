mod transactions;
pub use transactions::{AlloyWallet, DEFAULT_BROADCAST_TIMEOUT};

use crate::{Address, SdkError, Signer, SigningRequest, WalletAccount};
use alloy_dyn_abi::eip712::TypedData;
use async_trait::async_trait;

pub struct AlloySigner<S>(S);
impl<S> AlloySigner<S> {
    pub fn new(signer: S) -> Self {
        Self(signer)
    }
}
impl<S: alloy_signer::Signer> AlloySigner<S> {
    /// The compared address is a parameter because the write path signs with the provider's wallet.
    fn ensure_account(
        &self,
        account: &WalletAccount,
        address: Address,
        address_mismatch: &str,
    ) -> Result<(), SdkError> {
        if account.address != address {
            return Err(SdkError::signing_failed(address_mismatch));
        }
        if self
            .0
            .chain_id()
            .is_some_and(|chain| chain != account.chain_id)
        {
            return Err(SdkError::chain_mismatch(
                "Signer chain ID does not match the requested account.",
            ));
        }
        Ok(())
    }
}
#[async_trait]
impl<S: alloy_signer::Signer + Send + Sync> Signer for AlloySigner<S> {
    async fn sign_typed_data(&self, request: SigningRequest) -> Result<Vec<u8>, SdkError> {
        self.ensure_account(
            &request.account,
            self.0.address(),
            "Signer address does not match the requested account.",
        )?;
        let typed: TypedData = serde_json::from_value(request.typed_data).map_err(|_| {
            SdkError::signing_failed("The signing request contains invalid EIP-712 typed data.")
        })?;
        let hash = typed.eip712_signing_hash().map_err(|_| {
            SdkError::signing_failed("The signing request cannot be encoded as EIP-712 typed data.")
        })?;
        let signature = self.0.sign_hash(&hash).await.map_err(map_signer_error)?;
        Ok(signature.as_bytes().to_vec())
    }
}

fn map_signer_error(error: alloy_signer::Error) -> SdkError {
    match error {
        alloy_signer::Error::Other(error) => match error.downcast::<SdkError>() {
            Ok(error) => *error,
            Err(error) => SdkError::signing_failed(error.to_string()),
        },
        alloy_signer::Error::TransactionChainIdMismatch { signer, tx } => SdkError::chain_mismatch(
            format!("Transaction chain ID {tx} does not match signer chain ID {signer}."),
        ),
        error => SdkError::signing_failed(error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generic_alloy_errors_are_signing_failures_with_original_detail() {
        let error = map_signer_error(alloy_signer::Error::message("wallet transport failed"));

        assert_eq!(error.code, "SIGNING_FAILED");
        assert_eq!(error.message, "wallet transport failed");
        assert!(!error.retryable);
        assert_eq!(error.retry_after_seconds, None);
    }

    #[test]
    fn alloy_chain_mismatch_is_structured() {
        let error =
            map_signer_error(alloy_signer::Error::TransactionChainIdMismatch { signer: 1, tx: 2 });

        assert_eq!(error.code, "CHAIN_MISMATCH");
        assert!(error.message.contains('1'));
        assert!(error.message.contains('2'));
    }

    struct ChainSigner {
        chain_id: Option<u64>,
    }

    #[async_trait::async_trait]
    impl alloy_signer::Signer for ChainSigner {
        async fn sign_hash(
            &self,
            _hash: &alloy_primitives::B256,
        ) -> alloy_signer::Result<alloy_primitives::Signature> {
            unreachable!()
        }

        fn address(&self) -> Address {
            Address::repeat_byte(1)
        }

        fn chain_id(&self) -> Option<u64> {
            self.chain_id
        }

        fn set_chain_id(&mut self, chain_id: Option<u64>) {
            self.chain_id = chain_id;
        }
    }

    #[tokio::test]
    async fn configured_signer_chain_mismatch_is_structured() {
        let signer = AlloySigner::new(ChainSigner { chain_id: Some(2) });
        let error = crate::Signer::sign_typed_data(
            &signer,
            SigningRequest {
                operation_id: "operation".into(),
                action_id: "action".into(),
                account: crate::WalletAccount {
                    address: Address::repeat_byte(1),
                    chain_id: 1,
                },
                typed_data: serde_json::json!({}),
            },
        )
        .await
        .unwrap_err();

        assert_eq!(error.code, "CHAIN_MISMATCH");
    }
}
