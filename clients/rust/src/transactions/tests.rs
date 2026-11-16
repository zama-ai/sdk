use super::*;

fn write(value: Option<&str>, gas: Option<&str>) -> generated::ContractWriteRequest {
    generated::ContractWriteRequest {
        address: vec![2; 20],
        data: vec![0; 4],
        abi_json: "[]".into(),
        function_name: "call".into(),
        args_json: "[]".into(),
        value: value.map(Into::into),
        gas: gas.map(Into::into),
    }
}

fn decode_write(write: generated::ContractWriteRequest) -> Result<ContractWriteRequest, SdkError> {
    ContractWriteRequest::from_wire(
        "operation".into(),
        "write".into(),
        WalletAccount {
            address: Address::repeat_byte(1),
            chain_id: 1,
        },
        write,
    )
}

fn decode(value: Option<&str>, gas: Option<&str>) -> Result<ContractWriteRequest, SdkError> {
    decode_write(write(value, gas))
}

#[test]
fn rejects_malformed_write_fields() {
    type Mutation = fn(&mut generated::ContractWriteRequest);
    let cases: [(Mutation, &str); 9] = [
        (
            |w| w.address = vec![2; 19],
            "invalid contract write address",
        ),
        (|w| w.data = vec![], "invalid contract write data"),
        (|w| w.data = vec![0; 3], "invalid contract write data"),
        (
            |w| w.function_name = String::new(),
            "invalid contract write function name",
        ),
        (|w| w.abi_json = "{}".into(), "invalid contract write ABI"),
        (
            |w| w.abi_json = "not json".into(),
            "invalid contract write ABI",
        ),
        (|w| w.args_json = "{}".into(), "invalid contract write args"),
        (|w| w.args_json = "[".into(), "invalid contract write args"),
        (
            |w| w.args_json = "null".into(),
            "invalid contract write args",
        ),
    ];
    for (mutate, detail) in cases {
        let mut request = write(None, None);
        mutate(&mut request);
        let error = decode_write(request).unwrap_err();
        assert_eq!(error.code, "SIGNING_FAILED");
        assert_eq!(error.message, detail);
    }
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
        (Some("-1"), None, "invalid canonical transaction value"),
        (None, Some("-1"), "invalid canonical transaction gas"),
        (Some("+1"), None, "invalid canonical transaction value"),
        (Some(""), None, "invalid canonical transaction value"),
        (Some("0x1"), None, "invalid canonical transaction value"),
        (Some(" 1"), None, "invalid canonical transaction value"),
        (Some("01"), None, "invalid canonical transaction value"),
        (None, Some("00"), "invalid canonical transaction gas"),
        (Some(over_u256), None, "transaction value must fit uint256"),
        (
            None,
            Some("18446744073709551616"),
            "transaction gas must fit uint64",
        ),
    ] {
        let error = decode(value, gas).unwrap_err();
        assert_eq!(error.code, "SIGNING_FAILED");
        assert_eq!(error.message, detail);
    }
}
