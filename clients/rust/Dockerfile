# checkov:skip=CKV_DOCKER_2:This example runs one operation and reports success through its exit status.
FROM rust:1.98.0-bookworm AS build
WORKDIR /src
COPY rust-toolchain.toml ./
COPY clients/rust/ ./
RUN cargo build --locked --release --features alloy --example balance

FROM gcr.io/distroless/cc-debian13:nonroot@sha256:c31ff9abcb1910f3ab25c7957bdaf0bfe12a01eb546e8df2282f1c8f682b606c
ARG RUNTIME_UID=1000
ARG RUNTIME_GID=1000
COPY --from=build /src/target/release/examples/balance /usr/local/bin/balance
WORKDIR /config
USER ${RUNTIME_UID}:${RUNTIME_GID}
ENTRYPOINT ["balance"]
