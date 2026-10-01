use super::*;

fn decode(value: Option<&str>, gas: Option<&str>) -> Result<ContractWriteRequest, SdkError> {
    ContractWriteRequest::from_wire(
        "operation".into(),
        "write".into(),
        WalletAccount {
            address: Address::repeat_byte(1),
            chain_id: 1,
        },
        generated::ContractWriteRequest {
            address: vec![2; 20],
            data: vec![],
            abi_json: "[]".into(),
            function_name: "call".into(),
            args_json: "[]".into(),
            value: value.map(Into::into),
            gas: gas.map(Into::into),
        },
    )
}

#[test]
fn decodes_canonical_quantities_at_their_bounds() {
    let max = U256::MAX.to_string();
    let request = decode(Some(&max), Some("18446744073709551615")).unwrap();
    assert_eq!(request.value, Some(U256::MAX));
    assert_eq!(request.gas, Some(u64::MAX));
    let request = decode(Some("0"), Some("0")).unwrap();
    assert_eq!(request.value, Some(U256::ZERO));
    assert_eq!(request.gas, Some(0));
    let request = decode(None, None).unwrap();
    assert_eq!((request.value, request.gas), (None, None));
}

#[test]
fn rejects_negative_noncanonical_and_overflowing_quantities() {
    let over_u256 =
        "115792089237316195423570985008687907853269984665640564039457584007913129639936";
    for (value, gas, detail) in [
        (Some("-1"), None, "invalid transaction integer"),
        (None, Some("-1"), "invalid transaction integer"),
        (Some("+1"), None, "invalid transaction integer"),
        (Some(""), None, "invalid transaction integer"),
        (Some("0x1"), None, "invalid transaction integer"),
        (Some(" 1"), None, "invalid transaction integer"),
        (Some("01"), None, "noncanonical transaction integer"),
        (None, Some("00"), "noncanonical transaction integer"),
        (Some(over_u256), None, "transaction value must fit uint256"),
        (
            None,
            Some("18446744073709551616"),
            "transaction gas must fit uint64",
        ),
    ] {
        let error = decode(value, gas).unwrap_err();
        assert_eq!(error.code, "SIGNING_FAILED");
        assert_eq!(
            error.message,
            format!("Invalid contract write request: {detail}")
        );
    }
}
