use crate::{
    Address, B256, ClearValue, ClearValues, EncryptedInput, Sdk, SdkError,
    types::{clear_values, handle},
};
use anyhow::{Result, ensure};

pub struct Decryption(pub(crate) Sdk);
#[derive(Clone, Copy, Debug, Default)]
pub struct DelegatedOptions {
    pub account_address: Option<Address>,
    pub wait_for_propagation: Option<bool>,
}
#[derive(Clone, Copy, Debug, Default)]
pub struct DelegatedBatchOptions {
    pub account_address: Option<Address>,
    pub wait_for_propagation: Option<bool>,
    pub max_concurrency: Option<f64>,
}
#[derive(Debug)]
pub struct PublicDecryption {
    pub clear_values: ClearValues,
    pub abi_encoded_clear_values: Vec<u8>,
    pub decryption_proof: Vec<u8>,
}
#[derive(Debug)]
pub struct BatchItem {
    pub encrypted_value: B256,
    pub contract_address: Address,
    pub result: Result<ClearValue, SdkError>,
}

impl Decryption {
    pub async fn decrypt_values(
        &self,
        inputs: &[EncryptedInput],
        timeout_ms: Option<f64>,
    ) -> Result<ClearValues> {
        let response = rpc!(
            &self.0,
            decrypt_values,
            DecryptValuesRequest {
                inputs: inputs.iter().copied().map(Into::into).collect(),
                timeout_ms,
            }
        )
        .await?;
        clear_values(response.values)
    }
    pub async fn delegated_decrypt_values(
        &self,
        inputs: &[EncryptedInput],
        delegator: Address,
        options: DelegatedOptions,
    ) -> Result<ClearValues> {
        let response = rpc!(
            &self.0,
            delegated_decrypt_values,
            DelegatedDecryptValuesRequest {
                inputs: inputs.iter().copied().map(Into::into).collect(),
                delegator_address: delegator.to_vec(),
                account_address: options.account_address.map(|a| a.to_vec()),
                wait_for_propagation: options.wait_for_propagation,
            }
        )
        .await?;
        clear_values(response.values)
    }
    pub async fn decrypt_public_values(
        &self,
        encrypted_values: &[B256],
        timeout_ms: Option<f64>,
    ) -> Result<PublicDecryption> {
        let response = rpc!(
            &self.0,
            decrypt_public_values,
            DecryptPublicValuesRequest {
                encrypted_values: encrypted_values.iter().map(|v| v.to_vec()).collect(),
                timeout_ms,
            }
        )
        .await?;
        Ok(PublicDecryption {
            clear_values: clear_values(response.values)?,
            abi_encoded_clear_values: response.abi_encoded_clear_values,
            decryption_proof: response.decryption_proof,
        })
    }
    pub async fn delegated_batch_decrypt_values(
        &self,
        inputs: &[EncryptedInput],
        delegator: Address,
        options: DelegatedBatchOptions,
    ) -> Result<Vec<BatchItem>> {
        let response = rpc!(
            &self.0,
            delegated_batch_decrypt_values,
            DelegatedBatchDecryptValuesRequest {
                inputs: inputs.iter().copied().map(Into::into).collect(),
                delegator_address: delegator.to_vec(),
                account_address: options.account_address.map(|a| a.to_vec()),
                max_concurrency: options.max_concurrency,
                wait_for_propagation: options.wait_for_propagation,
            }
        )
        .await?;
        response
            .items
            .into_iter()
            .map(|item| {
                ensure!(
                    item.contract_address.len() == 20,
                    "invalid batch contract address"
                );
                let result = match (item.value, item.error) {
                    (Some(value), None) => Ok(value.try_into()?),
                    (None, Some(error)) => Err(error.into()),
                    _ => anyhow::bail!("invalid batch result"),
                };
                Ok(BatchItem {
                    encrypted_value: handle(&item.encrypted_value)?,
                    contract_address: Address::from_slice(&item.contract_address),
                    result,
                })
            })
            .collect()
    }
}
