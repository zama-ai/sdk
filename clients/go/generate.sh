#!/bin/sh
set -eu
cd "$(dirname "$0")"
mkdir -p .tools/bin gen
GOBIN="$PWD/.tools/bin" go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.12
GOBIN="$PWD/.tools/bin" go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.6.2
cd ../..
./node_modules/.bin/buf generate --template clients/go/buf.gen.yaml
