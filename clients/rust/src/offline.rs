use crate::{Address, BigInt, Offline, generated};
use anyhow::{Context, Result, bail};

#[derive(Clone, Debug)]
pub struct PrepareTransaction {
    pub from: Address,
    pub transaction: Transaction,
}

#[derive(Clone, Debug)]
pub enum Transaction {
    ConfidentialTransfer {
        token: Address,
        to: Address,
        amount: BigInt,
    },
    ConfidentialTransferFrom {
        token: Address,
        owner: Address,
        to: Address,
        amount: BigInt,
    },
    SetOperator {
        token: Address,
        operator: Address,
        /// Unix timestamp in whole seconds; a positive past value revokes the operator.
        until: u64,
    },
    Unwrap {
        token: Address,
        to: Address,
        amount: BigInt,
    },
    UnwrapAll {
        token: Address,
        to: Address,
    },
    FinalizeUnwrap {
        wrapper: Address,
        unwrap_request_id_or_amount: Vec<u8>,
    },
    ApproveUnderlying {
        underlying: Address,
        spender: Address,
        amount: BigInt,
    },
    Wrap {
        wrapper: Address,
        to: Address,
        amount: BigInt,
    },
    TransferAndCall {
        underlying: Address,
        wrapper: Address,
        amount: BigInt,
        recipient_data: Option<Vec<u8>>,
    },
    DelegateDecryption {
        contract_address: Address,
        delegate_address: Address,
        /// Unix time in whole milliseconds; omission grants permanent delegation.
        expiration_date_ms: Option<u64>,
    },
    RevokeDelegation {
        contract_address: Address,
        delegate_address: Address,
    },
}

#[derive(Clone, Debug, Default)]
pub struct PrepareOptions {
    pub nonce: Option<u64>,
    pub gas_limit: Option<BigInt>,
    pub fees: Option<PrepareFees>,
}

#[derive(Clone, Debug)]
pub struct PrepareFees {
    pub max_fee_per_gas: BigInt,
    pub max_priority_fee_per_gas: BigInt,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TransactionKind {
    ConfidentialTransfer,
    ConfidentialTransferFrom,
    SetOperator,
    Unwrap,
    UnwrapAll,
    FinalizeUnwrap,
    ApproveUnderlying,
    Wrap,
    TransferAndCall,
    DelegateDecryption,
    RevokeDelegation,
}

impl TryFrom<i32> for TransactionKind {
    type Error = anyhow::Error;

    fn try_from(value: i32) -> Result<Self> {
        let Ok(kind) = generated::TransactionKind::try_from(value) else {
            bail!("unknown prepared transaction kind");
        };
        Ok(match kind {
            generated::TransactionKind::Unspecified => {
                bail!("unspecified prepared transaction kind")
            }
            generated::TransactionKind::ConfidentialTransfer => Self::ConfidentialTransfer,
            generated::TransactionKind::ConfidentialTransferFrom => Self::ConfidentialTransferFrom,
            generated::TransactionKind::SetOperator => Self::SetOperator,
            generated::TransactionKind::Unwrap => Self::Unwrap,
            generated::TransactionKind::UnwrapAll => Self::UnwrapAll,
            generated::TransactionKind::FinalizeUnwrap => Self::FinalizeUnwrap,
            generated::TransactionKind::ApproveUnderlying => Self::ApproveUnderlying,
            generated::TransactionKind::Wrap => Self::Wrap,
            generated::TransactionKind::TransferAndCall => Self::TransferAndCall,
            generated::TransactionKind::DelegateDecryption => Self::DelegateDecryption,
            generated::TransactionKind::RevokeDelegation => Self::RevokeDelegation,
        })
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PreparedTransaction {
    pub kind: TransactionKind,
    pub from: Address,
    pub unsigned_tx: Vec<u8>,
}

impl Offline {
    /// Prepares through the SDK; the caller owns signing and broadcasting the returned bytes.
    pub async fn prepare(
        &self,
        request: PrepareTransaction,
        options: Option<PrepareOptions>,
    ) -> Result<PreparedTransaction> {
        let result = rpc!(
            &self.0,
            prepare_transaction,
            PrepareTransactionRequest {
                from: request.from.to_vec(),
                transaction: Some(request.transaction.into()),
                options: options.map(Into::into),
            }
        )
        .await?;
        Ok(PreparedTransaction {
            kind: TransactionKind::try_from(result.kind)?,
            from: Address::try_from(result.from.as_slice())
                .context("invalid prepared sender address")?,
            unsigned_tx: result.unsigned_tx,
        })
    }
}

impl From<PrepareOptions> for generated::PrepareOptions {
    fn from(value: PrepareOptions) -> Self {
        Self {
            nonce: value.nonce,
            gas_limit: value.gas_limit.map(|n| n.to_string()),
            fees: value.fees.map(|fees| generated::PrepareFees {
                max_fee_per_gas: fees.max_fee_per_gas.to_string(),
                max_priority_fee_per_gas: fees.max_priority_fee_per_gas.to_string(),
            }),
        }
    }
}

impl From<Transaction> for generated::prepare_transaction_request::Transaction {
    fn from(value: Transaction) -> Self {
        match value {
            Transaction::ConfidentialTransfer { token, to, amount } => {
                Self::ConfidentialTransfer(generated::ConfidentialTransfer {
                    token: token.to_vec(),
                    to: to.to_vec(),
                    amount: amount.to_string(),
                })
            }
            Transaction::ConfidentialTransferFrom {
                token,
                owner,
                to,
                amount,
            } => Self::ConfidentialTransferFrom(generated::ConfidentialTransferFrom {
                token: token.to_vec(),
                owner: owner.to_vec(),
                to: to.to_vec(),
                amount: amount.to_string(),
            }),
            Transaction::SetOperator {
                token,
                operator,
                until,
            } => Self::SetOperator(generated::SetOperator {
                token: token.to_vec(),
                operator: operator.to_vec(),
                until: Some(until),
            }),
            Transaction::Unwrap { token, to, amount } => Self::Unwrap(generated::Unwrap {
                token: token.to_vec(),
                to: to.to_vec(),
                amount: amount.to_string(),
            }),
            Transaction::UnwrapAll { token, to } => Self::UnwrapAll(generated::UnwrapAll {
                token: token.to_vec(),
                to: to.to_vec(),
            }),
            Transaction::FinalizeUnwrap {
                wrapper,
                unwrap_request_id_or_amount,
            } => Self::FinalizeUnwrap(generated::FinalizeUnwrap {
                wrapper: wrapper.to_vec(),
                unwrap_request_id_or_amount,
            }),
            Transaction::ApproveUnderlying {
                underlying,
                spender,
                amount,
            } => Self::ApproveUnderlying(generated::ApproveUnderlying {
                underlying: underlying.to_vec(),
                spender: spender.to_vec(),
                amount: amount.to_string(),
            }),
            Transaction::Wrap {
                wrapper,
                to,
                amount,
            } => Self::Wrap(generated::Wrap {
                wrapper: wrapper.to_vec(),
                to: to.to_vec(),
                amount: amount.to_string(),
            }),
            Transaction::TransferAndCall {
                underlying,
                wrapper,
                amount,
                recipient_data,
            } => Self::TransferAndCall(generated::TransferAndCall {
                underlying: underlying.to_vec(),
                wrapper: wrapper.to_vec(),
                amount: amount.to_string(),
                recipient_data,
            }),
            Transaction::DelegateDecryption {
                contract_address,
                delegate_address,
                expiration_date_ms,
            } => Self::DelegateDecryption(generated::DelegateDecryption {
                contract_address: contract_address.to_vec(),
                delegate_address: delegate_address.to_vec(),
                expiration_date_ms,
            }),
            Transaction::RevokeDelegation {
                contract_address,
                delegate_address,
            } => Self::RevokeDelegation(generated::RevokeDelegation {
                contract_address: contract_address.to_vec(),
                delegate_address: delegate_address.to_vec(),
            }),
        }
    }
}
