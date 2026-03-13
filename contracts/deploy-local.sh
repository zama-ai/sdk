#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-8545}"
RPC_URL="http://127.0.0.1:$PORT"

# Anvil account #0
DEPLOYER_PRIVATE_KEY="${DEPLOYER_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"

echo "==> Deploying fhevm host stack..."
(
  cd "$SCRIPT_DIR/lib/forge-fhevm"
  DEPLOYER_PRIVATE_KEY="$DEPLOYER_PRIVATE_KEY" \
  RPC_URL="$RPC_URL" \
  DECRYPTION_ADDRESS="0x5ffdaAB0373E62E2ea2944776209aEf29E631A64" \
  INPUT_VERIFICATION_ADDRESS="0x812b06e1CDCE800494b79fFE4f925A504a9A9810" \
  CHAIN_ID_GATEWAY="10901" \
  KMS_SIGNER_PRIVATE_KEY_0="0x388b7680e4e1afa06efbfd45cdd1fe39f3c6af381df6555a19661f283b97de91" \
  PUBLIC_DECRYPTION_THRESHOLD="1" \
  COPROCESSOR_SIGNER_PRIVATE_KEY_0="0x7ec8ada6642fc4ccfb7729bc29c17cf8d21b61abd5642d1db992c0b8672ab901" \
  COPROCESSOR_THRESHOLD="1" \
  ./deploy-local.sh
)

echo "==> Deploying test contracts..."
cd "$SCRIPT_DIR"
forge script script/Deploy.s.sol \
  --rpc-url "$RPC_URL" \
  --broadcast \
  --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --private-key "$DEPLOYER_PRIVATE_KEY"

echo "==> Done. Addresses written to deployments.json"
