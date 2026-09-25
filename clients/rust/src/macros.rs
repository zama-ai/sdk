macro_rules! rpc {
    ($sdk:expr, $method:ident, $request:ident { $($fields:tt)* }) => {
        async {
            let sdk = $sdk;
            let operation = sdk.operation();
            let request = crate::generated::$request {
                operation: Some(operation.message.clone()),
                $($fields)*
            };
            let result = sdk
                .client
                .unary(request, |mut client, request| async move { client.$method(request).await })
                .await;
            drop(operation);
            result
        }
    };
}
