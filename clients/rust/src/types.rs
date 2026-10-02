use crate::{Address, B256, ClientError, ErrorKind, Result, generated};
use num_bigint::BigInt;
use std::collections::HashMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WalletAccount {
    pub address: Address,
    pub chain_id: u64,
}
impl From<WalletAccount> for generated::WalletAccount {
    fn from(value: WalletAccount) -> Self {
        Self {
            address: value.address.to_vec(),
            chain_id: value.chain_id,
        }
    }
}
impl TryFrom<generated::WalletAccount> for WalletAccount {
    type Error = ClientError;
    fn try_from(value: generated::WalletAccount) -> Result<Self> {
        Ok(Self {
            address: address(&value.address, "invalid signer account address")?,
            chain_id: value.chain_id,
        })
    }
}
#[derive(Clone, Copy, Debug)]
pub enum SignerConfig {
    Disabled,
    Enabled(Option<WalletAccount>),
}

#[derive(Clone, Copy, Debug)]
pub struct EncryptedInput {
    pub encrypted_value: B256,
    pub contract_address: Address,
}
impl From<EncryptedInput> for generated::EncryptedInput {
    fn from(value: EncryptedInput) -> Self {
        Self {
            encrypted_value: value.encrypted_value.to_vec(),
            contract_address: value.contract_address.to_vec(),
        }
    }
}
#[derive(Clone, Debug, PartialEq)]
pub enum ClearValue {
    BigInt(BigInt),
    Number(u32),
    Bool(bool),
    String(String),
    Undefined,
}
pub type ClearValues = HashMap<B256, ClearValue>;
impl TryFrom<generated::ClearValue> for ClearValue {
    type Error = ClientError;
    fn try_from(value: generated::ClearValue) -> Result<Self> {
        use generated::clear_value::Value;
        Ok(match value.value {
            Some(Value::BigintValue(value)) => {
                let integer: BigInt = value.parse().map_err(|error| {
                    ClientError::with_source(ErrorKind::Protocol, "invalid bigint encoding", error)
                })?;
                if integer.to_string() != value {
                    return Err(ClientError::protocol("noncanonical bigint encoding"));
                }
                Self::BigInt(integer)
            }
            Some(Value::BoolValue(value)) => Self::Bool(value),
            Some(Value::NumberValue(value)) => Self::Number(value),
            Some(Value::StringValue(value)) => Self::String(value),
            Some(Value::UndefinedValue(_)) => Self::Undefined,
            _ => return Err(ClientError::protocol("missing or invalid clear value")),
        })
    }
}
pub(crate) fn word(bytes: &[u8], name: &str) -> Result<B256> {
    if bytes.len() != 32 {
        return Err(ClientError::protocol(format!("invalid {name} length")));
    }
    Ok(B256::from_slice(bytes))
}
/// Decodes wire bytes into an address, or bails with `message` when the length is wrong.
/// `Address::from_slice` panics on malformed input, so every wire decode site must go through this.
pub(crate) fn address(bytes: &[u8], message: &str) -> Result<Address> {
    if bytes.len() != 20 {
        return Err(ClientError::protocol(message));
    }
    Ok(Address::from_slice(bytes))
}
pub(crate) fn handle(bytes: &[u8]) -> Result<B256> {
    word(bytes, "encrypted handle")
}
pub(crate) fn clear_values(entries: Vec<generated::ClearEntry>) -> Result<ClearValues> {
    let mut values = HashMap::new();
    for entry in entries {
        let key = handle(&entry.encrypted_value)?;
        let value = entry
            .value
            .ok_or_else(|| ClientError::protocol("missing clear value"))?
            .try_into()?;
        if values.insert(key, value).is_some() {
            return Err(ClientError::protocol("duplicate clear value handle"));
        }
    }
    Ok(values)
}
