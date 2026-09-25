//! Tests that drive the whole Sdk against the in-process mock sidecar; unit tests for a single module stay next to that module.
mod support;

use support::*;

mod config;
mod context;
mod decryption;
mod delegation;
mod encryption;
mod event;
mod lifecycle;
mod offline;
mod signer_channel;
mod storage;
