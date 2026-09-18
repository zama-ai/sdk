use crate::{Address, BigInt, SdkError, WalletAccount, generated};

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
    pub value: Option<BigInt>,
    pub gas: Option<BigInt>,
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
        if write.address.len() != 20 {
            return Err(invalid("address must contain 20 bytes"));
        }
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
            address: Address::from_slice(&write.address),
            data: write.data,
            abi,
            function_name: write.function_name,
            args,
            value: decimal(write.value).map_err(invalid)?,
            gas: decimal(write.gas).map_err(invalid)?,
        })
    }
}
fn decimal(value: Option<String>) -> Result<Option<BigInt>, &'static str> {
    value
        .map(|value| {
            let integer: BigInt = value.parse().map_err(|_| "invalid transaction integer")?;
            if integer.to_string() != value {
                return Err("noncanonical transaction integer");
            }
            Ok(integer)
        })
        .transpose()
}
