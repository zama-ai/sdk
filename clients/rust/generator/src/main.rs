fn main() -> Result<(), Box<dyn std::error::Error>> {
    let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let proto = directory.join("../../../proto");
    let mut prost = prost_build::Config::new();
    prost.protoc_executable(protoc_bin_vendored::protoc_bin_path()?);
    tonic_prost_build::configure()
        .build_server(false)
        .out_dir(directory.join("../src"))
        .compile_with_config(
            prost,
            &[proto.join("zama/sdk/v1alpha1/sidecar.proto")],
            &[proto],
        )?;
    Ok(())
}
