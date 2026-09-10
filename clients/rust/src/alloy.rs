use crate::{SdkError, Signer, SigningRequest};
use alloy_dyn_abi::eip712::TypedData;
use async_trait::async_trait;

pub struct AlloySigner<S>(S);
impl<S> AlloySigner<S> {
    pub fn new(signer: S) -> Self {
        Self(signer)
    }
}
#[async_trait]
impl<S: alloy_signer::Signer + Send + Sync> Signer for AlloySigner<S> {
    async fn sign_typed_data(&self, request: SigningRequest) -> Result<Vec<u8>, SdkError> {
        if request.account.address != self.0.address() {
            return Err(signing_error(
                "Signer address does not match the requested account.",
            ));
        }
        if self
            .0
            .chain_id()
            .is_some_and(|chain| chain != request.account.chain_id)
        {
            return Err(signing_error(
                "Signer chain ID does not match the requested account.",
            ));
        }
        let typed: TypedData = serde_json::from_value(request.typed_data).map_err(|_| {
            signing_error("The signing request contains invalid EIP-712 typed data.")
        })?;
        let hash = typed.eip712_signing_hash().map_err(|_| {
            signing_error("The signing request cannot be encoded as EIP-712 typed data.")
        })?;
        let signature = self.0.sign_hash(&hash).await.map_err(|_| {
            signing_error("Wallet signing failed. Check the wallet connection and approval.")
        })?;
        Ok(signature.as_bytes().to_vec())
    }
}
fn signing_error(message: &str) -> SdkError {
    SdkError {
        code: "SIGNING_FAILED".into(),
        message: message.into(),
        retryable: false,
        retry_after_seconds: None,
    }
}
