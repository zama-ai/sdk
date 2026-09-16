use crate::{Address, Sdk, generated};
use anyhow::Result;

pub struct Permits(pub(crate) Sdk);
pub struct Offline(pub(crate) Sdk);
pub struct PreparePermit<'a> {
    pub signer: Address,
    pub contracts: &'a [Address],
    pub delegator: Option<Address>,
    pub duration_days: Option<u32>,
}
fn addresses(values: &[Address]) -> Vec<Vec<u8>> {
    values.iter().map(|a| a.to_vec()).collect()
}

#[derive(Clone, Debug)]
pub struct PreparedPermit {
    pub envelope: Vec<u8>,
    pub typed_data: serde_json::Value,
}

impl Offline {
    pub async fn prepare_permit(&self, request: PreparePermit<'_>) -> Result<PreparedPermit> {
        let response = rpc!(
            &self.0,
            prepare_permit,
            PreparePermitRequest {
                signer_address: request.signer.to_vec(),
                contract_addresses: addresses(request.contracts),
                delegator_address: request.delegator.map(|a| a.to_vec()),
                duration_days: request.duration_days,
            }
        )
        .await?;
        Ok(PreparedPermit {
            envelope: response.prepared_permit,
            typed_data: serde_json::from_str(&response.typed_data_json)?,
        })
    }
}
impl Permits {
    pub async fn register_permit(&self, prepared_permit: &[u8], signature: &[u8]) -> Result<()> {
        rpc!(
            &self.0,
            register_permit,
            RegisterPermitRequest {
                prepared_permit: prepared_permit.into(),
                signature: signature.to_vec(),
            }
        )
        .await?;
        Ok(())
    }
    pub async fn grant_permit(&self, contracts: &[Address]) -> Result<()> {
        rpc!(
            &self.0,
            grant_permit,
            ContractsRequest {
                contract_addresses: addresses(contracts),
            }
        )
        .await?;
        Ok(())
    }
    pub async fn grant_delegation_permit(
        &self,
        delegator: Address,
        contracts: &[Address],
    ) -> Result<()> {
        rpc!(
            &self.0,
            grant_delegation_permit,
            DelegationContractsRequest {
                delegator_address: delegator.to_vec(),
                contract_addresses: addresses(contracts),
            }
        )
        .await?;
        Ok(())
    }
    pub async fn has_permit(&self, contracts: &[Address]) -> Result<bool> {
        Ok(rpc!(
            &self.0,
            has_permit,
            ContractsRequest {
                contract_addresses: addresses(contracts),
            }
        )
        .await?
        .has_permit)
    }
    pub async fn has_delegation_permit(
        &self,
        delegator: Address,
        contracts: &[Address],
    ) -> Result<bool> {
        Ok(rpc!(
            &self.0,
            has_delegation_permit,
            DelegationContractsRequest {
                delegator_address: delegator.to_vec(),
                contract_addresses: addresses(contracts),
            }
        )
        .await?
        .has_permit)
    }
    pub async fn revoke_permits(&self, contracts: Option<&[Address]>) -> Result<()> {
        rpc!(
            &self.0,
            revoke_permits,
            RevokePermitsRequest {
                contracts: contracts.map(|values| generated::ContractList {
                    addresses: addresses(values),
                }),
            }
        )
        .await?;
        Ok(())
    }
    pub async fn clear(&self) -> Result<()> {
        rpc!(&self.0, clear_permits, OperationRequest {}).await?;
        Ok(())
    }
    pub async fn warm_transport_key_pair(&self) -> Result<()> {
        rpc!(&self.0, warm_transport_key_pair, OperationRequest {}).await?;
        Ok(())
    }
    pub async fn warm_transport_key_pair_scope(&self, scope: &str) -> Result<()> {
        rpc!(
            &self.0,
            warm_transport_key_pair_scope,
            ScopeRequest {
                scope_id: scope.into(),
            }
        )
        .await?;
        Ok(())
    }
    pub async fn revoke_transport_key_pair(&self, scope: &str) -> Result<()> {
        rpc!(
            &self.0,
            revoke_transport_key_pair,
            ScopeRequest {
                scope_id: scope.into(),
            }
        )
        .await?;
        Ok(())
    }
}
