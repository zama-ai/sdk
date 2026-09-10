use crate::{Address, B256, generated};
use anyhow::{Result, ensure};
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
    type Error = anyhow::Error;
    fn try_from(value: generated::WalletAccount) -> Result<Self> {
        ensure!(value.address.len() == 20, "invalid signer account address");
        Ok(Self {
            address: Address::from_slice(&value.address),
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
    Number(f64),
    Bool(bool),
    String(String),
    Undefined,
}
pub type ClearValues = HashMap<B256, ClearValue>;
impl TryFrom<generated::ClearValue> for ClearValue {
    type Error = anyhow::Error;
    fn try_from(value: generated::ClearValue) -> Result<Self> {
        use generated::clear_value::Value;
        Ok(match value.value {
            Some(Value::BigintValue(value)) => {
                let integer: BigInt = value.parse()?;
                ensure!(integer.to_string() == value, "noncanonical bigint encoding");
                Self::BigInt(integer)
            }
            Some(Value::BoolValue(value)) => Self::Bool(value),
            Some(Value::NumberValue(value)) => Self::Number(value),
            Some(Value::StringValue(value)) => Self::String(value),
            Some(Value::UndefinedValue(_)) => Self::Undefined,
            _ => anyhow::bail!("missing or invalid clear value"),
        })
    }
}
pub(crate) fn handle(bytes: &[u8]) -> Result<B256> {
    ensure!(bytes.len() == 32, "invalid encrypted handle length");
    Ok(B256::from_slice(bytes))
}
pub(crate) fn clear_values(entries: Vec<generated::ClearEntry>) -> Result<ClearValues> {
    let mut values = HashMap::new();
    for entry in entries {
        let key = handle(&entry.encrypted_value)?;
        let value = entry
            .value
            .ok_or_else(|| anyhow::anyhow!("missing clear value"))?
            .try_into()?;
        ensure!(
            values.insert(key, value).is_none(),
            "duplicate clear value handle"
        );
    }
    Ok(values)
}
