#!/usr/bin/env bash
# Deploy the @fhevm/sdk cleartext FHEVM host stack to a running anvil.
#
# Usage: ./deploy-cleartext-host.sh <rpc-url>
#
# This replaces forge-fhevm's deploy-local.sh. @fhevm/sdk's cleartext mode
# (createFhevmCleartextClient) calls an on-chain `inputProof(...)` view on the
# InputVerifier to obtain (digest, signers, threshold), then signs locally with
# the coprocessor keys it derives from FHEVM_TEST_MNEMONIC. forge-fhevm ships a
# different, incompatible cleartext model (CleartextFHEVMExecutor.plaintexts,
# no inputProof view), so we deploy the cleartext stack from the zama-ai/fhevm
# monorepo instead. It upgrades each host proxy to a Cleartext implementation:
# CleartextInputVerifier (adds inputProof), CleartextFHEVMExecutor/ACL/KMS/HCU.
#
# The env block below mirrors the canonical defaults in
# contracts/lib/fhevm/sdk/js-sdk/contracts/script/fhevm-deploy.sh. The
# coprocessor/KMS mnemonic + derivation paths MUST match @fhevm/sdk's
# signers.ts (FHEVM_TEST_MNEMONIC, coprocessor path 0'/2/, kms path 0'/3/) so
# the signatures the SDK produces verify on-chain.
#
# v0.12.0 is pinned because its compiled-in FHEVMHostAddresses match the
# `hardhat` chain preset (acl/executor/kms/inputVerifier), so the stack lands at
# the addresses the SDK is configured with.
set -euo pipefail

RPC_URL="${1:?Usage: deploy-cleartext-host.sh <rpc-url>}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FHEVM_CONTRACTS_DIR="$(cd "$SCRIPT_DIR/../../contracts/lib/fhevm/sdk/js-sdk/contracts" && pwd)"

# Canonical test mnemonics — see fhevm-deploy.sh. The host-contracts mnemonic
# drives the deployer/proxy-owner/pausers; the test mnemonic drives the
# coprocessor + KMS signer sets that @fhevm/sdk signs with.
FHEVM_TEST_MNEMONIC="test test test test test test test future home engine virtual motion"
FHEVM_HOST_MNEMONIC="adapt mosquito move limb mobile illegal tree voyage juice mosquito burger raise father hope layer"

FORGE_ENV=(
  "FOUNDRY_PROFILE=v12"
  "DEPLOYER_MNEMONIC=${FHEVM_HOST_MNEMONIC}"
  "DEPLOYER_MNEMONIC_INDEX=5"
  "EMPTY_UUPS_MNEMONIC=${FHEVM_HOST_MNEMONIC}"
  "EMPTY_UUPS_MNEMONIC_INDEX=100"
  "CHAIN_ID_GATEWAY=654321"
  "NUM_KMS_NODES=4"
  "KMS_NODES_TX_SENDER_MNEMONIC=${FHEVM_TEST_MNEMONIC}"
  "KMS_NODES_TX_SENDER_MNEMONIC_PATH=m/44'/60'/0'/4/"
  "KMS_NODES_TX_SENDER_MNEMONIC_INDEX=0"
  "KMS_NODES_MNEMONIC=${FHEVM_TEST_MNEMONIC}"
  "KMS_NODES_MNEMONIC_PATH=m/44'/60'/0'/3/"
  "KMS_NODES_MNEMONIC_INDEX=0"
  "NUM_COPROCESSORS=4"
  "COPROCESSORS_MNEMONIC=${FHEVM_TEST_MNEMONIC}"
  "COPROCESSORS_MNEMONIC_PATH=m/44'/60'/0'/2/"
  "COPROCESSORS_MNEMONIC_INDEX=0"
  "PUBLIC_DECRYPTION_THRESHOLD=1"
  "COPROCESSOR_THRESHOLD=1"
  "HCU_CAP_PER_BLOCK=281474976710655"
  "MAX_HCU_DEPTH_PER_TX=5000000"
  "MAX_HCU_PER_TX=20000000"
  "NUM_PAUSERS=2"
  "PAUSERS_MNEMONIC=${FHEVM_HOST_MNEMONIC}"
  "PAUSERS_MNEMONIC_INDEX=2"
  "DECRYPTION_ADDRESS=0xEaaA2FC6BC259dF015Aa7Dc8e59e0B67df622721"
  "INPUT_VERIFICATION_ADDRESS=0x6189F6c0c3E40B4a3c72ec86262295D78d845297"
)

DEPLOY_SCRIPT="script/v0.12.0/DeployCleartextFHEVMHost.s.sol"

cd "$FHEVM_CONTRACTS_DIR"

# The deployer + emptyUupsDeployer broadcast the host stack; fund them on anvil
# (anvil_setBalance). The Cleartext implementations deploy to fixed, compiled-in
# addresses, so this is deterministic and parallel-safe across anvil instances.
signers_json="$(
  env "${FORGE_ENV[@]}" forge script "${DEPLOY_SCRIPT}:PrintFhevmSigners" \
    --rpc-url "$RPC_URL" --non-interactive 2>&1 |
    awk '/JSON_RESULT_START/{c=1;next}/JSON_RESULT_END/{c=0}c'
)"
deployer="$(jq -r '.deployer.address' <<<"$signers_json")"
empty_uups="$(jq -r '.emptyUupsDeployer.address' <<<"$signers_json")"

# 10_000 ETH in wei (hex), matching fhevm-deploy.sh's default_anvil_balance.
balance_hex=0x21e19e0c9bab2400000
cast rpc anvil_setBalance "$deployer" "$balance_hex" --rpc-url "$RPC_URL" >/dev/null
if [ "$empty_uups" != "0x0000000000000000000000000000000000000000" ]; then
  cast rpc anvil_setBalance "$empty_uups" "$balance_hex" --rpc-url "$RPC_URL" >/dev/null
fi

env "${FORGE_ENV[@]}" forge script "${DEPLOY_SCRIPT}:Deploy" \
  --rpc-url "$RPC_URL" --broadcast --non-interactive
