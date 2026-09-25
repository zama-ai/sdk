use crate::{Address, B256, BigInt, Sdk, generated, types::handle};
use crate::{ClientError, Result};

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

#[derive(Clone, Copy, Debug, Default)]
pub struct EncryptOptions {
    /// Relayer timeout, not the RPC deadline; None keeps the SDK default.
    pub timeout_ms: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EncryptResult {
    pub encrypted_values: Vec<B256>,
    pub input_proof: Vec<u8>,
}

impl From<&EncryptInput> for generated::EncryptInput {
    fn from(input: &EncryptInput) -> Self {
        use generated::encrypt_input::Value;
        let value = match input {
            EncryptInput::Bool(value) => Value::Ebool(*value),
            EncryptInput::BoolBigInt(value) => Value::EboolBigint(value.to_string()),
            EncryptInput::Uint8(value) => Value::Euint8(value.to_string()),
            EncryptInput::Uint16(value) => Value::Euint16(value.to_string()),
            EncryptInput::Uint32(value) => Value::Euint32(value.to_string()),
            EncryptInput::Uint64(value) => Value::Euint64(value.to_string()),
            EncryptInput::Uint128(value) => Value::Euint128(value.to_string()),
            EncryptInput::Uint256(value) => Value::Euint256(value.to_string()),
            EncryptInput::Address(value) => Value::Eaddress(value.to_vec()),
        };
        Self { value: Some(value) }
    }
}

impl Sdk {
    pub async fn encrypt(
        &self,
        params: EncryptParams<'_>,
        options: EncryptOptions,
    ) -> Result<EncryptResult> {
        let response = rpc!(
            self,
            encrypt,
            EncryptRequest {
                values: params.values.iter().map(Into::into).collect(),
                contract_address: params.contract_address.to_vec(),
                user_address: params.user_address.to_vec(),
                timeout_ms: options.timeout_ms,
            }
        )
        .await?;
        if response.encrypted_values.len() != params.values.len() {
            return Err(ClientError::protocol(
                "encrypted value count does not match inputs",
            ));
        }
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
