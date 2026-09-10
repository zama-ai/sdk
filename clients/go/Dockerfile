# checkov:skip=CKV_DOCKER_2:This example runs one operation and reports success through its exit status.
FROM golang:1.27.1-bookworm AS build
WORKDIR /src
COPY clients/go/go.mod clients/go/go.sum ./
RUN go mod download
COPY clients/go/examples/balance/go.mod clients/go/examples/balance/go.sum ./examples/balance/
RUN cd examples/balance && go mod download
COPY clients/go/ ./
WORKDIR /src/examples/balance
RUN CGO_ENABLED=0 go build -trimpath -o /balance .

FROM scratch
ARG RUNTIME_UID=1000
ARG RUNTIME_GID=1000
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /balance /usr/local/bin/balance
USER ${RUNTIME_UID}:${RUNTIME_GID}
ENTRYPOINT ["balance", "/run/zama/sdk.sock", "/config/.env.sidecar.local"]
