use alloy_consensus::{SignableTransaction, TxEip1559};
use alloy_primitives::{hex, keccak256};
use alloy_rlp::Decodable;
use alloy_signer::Signer;
use alloy_signer_local::PrivateKeySigner;
use anyhow::{Result, ensure};
use zama_sdk_sidecar::{
    Address, PrepareTransaction, Sdk, Transaction, TransactionKind, WalletAccount,
};

pub async fn prepare_and_sign(
    sdk: &Sdk,
    signer: &PrivateKeySigner,
    account: WalletAccount,
    token: Address,
) -> Result<()> {
    let prepared = sdk
        .offline()
        .prepare(
            PrepareTransaction {
                from: account.address,
                transaction: Transaction::SetOperator {
                    token,
                    operator: Address::repeat_byte(0x11),
                    until: 1,
                },
            },
            None,
        )
        .await?;
    ensure!(
        prepared.kind == TransactionKind::SetOperator,
        "unexpected prepared kind"
    );
    ensure!(
        prepared.from == signer.address(),
        "prepared sender does not match signing key"
    );
    let signed_bytes = sign_prepared(&prepared.unsigned_tx, account.chain_id, signer).await?;
    println!(
        "Prepared operator revocation and signed locally: 0x{}",
        hex::encode(&signed_bytes)
    );
    println!("Signed transaction hash: {:#x}", keccak256(&signed_bytes));
    println!("Not broadcast. The caller owns submission of the signed bytes to its RPC provider.");
    Ok(())
}

async fn sign_prepared(
    unsigned: &[u8],
    chain_id: u64,
    signer: &PrivateKeySigner,
) -> Result<Vec<u8>> {
    ensure!(
        unsigned.first() == Some(&2),
        "expected EIP-1559 transaction"
    );
    let mut payload = &unsigned[1..];
    let transaction = TxEip1559::decode(&mut payload)?;
    ensure!(payload.is_empty(), "trailing unsigned transaction bytes");
    ensure!(
        transaction.chain_id == chain_id,
        "prepared transaction chain mismatch"
    );
    let signature = signer.sign_hash(&transaction.signature_hash()).await?;
    let mut encoded = Vec::new();
    transaction
        .into_signed(signature)
        .eip2718_encode(&mut encoded);
    Ok(encoded)
}

#[cfg(test)]
mod tests {
    use super::*;
    use zama_sdk_sidecar::B256;

    #[tokio::test]
    async fn signs_sdk_unsigned_rlp_and_rejects_wrong_chain() {
        let signer: PrivateKeySigner = B256::repeat_byte(7).to_string().parse().unwrap();
        let tx = TxEip1559 {
            chain_id: 11155111,
            nonce: 3,
            gas_limit: 21000,
            ..Default::default()
        };
        let mut unsigned = Vec::new();
        tx.encode_for_signing(&mut unsigned);
        let signed = sign_prepared(&unsigned, tx.chain_id, &signer)
            .await
            .unwrap();
        let decoded =
            alloy_consensus::Signed::<TxEip1559>::eip2718_decode(&mut signed.as_slice()).unwrap();
        assert_eq!(decoded.tx(), &tx);
        assert_eq!(
            decoded
                .signature()
                .recover_address_from_prehash(&tx.signature_hash())
                .unwrap(),
            signer.address()
        );
        assert!(sign_prepared(&unsigned, 1, &signer).await.is_err());
        unsigned.push(0);
        assert!(
            sign_prepared(&unsigned, tx.chain_id, &signer)
                .await
                .is_err()
        );
    }
}
