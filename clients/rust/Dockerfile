# checkov:skip=CKV_DOCKER_2:This example runs one operation and reports success through its exit status.
FROM rust:1.98.1-trixie AS build
WORKDIR /src
COPY rust-toolchain.toml ./
COPY clients/rust/ ./
RUN cargo build --locked --release --features alloy --example balance

FROM gcr.io/distroless/cc-debian13:nonroot@sha256:83b9b50586253821cf63ffcec87d3d94265a093ad30da232039af962dd8f4edf
ARG RUNTIME_UID=10000
ARG RUNTIME_GID=10001
COPY --from=build /src/target/release/examples/balance /usr/local/bin/balance
WORKDIR /config
USER ${RUNTIME_UID}:${RUNTIME_GID}
ENTRYPOINT ["balance"]
