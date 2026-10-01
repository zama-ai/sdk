use crate::{Address, B256, ClientError, SdkError, U256, WalletAccount, generated, types::word};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TransactionResult {
    pub transaction_hash: B256,
    pub logs: Vec<TransactionLog>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TransactionLog {
    /// Absent when the provider adapter omits the log emitter.
    pub address: Option<Address>,
    pub topics: Vec<B256>,
    pub data: Vec<u8>,
}

pub(crate) fn transaction_log(log: generated::TransactionLog) -> crate::Result<TransactionLog> {
    let address = log
        .address
        .filter(|bytes| !bytes.is_empty())
        .map(|bytes| crate::types::address(&bytes, "invalid log address length"))
        .transpose()?;
    let topics = log
        .topics
        .iter()
        .map(|topic| word(topic, "transaction log topic"))
        .collect::<crate::Result<_>>()?;
    Ok(TransactionLog {
        address,
        topics,
        data: log.data,
    })
}

pub(crate) fn transaction_result(
    transaction: Option<generated::TransactionResult>,
) -> crate::Result<TransactionResult> {
    let transaction =
        transaction.ok_or_else(|| ClientError::protocol("missing transaction result"))?;
    Ok(TransactionResult {
        transaction_hash: word(&transaction.transaction_hash, "transaction hash")?,
        logs: transaction
            .logs
            .into_iter()
            .map(transaction_log)
            .collect::<crate::Result<_>>()?,
    })
}

#[derive(Clone, Debug)]
pub struct ContractWriteRequest {
    pub operation_id: String,
    pub action_id: String,
    pub account: WalletAccount,
    pub address: Address,
    /// Canonical calldata encoded by the SDK; broadcast these bytes unchanged.
    pub data: Vec<u8>,
    pub abi: serde_json::Value,
    pub function_name: String,
    /// SDK bigint arguments are encoded as canonical decimal strings.
    pub args: serde_json::Value,
    pub value: Option<U256>,
    pub gas: Option<u64>,
}
impl ContractWriteRequest {
    pub(crate) fn from_wire(
        operation_id: String,
        action_id: String,
        account: WalletAccount,
        write: generated::ContractWriteRequest,
    ) -> Result<Self, SdkError> {
        let invalid = |detail: &str| {
            SdkError::signing_failed(format!("Invalid contract write request: {detail}"))
        };
        let address = crate::types::address(&write.address, "address must contain 20 bytes")
            .map_err(|error| invalid(&error.to_string()))?;
        let abi: serde_json::Value =
            serde_json::from_str(&write.abi_json).map_err(|error| invalid(&error.to_string()))?;
        let args: serde_json::Value =
            serde_json::from_str(&write.args_json).map_err(|error| invalid(&error.to_string()))?;
        if !abi.is_array() || !args.is_array() {
            return Err(invalid("ABI and args must be arrays"));
        }
        Ok(Self {
            operation_id,
            action_id,
            account,
            address,
            data: write.data,
            abi,
            function_name: write.function_name,
            args,
            value: decimal(write.value, "transaction value must fit uint256").map_err(invalid)?,
            gas: decimal(write.gas, "transaction gas must fit uint64").map_err(invalid)?,
        })
    }
}
fn decimal<T: std::str::FromStr>(
    value: Option<String>,
    overflow: &'static str,
) -> Result<Option<T>, &'static str> {
    value
        .map(|value| {
            if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
                return Err("invalid transaction integer");
            }
            if value.len() > 1 && value.starts_with('0') {
                return Err("noncanonical transaction integer");
            }
            value.parse().map_err(|_| overflow)
        })
        .transpose()
}

#[cfg(test)]
mod tests;
