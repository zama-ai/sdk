fn main() -> Result<(), Box<dyn std::error::Error>> {
    let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let proto = directory.join("../../../proto");
    let generated = directory.join("../src/generated");
    std::fs::create_dir_all(&generated)?;
    let mut prost = prost_build::Config::new();
    prost.boxed(".zama.sdk.v1alpha1.EventDelivery.payload.event");
    prost.protoc_executable(protoc_bin_vendored::protoc_bin_path()?);
    tonic_prost_build::configure()
        .build_server(false)
        .out_dir(generated)
        .compile_with_config(
            prost,
            &[proto.join("zama/sdk/v1alpha1/sidecar.proto")],
            &[proto],
        )?;
    Ok(())
}
