use crate::{Address, B256, BigInt, Sdk, generated, types::handle};
use anyhow::Result;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EncryptInput {
    Bool(bool),
    BoolBigInt(BigInt),
    Uint8(BigInt),
    Uint16(BigInt),
    Uint32(BigInt),
    Uint64(BigInt),
    Uint128(BigInt),
    Uint256(BigInt),
    Address(Address),
}

#[derive(Clone, Copy, Debug)]
pub struct EncryptParams<'a> {
    pub values: &'a [EncryptInput],
    pub contract_address: Address,
    pub user_address: Address,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EncryptResult {
    pub encrypted_values: Vec<B256>,
    pub input_proof: Vec<u8>,
}

impl From<&EncryptInput> for generated::EncryptInput {
    fn from(input: &EncryptInput) -> Self {
        use generated::encrypt_input::Value;
        let (kind, value) = match input {
            EncryptInput::Bool(value) => ("ebool", Value::BoolValue(*value)),
            EncryptInput::BoolBigInt(value) => ("ebool", Value::BigintValue(value.to_string())),
            EncryptInput::Uint8(value) => ("euint8", Value::BigintValue(value.to_string())),
            EncryptInput::Uint16(value) => ("euint16", Value::BigintValue(value.to_string())),
            EncryptInput::Uint32(value) => ("euint32", Value::BigintValue(value.to_string())),
            EncryptInput::Uint64(value) => ("euint64", Value::BigintValue(value.to_string())),
            EncryptInput::Uint128(value) => ("euint128", Value::BigintValue(value.to_string())),
            EncryptInput::Uint256(value) => ("euint256", Value::BigintValue(value.to_string())),
            EncryptInput::Address(value) => ("eaddress", Value::AddressValue(value.to_vec())),
        };
        Self {
            r#type: kind.into(),
            value: Some(value),
        }
    }
}

impl Sdk {
    /// Dropping this future cancels the RPC; timeout_ms controls the SDK relayer timeout.
    pub async fn encrypt(
        &self,
        params: EncryptParams<'_>,
        timeout_ms: Option<u32>,
    ) -> Result<EncryptResult> {
        let response = rpc!(
            self,
            encrypt,
            EncryptRequest {
                values: params.values.iter().map(Into::into).collect(),
                contract_address: params.contract_address.to_vec(),
                user_address: params.user_address.to_vec(),
                timeout_ms,
            }
        )
        .await?;
        Ok(EncryptResult {
            encrypted_values: response
                .encrypted_values
                .iter()
                .map(|value| handle(value))
                .collect::<Result<_>>()?,
            input_proof: response.input_proof,
        })
    }
}
